// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {IAllowlistChecker} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IAllowlistChecker.sol";
import {IPermissionsAdapter} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IPermissionsAdapter.sol";
import {IPermissionsAdapterFactory} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IPermissionsAdapterFactory.sol";
import {MockStockToken} from "../src/MockStockToken.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {PermissionedPoolWiring} from "../src/PermissionedPoolWiring.sol";
import {HankoEnv} from "./HankoEnv.sol";

/// @title SetupPhase2
/// @notice Stands up the permissioned tNVDA/USDC pool: counter asset, permissions adapter, the
///         adapter's admin wiring, and pool initialisation.
///
/// @dev The sequence below is not invented. It follows Uniswap's own integration tests in
///      `v4-periphery/test/hooks/permissionedPools/` — in particular `setUpPermissionsAdapter`,
///      which is the only place the required order is written down. Two things in it are easy to
///      miss and fatal if missed:
///
///      1. The permissioned token must allow *five* protocol addresses to receive it, not just the
///         adapter: the PoolManager, the position manager, the router, the factory and the hook
///         all touch the underlying at some point.
///      2. `depositForVerification` before `verifyPermissionsAdapter` — the factory refuses to
///         verify an adapter with a zero balance, and that balance is the issuer's on-chain signal
///         that it allow-listed this adapter.
///
///      Usage:
///        forge script script/SetupPhase2.s.sol --rpc-url anvil --broadcast
///        DEPLOYMENTS_SUFFIX=-local forge script script/SetupPhase2.s.sol --rpc-url anvil --broadcast
contract SetupPhase2 is Script, HankoEnv {
    using PermissionedPoolWiring for MockStockToken;

    /// Demo price: 1 tNVDA = 200 USDC. A round number on purpose — see docs/LEARNINGS.md.
    uint256 internal constant TNVDA_PER_UNIT = 1e18;
    uint256 internal constant USDC_PER_TNVDA = 200e6;

    uint24 internal constant FEE = 3000;
    int24 internal constant TICK_SPACING = 60;

    uint256 internal constant ISSUER_TNVDA = 1_000e18;
    uint256 internal constant ALICE_USDC = 200_000e6;
    uint256 internal constant ISSUER_USDC = 50_000e6;
    uint256 internal constant SPECTATOR_USDC = 10_000e6;

    function run() external {
        Env memory e = readEnv();

        vm.startBroadcast(e.deployerKey);

        MockUSDC usdc = new MockUSDC();
        MockStockToken token = MockStockToken(e.token);

        // Stranger and Bot get USDC too. Their swaps must fail for exactly one reason — no
        // permission — and an empty wallet would give the chain a second, duller reason.
        usdc.mint(e.alice, ALICE_USDC);
        usdc.mint(e.issuer, ISSUER_USDC);
        usdc.mint(e.stranger, SPECTATOR_USDC);
        usdc.mint(e.bot, SPECTATOR_USDC);
        token.mint(e.issuer, ISSUER_TNVDA);

        address adapter = PermissionedPoolWiring.createAndWireAdapter(
            token,
            IAllowlistChecker(e.checker),
            e.issuer,
            PermissionedPoolWiring.Protocol({
                poolManager: e.poolManager,
                factory: e.factory,
                hooks: e.hooks,
                posm: e.posm,
                router: e.router
            })
        );

        (PoolKey memory key, uint160 sqrtPriceX96) = PermissionedPoolWiring.buildPoolKey(
            adapter, address(usdc), e.hooks, FEE, TICK_SPACING, TNVDA_PER_UNIT, USDC_PER_TNVDA
        );
        IPoolManager(e.poolManager).initialize(key, sqrtPriceX96);

        vm.stopBroadcast();

        record(adapter, address(usdc), key, sqrtPriceX96);
    }

    function record(address adapter, address usdc, PoolKey memory key, uint160 sqrtPriceX96) internal {
        string memory path = deploymentsPath();
        vm.writeJson(vm.toString(adapter), path, ".hanko.PermissionsAdapter");
        vm.writeJson(vm.toString(usdc), path, ".hanko.MockUSDC");
        vm.writeJson(vm.toString(Currency.unwrap(key.currency0)), path, ".pool.currency0");
        vm.writeJson(vm.toString(Currency.unwrap(key.currency1)), path, ".pool.currency1");
        vm.writeJson(vm.toString(uint256(key.fee)), path, ".pool.fee");
        vm.writeJson(vm.toString(int256(key.tickSpacing)), path, ".pool.tickSpacing");
        vm.writeJson(vm.toString(address(key.hooks)), path, ".pool.hooks");
        vm.writeJson(vm.toString(uint256(sqrtPriceX96)), path, ".pool.initialSqrtPriceX96");

        console.log("PermissionsAdapter ", adapter);
        console.log("MockUSDC           ", usdc);
        console.log("currency0          ", Currency.unwrap(key.currency0));
        console.log("currency1          ", Currency.unwrap(key.currency1));
        console.log("sqrtPriceX96       ", sqrtPriceX96);
        console.log("recorded in        ", path);
    }
}
