// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {ActionConstants} from "@uniswap/v4-periphery/src/libraries/ActionConstants.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {HankoEnv} from "./HankoEnv.sol";

/// @title AddLiquidity
/// @notice Opens Alice's full-range position in the permissioned pool.
///
/// @dev Full range on purpose: a narrow band can be walked out of by a handful of demo swaps, and
///      a pool that runs out of liquidity mid-presentation is not a risk worth taking for capital
///      efficiency that nobody is measuring here.
///
///      The position manager settles from its own balance, so the LP sends the underlying to it
///      first. That is the pattern Uniswap's own tests use for permissioned currencies, because
///      the adapter token itself can never sit in a participant's wallet.
contract AddLiquidity is Script, HankoEnv {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    int24 internal constant TICK_LOWER = -887220;
    int24 internal constant TICK_UPPER = 887220;

    uint256 internal constant TNVDA_IN = 500e18;
    uint256 internal constant USDC_IN = 100_000e6;

    function run() external {
        Env memory e = readEnv();
        PoolKey memory key = readPoolKey();

        uint256 aliceKey = key_("ACTOR_ALICE_PK");
        address alice = vm.addr(aliceKey);

        bool adapterIsZero = Currency.unwrap(key.currency0) == e.adapter;
        (uint256 amount0, uint256 amount1) = adapterIsZero ? (TNVDA_IN, USDC_IN) : (USDC_IN, TNVDA_IN);

        bytes memory plan = buildPlan(key, alice, amount0, amount1);
        uint256 tokenId = IPositionManager(e.posm).nextTokenId();

        vm.startBroadcast(aliceKey);
        IERC20(e.token).transfer(e.posm, TNVDA_IN);
        IERC20(e.usdc).transfer(e.posm, USDC_IN);
        IPositionManager(e.posm).modifyLiquidities(plan, block.timestamp + 600);
        vm.stopBroadcast();

        vm.writeJson(vm.toString(tokenId), deploymentsPath(), ".pool.positionTokenId");

        console.log("LP                 ", alice);
        console.log("position tokenId   ", tokenId);
        console.log("tNVDA in           ", TNVDA_IN);
        console.log("USDC in            ", USDC_IN);
    }

    function buildPlan(PoolKey memory key, address lp, uint256 amount0, uint256 amount1)
        internal
        view
        returns (bytes memory)
    {
        Env memory e = readEnv();
        (uint160 sqrtPriceX96,,,) = IPoolManager(e.poolManager).getSlot0(key.toId());

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(TICK_LOWER),
            TickMath.getSqrtPriceAtTick(TICK_UPPER),
            amount0,
            amount1
        );

        bytes memory actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION),
            uint8(Actions.SETTLE),
            uint8(Actions.SETTLE),
            uint8(Actions.CLOSE_CURRENCY),
            uint8(Actions.CLOSE_CURRENCY)
        );

        bytes[] memory params = new bytes[](5);
        params[0] = abi.encode(key, TICK_LOWER, TICK_UPPER, liquidity, amount0, amount1, lp, bytes(""));
        params[1] = abi.encode(key.currency0, ActionConstants.OPEN_DELTA, false);
        params[2] = abi.encode(key.currency1, ActionConstants.OPEN_DELTA, false);
        params[3] = abi.encode(key.currency0);
        params[4] = abi.encode(key.currency1);

        return abi.encode(actions, params);
    }
}
