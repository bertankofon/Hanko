// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
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
    function setSubregistry(uint256 tokenId, address registry) external;
}

interface IVerifiableFactory {
    function deployProxy(address implementation, uint256 salt, bytes calldata data) external returns (address);
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
    function findTokenId(string calldata label) external view returns (uint256);
    function unregister(uint256 tokenId) external;
    function getParent() external view returns (address parent, string memory label);
}

interface IMintableUSDC {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @title MoveRootToHanko
/// @notice Re-homes the venue's permission registries from `tnvda.eth` to `hanko.eth`.
///
/// @dev Once the venue lists more than one symbol, a root named after one of them reads wrong. The
///      exemption describes clearance as a property of the person and of the *venue* — "standards
///      for persons to access trading" — so the root is the venue's name, not an asset's.
///
///      Nothing is rebuilt. The swap, lp and agent registries are the same contracts as before, so
///      every name already inside them survives, and `EnsAllowlistChecker`'s immutable pointers
///      keep working untouched. Only the parent changes:
///
///        before:  swap.tnvda.eth  →  SwapRegistry
///        after:   swap.hanko.eth  →  SwapRegistry   (same address)
///
///      Two halves, because the ETHRegistrar's commit/reveal needs 60 seconds between them and
///      `forge script` broadcasts a run back to back:
///
///        forge script script/MoveRootToHanko.s.sol --sig "commitName()" --rpc-url sepolia --broadcast
///        sleep 75
///        forge script script/MoveRootToHanko.s.sol --rpc-url sepolia --broadcast --slow
contract MoveRootToHanko is Script, HankoEnv {
    using stdJson for string;

    uint256 internal constant ROLE_REGISTRAR = 1 << 0;
    uint256 internal constant ROLE_SET_PARENT = 1 << 8;
    uint256 internal constant ROLE_UNREGISTER = 1 << 12;
    uint256 internal constant ROLE_RENEW = 1 << 16;
    uint256 internal constant ROLE_SET_SUBREGISTRY = 1 << 20;
    uint256 internal constant ROLE_SET_RESOLVER = 1 << 24;

    uint256 internal constant OPERATOR_ROLES =
        ROLE_REGISTRAR | ROLE_SET_PARENT | ROLE_UNREGISTER | ROLE_RENEW | ROLE_SET_SUBREGISTRY | ROLE_SET_RESOLVER;
    uint256 internal constant OPERATOR_ROLES_WITH_ADMIN = OPERATOR_ROLES | (OPERATOR_ROLES << 128);

    string internal constant LABEL = "hanko";
    string internal constant OLD_LABEL = "tnvda";
    uint64 internal constant REGISTRATION_DURATION = 365 days;
    bytes32 internal constant SECRET = keccak256("hanko-venue-root-2026");

    function commitName() external {
        Env memory e = readEnv();
        address registrar = ensAddress(".ens.ETHRegistrar");

        if (!IETHRegistrar(registrar).isAvailable(LABEL)) {
            console.log("hanko.eth is already taken; nothing to commit");
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
        string memory json = vm.readFile(deploymentsPath());

        address registrar = ensAddress(".ens.ETHRegistrar");
        address ethRegistry = ensAddress(".ens.ETHRegistry");
        address swapRegistry = json.readAddress(".hanko.SwapRegistry");
        address lpRegistry = json.readAddress(".hanko.LpRegistry");
        address agentIndex = json.readAddress(".hanko.AgentIndex");

        vm.startBroadcast(e.deployerKey);

        address hankoRegistry = deployRegistry(e.issuer);

        if (IETHRegistrar(registrar).isAvailable(LABEL)) {
            registerName(registrar, ensAddress(".ens.MockUSDC"), e.issuer);
        } else {
            console.log("hanko.eth already registered; reusing it");
        }

        // The commitment binds the subregistry and ours does not exist until this run, so the name
        // is claimed bare and pointed at its registry straight afterwards.
        IEthRegistry(ethRegistry).setSubregistry(IEthRegistry(ethRegistry).findTokenId(LABEL), hankoRegistry);

        attach(hankoRegistry, "swap", swapRegistry, e.issuer);
        attach(hankoRegistry, "lp", lpRegistry, e.issuer);
        attach(hankoRegistry, "agents", agentIndex, e.issuer);

        IUserRegistry(hankoRegistry).setParent(ethRegistry, LABEL);

        // Drop the old entries so the three registries have one home, not two. The names inside
        // them are untouched; only `swap.tnvda.eth` and its siblings stop resolving.
        address oldRoot = readAddressOrZero(json, ".hanko.TnvdaRegistry");
        if (oldRoot != address(0)) {
            detach(oldRoot, "swap");
            detach(oldRoot, "lp");
            detach(oldRoot, "agents");
        }

        vm.stopBroadcast();

        vm.writeJson(vm.toString(hankoRegistry), deploymentsPath(), ".hanko.VenueRegistry");
        console.log("hanko.eth registry ", hankoRegistry);
        console.log("swap.hanko.eth     ", swapRegistry);
        console.log("lp.hanko.eth       ", lpRegistry);
        console.log("agents.hanko.eth   ", agentIndex);
    }

    /// @dev Points a label in the new root at an existing registry, then tells that registry where
    ///      it now hangs. `setParent` is what `getParent()` reads, and the agent lookup walks it —
    ///      forgetting it makes the whole delegation chain resolve to nothing, silently.
    function attach(address root, string memory label, address registry, address owner) internal {
        if (IUserRegistry(root).findOwner(label) == address(0)) {
            IUserRegistry(root).register(
                label, owner, registry, address(0), OPERATOR_ROLES_WITH_ADMIN, type(uint64).max
            );
        }
        IUserRegistry(registry).setParent(root, label);
    }

    function detach(address root, string memory label) internal {
        if (IUserRegistry(root).findOwner(label) == address(0)) return;
        IUserRegistry(root).unregister(IUserRegistry(root).findTokenId(label));
        console.log("removed from tnvda.eth:", label);
    }

    function deployRegistry(address operator) internal returns (address) {
        IUserRegistry.Grant[] memory grants = new IUserRegistry.Grant[](1);
        grants[0] = IUserRegistry.Grant({account: operator, roleBitmap: OPERATOR_ROLES_WITH_ADMIN});

        return IVerifiableFactory(ensAddress(".ens.VerifiableFactory")).deployProxy(
            ensAddress(".ens.UserRegistryImpl"), uint256(keccak256("hanko-venue-root")), abi.encodeCall(IUserRegistry.initialize, (grants))
        );
    }

    function registerName(address registrar, address ensUsdc, address owner) internal {
        (uint256 base, uint256 premium) =
            IETHRegistrar(registrar).getRegisterPrice(LABEL, REGISTRATION_DURATION, ensUsdc);
        uint256 price = base + premium;

        IMintableUSDC(ensUsdc).mint(owner, price);
        IMintableUSDC(ensUsdc).approve(registrar, price);

        IETHRegistrar(registrar).register(
            LABEL, owner, SECRET, address(0), address(0), REGISTRATION_DURATION, ensUsdc, bytes32(0)
        );
        console.log("registered hanko.eth for", price, "ENS-USDC units");
    }

    function ensAddress(string memory path) internal view returns (address) {
        return vm.readFile(deploymentsPath()).readAddress(path);
    }
}
