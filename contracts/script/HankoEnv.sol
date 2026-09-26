// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CommonBase} from "forge-std/Base.sol";
import {stdJson} from "forge-std/StdJson.sol";

/// @notice Shared reader for `.env` and `deployments/<chainid>.json`, so no script re-types an
///         address or a key name. Every address comes from the pinned deployments file that the
///         Phase 0 verification checks — nothing here is a literal.
abstract contract HankoEnv is CommonBase {
    using stdJson for string;

    struct Env {
        uint256 deployerKey;
        address issuer;
        address alice;
        address stranger;
        address bot;
        // Uniswap, pinned
        address poolManager;
        address factory;
        address hooks;
        address posm;
        address router;
        // Hanko, from Phase 1
        address token;
        address checker;
    }

    /// @dev An anvil fork reports the forked chain's id, so a rehearsal would otherwise overwrite
    ///      the real record. `DEPLOYMENTS_SUFFIX=-local` keeps fork runs in their own file.
    function deploymentsPath() internal view returns (string memory) {
        string memory suffix = vm.envOr("DEPLOYMENTS_SUFFIX", string(""));
        return string.concat(
            vm.projectRoot(), "/../deployments/", vm.toString(block.chainid), suffix, ".json"
        );
    }

    function readEnv() internal view returns (Env memory e) {
        string memory json = vm.readFile(deploymentsPath());

        e.deployerKey = key("DEPLOYER_PRIVATE_KEY");
        e.issuer = vm.addr(e.deployerKey);
        e.alice = vm.addr(key("ACTOR_ALICE_PK"));
        e.stranger = vm.addr(key("ACTOR_STRANGER_PK"));
        e.bot = vm.addr(key("ACTOR_BOT_PK"));

        e.poolManager = json.readAddress(".uniswap.PoolManager");
        e.factory = json.readAddress(".uniswap.PermissionsAdapterFactory");
        e.hooks = json.readAddress(".uniswap.PermissionedHooks");
        e.posm = json.readAddress(".uniswap.PermissionedPositionManager");
        e.router = json.readAddress(".uniswap.UniversalRouterV22");

        e.token = json.readAddress(".hanko.MockStockToken");
        e.checker = json.readAddress(".hanko.SimpleAllowlistChecker");
    }

    /// @dev Reads a private key with or without the `0x` prefix; a key pasted without it should
    ///      not cost anyone a confusing revert mid-demo.
    function key(string memory name) internal view returns (uint256) {
        string memory raw = vm.envString(name);
        if (bytes(raw).length == 64) {
            raw = string.concat("0x", raw);
        }
        return vm.parseUint(raw);
    }
}
