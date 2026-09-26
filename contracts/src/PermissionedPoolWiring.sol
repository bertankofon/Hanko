// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
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
import {MockStockToken} from "./MockStockToken.sol";

/// @title PermissionedPoolWiring
/// @notice The exact order in which a permissioned pool has to be assembled, in one place.
///
/// @dev The deploy script and the fork tests both call this, so the thing we test is the thing we
///      deploy. The sequence follows Uniswap's own integration tests
///      (`v4-periphery/test/hooks/permissionedPools/…::setUpPermissionsAdapter`), which is the
///      only place the required order is written down.
library PermissionedPoolWiring {
    /// @notice Every protocol address that handles the underlying on a participant's behalf.
    struct Protocol {
        address poolManager;
        address factory;
        address hooks;
        address posm;
        address router;
    }

    /// @notice Creates the adapter, allow-lists the protocol addresses on the token, proves the
    ///         adapter to the factory, and opens it for trading.
    /// @dev Must run as the token's owner, who is also the adapter's owner.
    function createAndWireAdapter(MockStockToken token, IAllowlistChecker checker, address issuer, Protocol memory p)
        internal
        returns (address adapter)
    {
        adapter = IPermissionsAdapterFactory(p.factory).createPermissionsAdapter(
            IERC20(address(token)), issuer, checker
        );

        // Without these the underlying cannot reach the vault, the pool or the position manager,
        // and every wrap reverts with the token's own RecipientNotAllowed.
        token.setSystemAllowed(adapter, true);
        token.setSystemAllowed(p.poolManager, true);
        token.setSystemAllowed(p.posm, true);
        token.setSystemAllowed(p.router, true);
        token.setSystemAllowed(p.factory, true);
        token.setSystemAllowed(p.hooks, true);

        // One wei is the issuer's on-chain statement that it allow-listed this adapter. The
        // factory refuses to verify an adapter holding nothing.
        require(token.approve(adapter, 1), "approve failed");
        IPermissionsAdapter(adapter).depositForVerification(1);
        IPermissionsAdapterFactory(p.factory).verifyPermissionsAdapter(adapter);

        IPermissionsAdapter(adapter).updateAllowedWrapper(p.poolManager, true);
        IPermissionsAdapter(adapter).updateAllowedWrapper(p.posm, true);
        IPermissionsAdapter(adapter).updateAllowedWrapper(p.router, true);
        IPermissionsAdapter(adapter).updateAllowedHook(IHooks(p.hooks), true);

        // A fresh adapter has swapping off. This same switch is the Phase 5 trading halt.
        IPermissionsAdapter(adapter).updateSwappingEnabled(true);
    }

    /// @notice Builds the pool key and its starting price.
    /// @dev Currencies sort by address and the adapter comes out of a plain CREATE, so which side
    ///      tNVDA lands on is not known until it exists. Both orders must work, and the price is
    ///      inverted for one of them — this is where a permissioned pool most easily goes wrong.
    function buildPoolKey(
        address adapter,
        address usdc,
        address hooks,
        uint24 fee,
        int24 tickSpacing,
        uint256 tnvdaUnit,
        uint256 usdcPerTnvda
    ) internal pure returns (PoolKey memory key, uint160 sqrtPriceX96) {
        bool adapterIsZero = adapter < usdc;

        key = PoolKey({
            currency0: Currency.wrap(adapterIsZero ? adapter : usdc),
            currency1: Currency.wrap(adapterIsZero ? usdc : adapter),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: IHooks(hooks)
        });

        sqrtPriceX96 = adapterIsZero
            ? encodeSqrtPriceX96(tnvdaUnit, usdcPerTnvda)
            : encodeSqrtPriceX96(usdcPerTnvda, tnvdaUnit);
    }

    /// @dev sqrt(amount1 / amount0) in Q64.96, in raw units, so token decimals are already in it.
    ///      The cast is safe: a valid Q64.96 sqrt price is bounded by TickMath.MAX_SQRT_PRICE,
    ///      which is far below 2^160, and PoolManager.initialize rejects anything outside it.
    function encodeSqrtPriceX96(uint256 amount0, uint256 amount1) internal pure returns (uint160) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint160(Math.sqrt(FullMath.mulDiv(amount1, 1 << 192, amount0)));
    }
}
