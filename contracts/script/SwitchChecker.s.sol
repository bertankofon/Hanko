// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IAllowlistChecker} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IAllowlistChecker.sol";
import {IPermissionsAdapter} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IPermissionsAdapter.sol";
import {MockStockToken} from "../src/MockStockToken.sol";
import {HankoEnv} from "./HankoEnv.sol";

/// @title SwitchChecker
/// @notice Points the live pool at a different allowlist, without touching liquidity or the pool.
///
/// @dev Two writes, and they must move together: the adapter decides who may trade, and the token
///      decides who may hold the underlying. Leave one behind and a wallet the pool refuses can
///      still take delivery by a direct transfer, which is exactly the loophole this project
///      claims to close.
///
///      Usage:
///        forge script script/SwitchChecker.s.sol --sig "toEns()" --rpc-url sepolia --broadcast
///        forge script script/SwitchChecker.s.sol --sig "toSimple()" --rpc-url sepolia --broadcast
contract SwitchChecker is Script, HankoEnv {
    using stdJson for string;

    function toEns() external {
        switchTo(".hanko.EnsAllowlistChecker", "ENS");
    }

    function toSimple() external {
        switchTo(".hanko.SimpleAllowlistChecker", "mapping");
    }

    function switchTo(string memory path, string memory label) internal {
        Env memory e = readEnv();
        address checker = vm.readFile(deploymentsPath()).readAddress(path);

        vm.startBroadcast(e.deployerKey);
        IPermissionsAdapter(e.adapter).updateAllowListChecker(IAllowlistChecker(checker));
        MockStockToken(e.token).setChecker(IAllowlistChecker(checker));
        vm.stopBroadcast();

        console.log("pool and token now read the", label, "checker at", checker);
    }
}
