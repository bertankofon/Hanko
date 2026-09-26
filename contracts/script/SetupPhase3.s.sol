// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {EnsAllowlistChecker, IEnsRegistry} from "../src/EnsAllowlistChecker.sol";
import {HankoEnv} from "./HankoEnv.sol";

interface IETHRegistrar {
    function commit(bytes32 commitment) external;
    function makeCommitment(
        string calldata label,
        address owner,
        bytes32 secret,
        address subregistry,
        address resolver,
        uint64 duration,
        bytes32 referrer
    ) external pure returns (bytes32);
    function register(
        string calldata label,
        address owner,
        bytes32 secret,
        address subregistry,
        address resolver,
        uint64 duration,
        address paymentToken,
        bytes32 referrer
    ) external returns (uint256 tokenId);
    function getRegisterPrice(string calldata label, uint64 duration, address paymentToken)
        external
        view
        returns (uint256 base, uint256 premium);
    function isAvailable(string calldata label) external view returns (bool);
}

interface IEthRegistry {
    function findTokenId(string calldata label) external view returns (uint256);
    function setSubregistry(uint256 anyId, address registry) external;
}

interface IVerifiableFactory {
    function deployProxy(address implementation, uint256 salt, bytes calldata data)
        external
        returns (address);
}

interface IUserRegistry {
    struct Grant {
        address account;
        uint256 roleBitmap;
    }

    function initialize(Grant[] calldata grants) external;
    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256);
    function setParent(address parent, string calldata label) external;
    function findOwner(string calldata label) external view returns (address);
}

