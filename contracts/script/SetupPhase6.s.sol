// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {EnsAllowlistChecker, IEnsRegistry} from "../src/EnsAllowlistChecker.sol";
import {HankoEnv} from "./HankoEnv.sol";

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
    function unregister(uint256 tokenId) external;
    function setParent(address parent, string calldata label) external;
    function setSubregistry(uint256 anyId, address registry) external;
    function grantRoles(uint256 anyId, uint256 roleBitmap, address account) external returns (bool);
    function findOwner(string calldata label) external view returns (address);
    function findTokenId(string calldata label) external view returns (uint256);
    function findExpiry(string calldata label) external view returns (uint64);
    function getSubregistry(string calldata label) external view returns (address);
    function getResolver(string calldata label) external view returns (address);
    function setResolver(uint256 anyId, address resolver) external;
}

/// @title SetupPhase6
/// @notice Adds agent delegation: `agents.tnvda.eth`, a registry of the investor's own, and the
///         checker that resolves an agent back to its principal.
///
/// @dev The shape this builds:
///
///        swap.tnvda.eth
///        └── 0x053674…                      Alice's name
///              └── 0xC408d4…                the bot, inside Alice's own registry
///
///        agents.tnvda.eth
///        └── 0xC408d4…  → Alice's registry   the pointer that makes the bot findable
///
///      Uniswap hands the checker an address and nothing else, so the pointer is what turns that
///      address into a principal. It grants nothing on its own: an agent listed there with no name
///      inside the principal's registry has no permission, and only the principal can grant that
///      name. Revoking the principal makes ENS stop resolving their registry, and the agent stops
///      trading in the same transaction.
///
///      Usage:
///        forge script script/SetupPhase6.s.sol --rpc-url sepolia --broadcast --slow
///        forge script script/SetupPhase6.s.sol --sig "delegate()" --rpc-url sepolia --broadcast --slow
///        forge script script/SetupPhase6.s.sol --sig "undelegate()" --rpc-url sepolia --broadcast --slow
contract SetupPhase6 is Script, HankoEnv {
    using stdJson for string;

    uint256 internal constant ROLE_SET_SUBREGISTRY = 1 << 20;

    uint256 internal constant OPERATOR_ROLES = (1 << 0) | (1 << 8) | (1 << 12) | (1 << 16) | (1 << 20) | (1 << 24);
    uint256 internal constant OPERATOR_ROLES_WITH_ADMIN = OPERATOR_ROLES | (OPERATOR_ROLES << 128);

    /// @notice Deploys the agent index and a checker that understands delegation.
    function run() external {
        Env memory e = readEnv();
        string memory json = vm.readFile(deploymentsPath());

        address factory = json.readAddress(".ens.VerifiableFactory");
        address impl = json.readAddress(".ens.UserRegistryImpl");
        address tnvdaRegistry = json.readAddress(".hanko.TnvdaRegistry");
        address swapRegistry = json.readAddress(".hanko.SwapRegistry");
        address lpRegistry = json.readAddress(".hanko.LpRegistry");

        vm.startBroadcast(e.deployerKey);

        address agentIndex = readAddressOrZero(json, ".hanko.AgentIndex");
        if (agentIndex == address(0)) {
            agentIndex = deployRegistry(factory, impl, e.issuer, 4);
            IUserRegistry(tnvdaRegistry).register(
                "agents", e.issuer, agentIndex, address(0), OPERATOR_ROLES_WITH_ADMIN, type(uint64).max
            );
            IUserRegistry(agentIndex).setParent(tnvdaRegistry, "agents");
        }

        EnsAllowlistChecker checker = new EnsAllowlistChecker(
            IEnsRegistry(swapRegistry), IEnsRegistry(lpRegistry), IEnsRegistry(agentIndex)
        );

        vm.stopBroadcast();

        string memory path = deploymentsPath();
        vm.writeJson(vm.toString(agentIndex), path, ".hanko.AgentIndex");
        vm.writeJson(vm.toString(address(checker)), path, ".hanko.EnsAllowlistChecker");

        console.log("agents.tnvda.eth    ", agentIndex);
        console.log("EnsAllowlistChecker ", address(checker));
        console.log("now run SwitchChecker --sig toEns() to point the pool at it");
    }

    /// @notice Alice delegates trading to the bot. Idempotent.
    function delegate() external {
        Env memory e = readEnv();
        string memory json = vm.readFile(deploymentsPath());
        address swapRegistry = json.readAddress(".hanko.SwapRegistry");
        address agentIndex = json.readAddress(".hanko.AgentIndex");
        uint256 aliceKey = key_("ACTOR_ALICE_PK");

        string memory aliceLabel = labelFor(e.alice);
        string memory botLabel = labelFor(e.bot);

        // The principal's registry hangs under their own name; deploy it once.
        address aliceRegistry = IUserRegistry(swapRegistry).getSubregistry(aliceLabel);
        uint64 expiry = IUserRegistry(swapRegistry).findExpiry(aliceLabel);

        if (aliceRegistry == address(0)) {
            vm.startBroadcast(e.deployerKey);
            aliceRegistry = deployRegistry(
                json.readAddress(".ens.VerifiableFactory"), json.readAddress(".ens.UserRegistryImpl"), e.alice, 11
            );
            uint256 tokenId = IUserRegistry(swapRegistry).findTokenId(aliceLabel);
            // Let Alice re-point her own registry later. Not a transfer right — that is a
            // different role, so her name stays non-transferable.
            IUserRegistry(swapRegistry).grantRoles(tokenId, ROLE_SET_SUBREGISTRY, e.alice);
            IUserRegistry(swapRegistry).setSubregistry(tokenId, aliceRegistry);
            vm.stopBroadcast();

            // The back-link is what lets the checker tell whose registry it is looking at.
            vm.startBroadcast(aliceKey);
            IUserRegistry(aliceRegistry).setParent(swapRegistry, aliceLabel);
            vm.stopBroadcast();
            console.log("Alice's registry    ", aliceRegistry);
        }

        // The venue records the pointer; the investor makes the grant. Neither can do the other's
        // half, which is the point.
        // The pointer lives in the resolver field. `subregistry` is what indexers read to place a
        // registry in the hierarchy, and pointing it here made Alice's registry appear to hang
        // under agents.tnvda.eth rather than under her own name.
        if (IUserRegistry(agentIndex).findOwner(botLabel) != e.bot) {
            vm.startBroadcast(e.deployerKey);
            uint256 id = IUserRegistry(agentIndex).register(botLabel, e.bot, address(0), address(0), 0, expiry);
            IUserRegistry(agentIndex).setResolver(id, aliceRegistry);
            vm.stopBroadcast();
            console.log("indexed the bot against Alice's registry");
        } else if (IUserRegistry(agentIndex).getResolver(botLabel) != aliceRegistry) {
            // An entry written by an earlier version points the wrong way; repair it in place so
            // the name survives.
            vm.startBroadcast(e.deployerKey);
            uint256 id = IUserRegistry(agentIndex).findTokenId(botLabel);
            IUserRegistry(agentIndex).setResolver(id, aliceRegistry);
            IUserRegistry(agentIndex).setSubregistry(id, address(0));
            vm.stopBroadcast();
            console.log("repaired the bot's index entry");
        }

        if (IUserRegistry(aliceRegistry).findOwner(botLabel) != e.bot) {
            vm.startBroadcast(aliceKey);
            IUserRegistry(aliceRegistry).register(botLabel, e.bot, address(0), address(0), 0, expiry);
            vm.stopBroadcast();
            console.log("Alice granted the bot a name in her registry");
        }

        console.log("bot                 ", e.bot);
        console.log("principal           ", e.alice);
    }

    /// @notice Alice takes the delegation back, without the venue doing anything.
    function undelegate() external {
        Env memory e = readEnv();
        string memory json = vm.readFile(deploymentsPath());
        address swapRegistry = json.readAddress(".hanko.SwapRegistry");

        address aliceRegistry = IUserRegistry(swapRegistry).getSubregistry(labelFor(e.alice));
        if (aliceRegistry == address(0)) {
            console.log("Alice has no registry; nothing to undo");
            return;
        }

        string memory botLabel = labelFor(e.bot);
        if (IUserRegistry(aliceRegistry).findOwner(botLabel) != e.bot) {
            console.log("the bot holds no name in Alice's registry");
            return;
        }

        vm.startBroadcast(key_("ACTOR_ALICE_PK"));
        IUserRegistry(aliceRegistry).unregister(IUserRegistry(aliceRegistry).findTokenId(botLabel));
        vm.stopBroadcast();
        console.log("Alice revoked the bot");
    }

    function deployRegistry(address factory, address impl, address operator, uint256 salt)
        internal
        returns (address)
    {
        IUserRegistry.Grant[] memory grants = new IUserRegistry.Grant[](1);
        grants[0] = IUserRegistry.Grant({account: operator, roleBitmap: OPERATOR_ROLES_WITH_ADMIN});
        return IVerifiableFactory(factory).deployProxy(impl, salt, abi.encodeCall(IUserRegistry.initialize, (grants)));
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
}
