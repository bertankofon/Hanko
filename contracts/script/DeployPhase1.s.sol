// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {PermissionFlag, PermissionFlags} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/libraries/PermissionFlags.sol";
import {MockStockToken} from "../src/MockStockToken.sol";
import {SimpleAllowlistChecker} from "../src/SimpleAllowlistChecker.sol";

/// @title DeployPhase1
/// @notice Deploys tNVDA and the hand-written allowlist, seeds the demo actors, and records the
///         addresses in `deployments/<chainid>.json` so the app reads them instead of a constant.
///
/// @dev Idempotent in the sense that re-running gives a fresh set of contracts and overwrites the
///      recorded addresses; it does not try to reuse an existing deployment. That is what we want
///      while iterating — Phase 7 adds the demo-reset script that does reuse them.
///
///      Usage:
///        forge script script/DeployPhase1.s.sol --rpc-url sepolia --broadcast
///        forge script script/DeployPhase1.s.sol --rpc-url anvil --broadcast
contract DeployPhase1 is Script {
    /// Enough tNVDA for the pool's initial liquidity plus room for demo swaps.
    uint256 internal constant ALICE_MINT = 10_000e18;

    function run() external {
        uint256 deployerKey = _key("DEPLOYER_PRIVATE_KEY");
        address issuer = vm.addr(deployerKey);

        address alice = vm.addr(_key("ACTOR_ALICE_PK"));
        address stranger = vm.addr(_key("ACTOR_STRANGER_PK"));
        address bot = vm.addr(_key("ACTOR_BOT_PK"));

        vm.startBroadcast(deployerKey);

        SimpleAllowlistChecker checker = new SimpleAllowlistChecker(issuer);
        MockStockToken token = new MockStockToken(issuer, checker);

        // Alice is the verified investor: she may swap and provide liquidity. Stranger and Bot
        // are deliberately left with nothing — Stranger stays that way, Bot gets a delegated swap
        // permission in Phase 6 and that has to be visibly absent until then.
        checker.setFlags(alice, PermissionFlags.SWAP_ALLOWED | PermissionFlags.LIQUIDITY_ALLOWED);

        // The issuer holds inventory too, so it can seed the pool in Phase 2.
        checker.setFlags(issuer, PermissionFlags.SWAP_ALLOWED | PermissionFlags.LIQUIDITY_ALLOWED);

        token.mint(alice, ALICE_MINT);

        vm.stopBroadcast();

        _record(address(token), address(checker));

        console.log("chain              ", block.chainid);
        console.log("issuer             ", issuer);
        console.log("MockStockToken     ", address(token));
        console.log("SimpleChecker      ", address(checker));
        console.log("alice  (swap + lp) ", alice);
        console.log("stranger (none)    ", stranger);
        console.log("bot      (none)    ", bot);
    }

    /// @dev Reads a private key that may or may not carry the `0x` prefix. The TypeScript side
    ///      already tolerates both, and a key pasted without the prefix should not cost anyone a
    ///      confusing revert mid-demo.
    function _key(string memory name) internal view returns (uint256) {
        string memory raw = vm.envString(name);
        if (bytes(raw).length == 64) {
            raw = string.concat("0x", raw);
        }
        return vm.parseUint(raw);
    }

    /// @dev Writes into the existing deployments file rather than replacing it, so the pinned
    ///      external addresses and their `sources` block survive.
    ///
    ///      An anvil fork reports the forked chain's id, so a rehearsal would otherwise overwrite
    ///      the real Sepolia record with throwaway addresses. `DEPLOYMENTS_SUFFIX` keeps the two
    ///      apart: fork runs pass `-local` and write `11155111-local.json`, which the app ignores.
    function _record(address token, address checker) internal {
        string memory suffix = vm.envOr("DEPLOYMENTS_SUFFIX", string(""));
        string memory path = string.concat(
            vm.projectRoot(), "/../deployments/", vm.toString(block.chainid), suffix, ".json"
        );

        if (!vm.exists(path)) {
            // A fresh local file starts from the canonical one so it carries the pinned externals.
            string memory canonical =
                string.concat(vm.projectRoot(), "/../deployments/", vm.toString(block.chainid), ".json");
            vm.writeFile(path, vm.readFile(canonical));
        }

        vm.writeJson(vm.toString(token), path, ".hanko.MockStockToken");
        vm.writeJson(vm.toString(checker), path, ".hanko.SimpleAllowlistChecker");
        vm.writeJson(vm.toString(block.number), path, ".hanko.deployBlock");

        console.log("recorded in", path);
    }
}