interface IMintableUSDC {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @title SetupPhase3
/// @notice Moves the allowlist from a mapping into ENSv2.
///
/// @dev Shape of the tree this builds:
///
///        .eth                    (ETHRegistry, pinned)
///          └── tnvda             (our name, held by the venue operator)
///                ├── swap        → swap registry: a name here means "may swap"
///                └── lp          → lp registry:   a name here means "may provide liquidity"
///                      └── 0x053674…  (Alice's own address as the label)
///
///      Registering `tnvda.eth` is commit/reveal with a 60 second minimum between the two, and
///      `forge script` broadcasts a run's transactions back to back, so the two halves are
///      separate entry points:
///
///        forge script script/SetupPhase3.s.sol --sig "commitName()" --rpc-url sepolia --broadcast
///        sleep 75
///        forge script script/SetupPhase3.s.sol --rpc-url sepolia --broadcast
contract SetupPhase3 is Script, HankoEnv {
    using stdJson for string;

    /// @dev Registry roles, from ensdomains/contracts-v2 `RegistryRolesLib`.
    uint256 internal constant ROLE_REGISTRAR = 1 << 0;
    uint256 internal constant ROLE_SET_PARENT = 1 << 8;
    uint256 internal constant ROLE_UNREGISTER = 1 << 12;
    uint256 internal constant ROLE_RENEW = 1 << 16;
    uint256 internal constant ROLE_SET_SUBREGISTRY = 1 << 20;
    uint256 internal constant ROLE_SET_RESOLVER = 1 << 24;

    /// @dev Each role's admin counterpart sits 128 bits higher; granting both lets the holder
    ///      hand the role on, which Phase 4 needs when the attester takes over registration.
    uint256 internal constant OPERATOR_ROLES = ROLE_REGISTRAR | ROLE_SET_PARENT | ROLE_UNREGISTER
        | ROLE_RENEW | ROLE_SET_SUBREGISTRY | ROLE_SET_RESOLVER;
    uint256 internal constant OPERATOR_ROLES_WITH_ADMIN = OPERATOR_ROLES | (OPERATOR_ROLES << 128);

    string internal constant LABEL = "tnvda";
    uint64 internal constant REGISTRATION_DURATION = 365 days;

    /// @dev A demo deployment on a testnet for an eight dollar name. A real registration would use
    ///      a random secret kept off chain; front-running this one costs more than it gains.
    bytes32 internal constant SECRET = keccak256("hanko-tnvda-2026");

    /// @dev Short on purpose. The demo shows a permission lapsing on its own, and nobody will
    ///      watch a year go by.
    uint64 internal constant MEMBER_TTL = 2 hours;

    function commitName() external {
        Env memory e = readEnv();
        address registrar = ensAddress(".ens.ETHRegistrar");

        if (!IETHRegistrar(registrar).isAvailable(LABEL)) {
            console.log("tnvda.eth is already taken; nothing to commit");
            return;
        }

        bytes32 commitment = IETHRegistrar(registrar).makeCommitment(
            LABEL, e.issuer, SECRET, address(0), address(0), REGISTRATION_DURATION, bytes32(0)
        );

        vm.startBroadcast(e.deployerKey);
        IETHRegistrar(registrar).commit(commitment);
        vm.stopBroadcast();

        console.log("committed. wait at least 60s, then run without --sig");
    }

    function run() external {
        Env memory e = readEnv();
        address registrar = ensAddress(".ens.ETHRegistrar");
        address ethRegistry = ensAddress(".ens.ETHRegistry");
        address factory = ensAddress(".ens.VerifiableFactory");
        address impl = ensAddress(".ens.UserRegistryImpl");
        address ensUsdc = ensAddress(".ens.MockUSDC");

        vm.startBroadcast(e.deployerKey);

        // Three registries: one for the name itself, one per permission.
        address tnvdaRegistry = deployRegistry(factory, impl, e.issuer, 1);
        address swapRegistry = deployRegistry(factory, impl, e.issuer, 2);
        address lpRegistry = deployRegistry(factory, impl, e.issuer, 3);

        if (IETHRegistrar(registrar).isAvailable(LABEL)) {
            registerName(registrar, ensUsdc, e.issuer);
        } else {
            console.log("tnvda.eth already registered; reusing it");
        }

        // The commitment binds the subregistry, and ours does not exist until this run, so the
        // name is claimed bare and pointed at its registry immediately afterwards. The issuer
        // owns the name, so it already holds ROLE_SET_SUBREGISTRY on that token.
        IEthRegistry(ethRegistry).setSubregistry(
            IEthRegistry(ethRegistry).findTokenId(LABEL), tnvdaRegistry
        );

        // swap.tnvda.eth and lp.tnvda.eth, each pointing at its own registry.
        IUserRegistry(tnvdaRegistry).register(
            "swap", e.issuer, swapRegistry, address(0), OPERATOR_ROLES_WITH_ADMIN, type(uint64).max
        );
        IUserRegistry(tnvdaRegistry).register(
            "lp", e.issuer, lpRegistry, address(0), OPERATOR_ROLES_WITH_ADMIN, type(uint64).max
        );

        // Back-links, so a name can be resolved upwards as well as down.
        IUserRegistry(tnvdaRegistry).setParent(ethRegistry, LABEL);
        IUserRegistry(swapRegistry).setParent(tnvdaRegistry, "swap");
        IUserRegistry(lpRegistry).setParent(tnvdaRegistry, "lp");

        EnsAllowlistChecker checker =
            new EnsAllowlistChecker(IEnsRegistry(swapRegistry), IEnsRegistry(lpRegistry));

        // Alice, and the issuer so it can keep seeding the pool. Role bitmap 0 is the point: no
        // transfer role means the permission cannot be sold on.
        uint64 expiry = uint64(block.timestamp) + MEMBER_TTL;
        admit(swapRegistry, e.alice, expiry);
        admit(lpRegistry, e.alice, expiry);
        admit(swapRegistry, e.issuer, type(uint64).max);
        admit(lpRegistry, e.issuer, type(uint64).max);

        vm.stopBroadcast();

        record(tnvdaRegistry, swapRegistry, lpRegistry, address(checker));
    }

    function deployRegistry(address factory, address impl, address operator, uint256 salt)
        internal
        returns (address)
    {
        IUserRegistry.Grant[] memory grants = new IUserRegistry.Grant[](1);
        grants[0] = IUserRegistry.Grant({account: operator, roleBitmap: OPERATOR_ROLES_WITH_ADMIN});

        bytes memory data = abi.encodeCall(IUserRegistry.initialize, (grants));
        return IVerifiableFactory(factory).deployProxy(impl, salt, data);
    }

    function registerName(address registrar, address ensUsdc, address owner) internal {
        (uint256 base, uint256 premium) =
            IETHRegistrar(registrar).getRegisterPrice(LABEL, REGISTRATION_DURATION, ensUsdc);
        uint256 price = base + premium;

        // ENS's own faucet token pays the rent; it mints to anyone on this testnet.
        IMintableUSDC(ensUsdc).mint(owner, price);
        IMintableUSDC(ensUsdc).approve(registrar, price);

        IETHRegistrar(registrar).register(
            LABEL, owner, SECRET, address(0), address(0), REGISTRATION_DURATION, ensUsdc, bytes32(0)
        );
        console.log("registered tnvda.eth for", price, "ENS-USDC units");
    }

    /// @dev `roleBitmap = 0`: the holder owns the name and nothing else. No transfer, no renewal,
    ///      no subregistry of their own — until Phase 6 hands agents exactly one of those.
    function admit(address registry, address account, uint64 expiry) internal {
        string memory label = labelFor(account);
        IUserRegistry(registry).register(label, account, address(0), address(0), 0, expiry);
    }

    /// @dev Mirrors `EnsAllowlistChecker.labelFor`; the two must agree or nothing resolves.
    function labelFor(address account) internal pure returns (string memory) {
        bytes16 hexDigits = "0123456789abcdef";
        bytes memory out = new bytes(42);
        out[0] = "0";
        out[1] = "x";
        uint160 value = uint160(account);
        for (uint256 i = 41; i > 1; --i) {
            out[i] = hexDigits[value & 0xf];
            value >>= 4;
        }
        return string(out);
    }

    function ensAddress(string memory path) internal view returns (address) {
        return vm.readFile(deploymentsPath()).readAddress(path);
    }

    function record(address tnvdaRegistry, address swapRegistry, address lpRegistry, address checker)
        internal
    {
        string memory path = deploymentsPath();
        vm.writeJson(vm.toString(tnvdaRegistry), path, ".hanko.TnvdaRegistry");
        vm.writeJson(vm.toString(swapRegistry), path, ".hanko.SwapRegistry");
        vm.writeJson(vm.toString(lpRegistry), path, ".hanko.LpRegistry");
        vm.writeJson(vm.toString(checker), path, ".hanko.EnsAllowlistChecker");

        console.log("tnvda.eth registry  ", tnvdaRegistry);
        console.log("swap.tnvda.eth      ", swapRegistry);
        console.log("lp.tnvda.eth        ", lpRegistry);
        console.log("EnsAllowlistChecker ", checker);
    }
}
