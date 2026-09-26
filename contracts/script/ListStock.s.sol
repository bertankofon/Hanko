// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {ActionConstants} from "@uniswap/v4-periphery/src/libraries/ActionConstants.sol";
import {IAllowlistChecker} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IAllowlistChecker.sol";
import {MockStockToken} from "../src/MockStockToken.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {PermissionedPoolWiring} from "../src/PermissionedPoolWiring.sol";
import {HankoEnv} from "./HankoEnv.sol";

/// @title ListStock
/// @notice Lists one tokenized stock on the venue: token, permissions adapter, pool, liquidity.
///
/// @dev The venue lists several symbols but clears people once. Every stock deployed here points
///      at the *same* `EnsAllowlistChecker`, because the exemption describes access as a property
///      of the person ("standards for persons to access trading") while the conditions that are
///      per-symbol — halting when the primary listing exchange halts — live on the adapter's own
///      `updateSwappingEnabled` switch. One checker, one switch per symbol.
///
///      Run once per symbol, so a failure costs one stock rather than three:
///
///        forge script script/ListStock.s.sol --sig "run(string)" tNVDA --rpc-url sepolia --broadcast --slow
///
///      Idempotent: a symbol whose token is already recorded is skipped.
contract ListStock is Script, HankoEnv {
    using stdJson for string;
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    uint24 internal constant FEE = 3000;
    int24 internal constant TICK_SPACING = 60;
    int24 internal constant TICK_LOWER = -887220;
    int24 internal constant TICK_UPPER = 887220;

    uint256 internal constant UNIT = 1e18;

    /// @dev Inventory for the issuer (seeds the pool) and for Alice (so she has something to sell).
    uint256 internal constant ISSUER_MINT = 5_000e18;
    uint256 internal constant ALICE_MINT = 1_000e18;

    /// @dev The pool is seeded from the issuer's own book, full range. See AddLiquidity for why.
    uint256 internal constant USDC_LIQUIDITY = 60_000e6;

    struct Listing {
        string symbol;
        string name;
        string underlying;
        uint256 usdcPerUnit; // 6 decimals, matching MockUSDC
    }

    /// @dev Prices are round numbers near the real quote on the day, not a feed. The demo is about
    ///      who may trade, not about price discovery; a moving mark would only add noise.
    function listingFor(string memory symbol) internal pure returns (Listing memory) {
        bytes32 h = keccak256(bytes(symbol));
        if (h == keccak256("tNVDA")) return Listing("tNVDA", "Tokenized NVIDIA", "NVDA", 225e6);
        if (h == keccak256("tAAPL")) return Listing("tAAPL", "Tokenized Apple", "AAPL", 340e6);
        if (h == keccak256("tMSFT")) return Listing("tMSFT", "Tokenized Microsoft", "MSFT", 519e6);
        revert("unknown symbol");
    }

    function run(string memory symbol) external {
        Listing memory listing = listingFor(symbol);
        Env memory e = readEnv();
        string memory base = string.concat(".stocks.", listing.symbol);

        {
            string memory json = vm.readFile(deploymentsPath());
            if (readAddressOrZero(json, string.concat(base, ".token")) != address(0)) {
                console.log("already listed, skipping:", listing.symbol);
                return;
            }
        }

        vm.startBroadcast(e.deployerKey);
        (address token, address adapter, PoolKey memory key, uint256 tokenId) = list(e, listing);
        vm.stopBroadcast();

        record(base, listing, token, adapter, key, tokenId);
    }

    /// @dev Split into small pieces purely to keep the stack shallow enough for legacy codegen.
    function list(Env memory e, Listing memory listing)
        internal
        returns (address token, address adapter, PoolKey memory key, uint256 tokenId)
    {
        address usdc = vm.readFile(deploymentsPath()).readAddress(".hanko.MockUSDC");
        (token, adapter) = deployAndWire(e, listing, usdc);
        key = openPool(e, adapter, usdc, listing.usdcPerUnit);
        tokenId = seedLiquidity(e, key, adapter, token, usdc, listing.usdcPerUnit);
    }

    function deployAndWire(Env memory e, Listing memory listing, address usdc)
        internal
        returns (address token, address adapter)
    {
        address ensChecker = vm.readFile(deploymentsPath()).readAddress(".hanko.EnsAllowlistChecker");

        MockStockToken stock =
            new MockStockToken(e.issuer, IAllowlistChecker(ensChecker), listing.name, listing.symbol);
        stock.mint(e.issuer, ISSUER_MINT);
        stock.mint(e.alice, ALICE_MINT);

        // The issuer seeds every pool, so it needs counter-asset on hand for each listing.
        MockUSDC(usdc).mint(e.issuer, USDC_LIQUIDITY);

        adapter = PermissionedPoolWiring.createAndWireAdapter(
            stock,
            IAllowlistChecker(ensChecker),
            e.issuer,
            PermissionedPoolWiring.Protocol({
                poolManager: e.poolManager,
                factory: e.factory,
                hooks: e.hooks,
                posm: e.posm,
                router: e.router
            })
        );
        token = address(stock);
    }

    function openPool(Env memory e, address adapter, address usdc, uint256 usdcPerUnit)
        internal
        returns (PoolKey memory key)
    {
        uint160 sqrtPriceX96;
        (key, sqrtPriceX96) =
            PermissionedPoolWiring.buildPoolKey(adapter, usdc, e.hooks, FEE, TICK_SPACING, UNIT, usdcPerUnit);
        IPoolManager(e.poolManager).initialize(key, sqrtPriceX96);
    }

    /// @dev Mirrors AddLiquidity: the position manager settles from its own balance, so the LP
    ///      sends both legs to it before calling. The stock leg is sized against the USDC leg at
    ///      the starting price, so minting the position does not move the price.
    function seedLiquidity(
        Env memory e,
        PoolKey memory key,
        address adapter,
        address token,
        address usdc,
        uint256 usdcPerUnit
    ) internal returns (uint256 tokenId) {
        uint256 stockIn = (USDC_LIQUIDITY * UNIT) / usdcPerUnit;
        bytes memory plan = buildPlan(e, key, adapter, stockIn);

        tokenId = IPositionManager(e.posm).nextTokenId();

        IERC20(token).transfer(e.posm, stockIn);
        IERC20(usdc).transfer(e.posm, USDC_LIQUIDITY);
        IPositionManager(e.posm).modifyLiquidities(plan, block.timestamp + 600);
    }

    function buildPlan(Env memory e, PoolKey memory key, address adapter, uint256 stockIn)
        internal
        view
        returns (bytes memory)
    {
        (uint256 amount0, uint256 amount1) = Currency.unwrap(key.currency0) == adapter
            ? (stockIn, USDC_LIQUIDITY)
            : (USDC_LIQUIDITY, stockIn);

        bytes memory actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION),
            uint8(Actions.SETTLE),
            uint8(Actions.SETTLE),
            uint8(Actions.CLOSE_CURRENCY),
            uint8(Actions.CLOSE_CURRENCY)
        );

        bytes[] memory params = new bytes[](5);
        params[0] = abi.encode(
            key, TICK_LOWER, TICK_UPPER, liquidityFor(e, key, amount0, amount1), amount0, amount1, e.issuer, bytes("")
        );
        params[1] = abi.encode(key.currency0, ActionConstants.OPEN_DELTA, false);
        params[2] = abi.encode(key.currency1, ActionConstants.OPEN_DELTA, false);
        params[3] = abi.encode(key.currency0);
        params[4] = abi.encode(key.currency1);

        return abi.encode(actions, params);
    }

    function liquidityFor(Env memory e, PoolKey memory key, uint256 amount0, uint256 amount1)
        internal
        view
        returns (uint128)
    {
        (uint160 sqrtPriceX96,,,) = IPoolManager(e.poolManager).getSlot0(key.toId());
        return LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(TICK_LOWER),
            TickMath.getSqrtPriceAtTick(TICK_UPPER),
            amount0,
            amount1
        );
    }

    function record(
        string memory base,
        Listing memory listing,
        address token,
        address adapter,
        PoolKey memory key,
        uint256 tokenId
    ) internal {
        string memory path = deploymentsPath();
        vm.writeJson(listing.name, path, string.concat(base, ".name"));
        vm.writeJson(listing.underlying, path, string.concat(base, ".underlying"));
        vm.writeJson(vm.toString(token), path, string.concat(base, ".token"));
        vm.writeJson(vm.toString(adapter), path, string.concat(base, ".adapter"));
        vm.writeJson(vm.toString(listing.usdcPerUnit), path, string.concat(base, ".usdcPerUnit"));
        vm.writeJson(vm.toString(Currency.unwrap(key.currency0)), path, string.concat(base, ".currency0"));
        vm.writeJson(vm.toString(Currency.unwrap(key.currency1)), path, string.concat(base, ".currency1"));
        vm.writeJson(vm.toString(uint256(key.fee)), path, string.concat(base, ".fee"));
        vm.writeJson(vm.toString(int256(key.tickSpacing)), path, string.concat(base, ".tickSpacing"));
        vm.writeJson(vm.toString(tokenId), path, string.concat(base, ".positionTokenId"));

        console.log("listed             ", listing.symbol);
        console.log("token              ", token);
        console.log("adapter            ", adapter);
        console.log("position tokenId   ", tokenId);
    }
}
