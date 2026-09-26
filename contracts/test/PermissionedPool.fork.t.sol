// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {PermissionFlag, PermissionFlags} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/libraries/PermissionFlags.sol";
import {IAllowlistChecker} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IAllowlistChecker.sol";
import {IPermissionsAdapter} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IPermissionsAdapter.sol";
import {IPermissionsAdapterFactory} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IPermissionsAdapterFactory.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IV4Router} from "@uniswap/v4-periphery/src/interfaces/IV4Router.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {ActionConstants} from "@uniswap/v4-periphery/src/libraries/ActionConstants.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {MockStockToken} from "../src/MockStockToken.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {SimpleAllowlistChecker} from "../src/SimpleAllowlistChecker.sol";
import {PermissionedPoolWiring} from "../src/PermissionedPoolWiring.sol";

/// @notice Stands the whole pool up against the *real* Uniswap contracts on Sepolia.
///
/// @dev These deployments cannot be reproduced locally — the hook's address encodes its
///      permissions and was mined for that deployment — so a fork is the only way to test the
///      integration at all. Run with:
///        forge test --match-path "test/PermissionedPool.fork.t.sol" --fork-url sepolia
contract PermissionedPoolForkTest is Test {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    // Pinned Sepolia addresses; deployments/11155111.json carries the same values and the Phase 0
    // verification checks them against chain on every run.
    IPoolManager internal constant POOL_MANAGER = IPoolManager(0xE03A1074c86CFeDd5C142C4F04F1a1536e203543);
    address internal constant FACTORY = 0xE6B0d96919334C33d06266d1420F97f6f434fA2B;
    address internal constant HOOKS = 0x51247E2291d290d17C08813A175AC86465EdE8c0;
    address internal constant POSM = 0x864C37908Aa5e10b100CaCEe1c62E3954d76f5E1;
    address internal constant ROUTER_V22 = 0x5093f1CDED83d99FfEd6602dA6260672ae16787c;
    IAllowanceTransfer internal constant PERMIT2 =
        IAllowanceTransfer(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    /// UniversalRouter command for a v4 swap; from universal-router Commands.sol.
    uint8 internal constant V4_SWAP = 0x10;

    /// Full range, aligned to the 60 tick spacing. Chosen so a demo cannot swap the price out of
    /// range mid-presentation.
    int24 internal constant TICK_LOWER = -887220;
    int24 internal constant TICK_UPPER = 887220;

    uint24 internal constant FEE = 3000;
    int24 internal constant TICK_SPACING = 60;
    uint256 internal constant TNVDA_UNIT = 1e18;
    uint256 internal constant USDC_PER_TNVDA = 200e6;

    MockStockToken internal token;
    MockUSDC internal usdc;
    SimpleAllowlistChecker internal checker;
    IPermissionsAdapter internal adapter;
    PoolKey internal key;
    uint160 internal initialSqrtPriceX96;

    address internal issuer = makeAddr("issuer");
    address internal alice = makeAddr("alice");
    address internal stranger = makeAddr("stranger");
    address internal bot = makeAddr("bot");

    function setUp() public {
        vm.createSelectFork(vm.envString("SEPOLIA_RPC_URL"));

        vm.startPrank(issuer);
        checker = new SimpleAllowlistChecker(issuer);
        token = new MockStockToken(issuer, checker);
        usdc = new MockUSDC();

        checker.setFlags(issuer, PermissionFlags.ALL_ALLOWED);
        checker.setFlags(alice, PermissionFlags.SWAP_ALLOWED | PermissionFlags.LIQUIDITY_ALLOWED);
        checker.setFlags(bot, PermissionFlags.SWAP_ALLOWED); // swap only, no liquidity

        token.mint(issuer, 10_000e18);
        token.mint(alice, 10_000e18);
        token.mint(bot, 100e18);

        address adapterAddr = PermissionedPoolWiring.createAndWireAdapter(
            token,
            IAllowlistChecker(address(checker)),
            issuer,
            PermissionedPoolWiring.Protocol({
                poolManager: address(POOL_MANAGER),
                factory: FACTORY,
                hooks: HOOKS,
                posm: POSM,
                router: ROUTER_V22
            })
        );
        adapter = IPermissionsAdapter(adapterAddr);
        vm.stopPrank();

        usdc.mint(alice, 1_000_000e6);
        usdc.mint(stranger, 10_000e6);
        usdc.mint(bot, 10_000e6);

        (key, initialSqrtPriceX96) = PermissionedPoolWiring.buildPoolKey(
            adapterAddr, address(usdc), HOOKS, FEE, TICK_SPACING, TNVDA_UNIT, USDC_PER_TNVDA
        );

        POOL_MANAGER.initialize(key, initialSqrtPriceX96);
    }

    /// The hook's address is its permission set. If this ever stops matching, the pool we think we
    /// opened is not the pool we opened.
    function test_hookAddressEncodesExpectedPermissions() public pure {
        assertEq(uint160(HOOKS) & uint160((1 << 14) - 1), uint160(0x28c0));
    }

    function test_poolInitializedAtExpectedPrice() public view {
        (uint160 sqrtPriceX96,,,) = POOL_MANAGER.getSlot0(key.toId());
        assertEq(sqrtPriceX96, initialSqrtPriceX96);

        // Read the price back as whole USDC per whole tNVDA and check it is the 200 we asked for.
        assertApproxEqAbs(usdcPerTnvda(sqrtPriceX96), 200, 1);
    }

    function test_adapterIsVerifiedByFactory() public view {
        assertEq(
            IPermissionsAdapterFactory(FACTORY).verifiedPermissionsAdapterOf(address(adapter)),
            address(token),
            "adapter not verified: did depositForVerification run before verifyPermissionsAdapter?"
        );
    }

    function test_adapterKnowsItsWrappersAndHook() public view {
        assertTrue(adapter.allowedWrappers(address(POOL_MANAGER)), "pool manager not an allowed wrapper");
        assertTrue(adapter.allowedWrappers(POSM), "position manager not an allowed wrapper");
        assertTrue(adapter.allowedWrappers(ROUTER_V22), "router not an allowed wrapper");
        assertTrue(adapter.allowedHooks(IHooks(HOOKS)), "hook not allowed");
        assertTrue(adapter.swappingEnabled(), "swapping still disabled");
    }

    /// A fresh adapter is closed for business until the issuer opens it. Forgetting this is the
    /// single most likely reason a first permissioned pool appears broken.
    function test_freshAdapterHasSwappingDisabled() public {
        vm.prank(issuer);
        address fresh = IPermissionsAdapterFactory(FACTORY).createPermissionsAdapter(
            IERC20(address(token)), issuer, IAllowlistChecker(address(checker))
        );
        assertFalse(IPermissionsAdapter(fresh).swappingEnabled());
    }

    /// The adapter and the token must read the same allowlist, or the pool's restriction can be
    /// stepped around by taking delivery of the underlying directly.
    function test_adapterAndTokenShareOneChecker() public view {
        assertEq(address(adapter.allowListChecker()), address(token.checker()));
        assertTrue(adapter.isAllowed(alice, PermissionFlags.SWAP_ALLOWED));
        assertFalse(adapter.isAllowed(stranger, PermissionFlags.SWAP_ALLOWED));
    }

    /// Swap and liquidity are separate grants — the SEC's separate exemption for liquidity
    /// providers has a matching bit here, not a footnote in a policy document.
    function test_swapGrantDoesNotImplyLiquidityGrant() public view {
        assertTrue(adapter.isAllowed(bot, PermissionFlags.SWAP_ALLOWED));
        assertFalse(adapter.isAllowed(bot, PermissionFlags.LIQUIDITY_ALLOWED));
        assertTrue(adapter.isAllowed(alice, PermissionFlags.LIQUIDITY_ALLOWED));
    }

    /// Revoking at the checker takes effect at the pool immediately, with no second transaction
    /// and no list to keep in step.
    function test_revocationAtCheckerIsVisibleToAdapter() public {
        assertTrue(adapter.isAllowed(alice, PermissionFlags.SWAP_ALLOWED));

        vm.prank(issuer);
        checker.setFlags(alice, PermissionFlags.NONE);

        assertFalse(adapter.isAllowed(alice, PermissionFlags.SWAP_ALLOWED));
    }

    /// Only the issuer holds the halt switch — this is the Phase 5 trading halt.
    function test_onlyIssuerCanHaltTrading() public {
        vm.prank(stranger);
        vm.expectRevert();
        adapter.updateSwappingEnabled(false);

        vm.prank(issuer);
        adapter.updateSwappingEnabled(false);
        assertFalse(adapter.swappingEnabled());
    }

    /// The adapter token is a receipt the PoolManager holds, never a participant's asset.
    function test_adapterTokenCannotBeHeldByAParticipant() public {
        vm.prank(alice);
        vm.expectRevert();
        adapter.transfer(alice, 1);
    }


    // ---------------------------------------------------------------------------------------
    // Liquidity and swapping
    // ---------------------------------------------------------------------------------------

    /// @notice Opens a full-range position for `lp`.
    /// @dev The permissioned currency cannot be held by a participant, so the position manager is
    ///      funded with the *underlying* and settles from its own balance — the pattern Uniswap's
    ///      own tests use (`setupContractBalance` + SETTLE with payerIsUser false).
    function _mintPosition(address lp, uint256 tnvdaAmount, uint256 usdcAmount)
        internal
        returns (uint256 tokenId)
    {
        bool adapterIsZero = Currency.unwrap(key.currency0) == address(adapter);
        (uint256 amount0, uint256 amount1) =
            adapterIsZero ? (tnvdaAmount, usdcAmount) : (usdcAmount, tnvdaAmount);

        _fundPosm(lp, tnvdaAmount, usdcAmount);

        // Build the plan before pranking: `_mintPlan` reads the pool, and that external call
        // would otherwise consume the prank and send the mint from the test contract.
        bytes memory plan = _mintPlan(lp, amount0, amount1);

        tokenId = IPositionManager(POSM).nextTokenId();
        vm.prank(lp);
        IPositionManager(POSM).modifyLiquidities(plan, block.timestamp + 60);
    }

    /// @dev The position manager settles from its own balance, so the LP funds it first.
    function _fundPosm(address lp, uint256 tnvdaAmount, uint256 usdcAmount) internal {
        vm.startPrank(lp);
        token.transfer(POSM, tnvdaAmount);
        usdc.transfer(POSM, usdcAmount);
        vm.stopPrank();
    }

    /// @dev Split out of `_mintPosition` purely to stay under the stack limit.
    function _mintPlan(address lp, uint256 amount0, uint256 amount1) internal view returns (bytes memory) {
        (uint160 sqrtPriceX96,,,) = POOL_MANAGER.getSlot0(key.toId());
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

    /// @notice Approves Permit2 and the router for `who`, which is how the router pulls payment.
    function _approveRouter(address who) internal {
        vm.startPrank(who);
        token.approve(address(PERMIT2), type(uint256).max);
        usdc.approve(address(PERMIT2), type(uint256).max);
        PERMIT2.approve(address(token), ROUTER_V22, type(uint160).max, type(uint48).max);
        PERMIT2.approve(address(usdc), ROUTER_V22, type(uint160).max, type(uint48).max);
        vm.stopPrank();
    }

    /// @notice Swaps `amountIn` of USDC for tNVDA through UniversalRouter v2.2 as `who`.
    function _swapUsdcForTnvda(address who, uint256 amountIn) internal {
        Currency usdcCurrency = Currency.wrap(address(usdc));
        bool zeroForOne = Currency.unwrap(key.currency0) == address(usdc);

        bytes memory actions = abi.encodePacked(
            uint8(Actions.SWAP_EXACT_IN_SINGLE), uint8(Actions.SETTLE_ALL), uint8(Actions.TAKE_ALL)
        );

        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: key,
                zeroForOne: zeroForOne,
                amountIn: uint128(amountIn),
                amountOutMinimum: 0,
                minHopPriceX36: 0,
                hookData: bytes("")
            })
        );
        params[1] = abi.encode(usdcCurrency, amountIn);
        params[2] = abi.encode(zeroForOne ? key.currency1 : key.currency0, 0);

        bytes memory commands = abi.encodePacked(V4_SWAP);
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);

        vm.prank(who);
        (bool ok, bytes memory data) = ROUTER_V22.call(
            abi.encodeWithSignature("execute(bytes,bytes[],uint256)", commands, inputs, block.timestamp + 60)
        );
        if (!ok) {
            assembly {
                revert(add(data, 32), mload(data))
            }
        }
    }


    // ---------------------------------------------------------------------------------------
    // The point of the whole phase
    // ---------------------------------------------------------------------------------------

    function test_allowedLpCanOpenPosition() public {
        uint256 tokenId = _mintPosition(alice, 500e18, 100_000e6);

        assertEq(IERC721(POSM).ownerOf(tokenId), alice, "LP NFT did not reach Alice");
        assertGt(IPositionManager(POSM).getPositionLiquidity(tokenId), 0, "position has no liquidity");
    }

    function test_allowedTraderCanSwap() public {
        _mintPosition(alice, 500e18, 100_000e6);
        _approveRouter(alice);

        uint256 before = token.balanceOf(alice);
        _swapUsdcForTnvda(alice, 1_000e6);
        uint256 received = token.balanceOf(alice) - before;

        // 1000 USDC at 200 USDC/tNVDA is 5 tNVDA before costs. What comes back is less by the
        // 0.30% fee and by price impact against a 100k USDC position — about 1.3% all in. The
        // bounds are wide enough for that and tight enough to catch an inverted price, which
        // would be off by orders of magnitude rather than percent.
        assertGt(received, 4.8e18, "swap returned far too little");
        assertLt(received, 5e18, "swap returned more than the no-cost amount");
    }

    /// The core claim: the rule is enforced by the pool, against a funded wallet that simply is
    /// not cleared. Stranger holds USDC, so the only thing standing in the way is permission.
    function test_strangerIsRefusedBySwap() public {
        _mintPosition(alice, 500e18, 100_000e6);
        _approveRouter(stranger);

        assertGt(usdc.balanceOf(stranger), 1_000e6, "stranger must be funded or the test proves nothing");

        vm.expectRevert();
        _swapUsdcForTnvda(stranger, 1_000e6);
    }

    /// A trading halt stops everyone at once, including the cleared trader.
    function test_haltStopsEvenAnAllowedTrader() public {
        _mintPosition(alice, 500e18, 100_000e6);
        _approveRouter(alice);

        vm.prank(issuer);
        adapter.updateSwappingEnabled(false);

        vm.expectRevert();
        _swapUsdcForTnvda(alice, 1_000e6);

        vm.prank(issuer);
        adapter.updateSwappingEnabled(true);
        _swapUsdcForTnvda(alice, 1_000e6);
    }

    /// Revoking a trader's permission takes their access away from the pool immediately — no
    /// second list to update, no window where a stale entry still works.
    function test_revocationStopsAnExistingTrader() public {
        _mintPosition(alice, 500e18, 100_000e6);
        _approveRouter(alice);
        _swapUsdcForTnvda(alice, 100e6);

        vm.prank(issuer);
        checker.setFlags(alice, PermissionFlags.NONE);

        vm.expectRevert();
        _swapUsdcForTnvda(alice, 100e6);
    }

    /// Bot has SWAP but not LIQUIDITY: it may trade and may not provide liquidity. This is the
    /// separation the SEC order draws between participants and liquidity providers.
    function test_swapOnlyWalletCannotProvideLiquidity() public {
        _mintPosition(alice, 500e18, 100_000e6);
        _approveRouter(bot);

        _swapUsdcForTnvda(bot, 100e6); // trading is fine

        // Fund the position manager first: the refusal has to come from the permission check,
        // not from an earlier transfer, or the test would pass for the wrong reason.
        _fundPosm(bot, 10e18, 2_000e6);
        bool adapterIsZero = Currency.unwrap(key.currency0) == address(adapter);
        (uint256 amount0, uint256 amount1) = adapterIsZero ? (uint256(10e18), uint256(2_000e6)) : (uint256(2_000e6), uint256(10e18));
        bytes memory plan = _mintPlan(bot, amount0, amount1);

        vm.prank(bot);
        vm.expectRevert();
        IPositionManager(POSM).modifyLiquidities(plan, block.timestamp + 60);
    }

    /// @dev Turns a Q64.96 sqrt price into whole USDC per whole tNVDA, whichever side tNVDA is
    ///      on. Written out because the inversion is exactly the step a permissioned pool most
    ///      easily gets wrong, and a silent factor of 1e12 would look like a working pool.
    function usdcPerTnvda(uint160 sqrtPriceX96) internal view returns (uint256) {
        uint256 priceX192 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
        uint256 q192 = 1 << 192;

        if (Currency.unwrap(key.currency0) == address(adapter)) {
            // price = USDC raw per tNVDA raw; one whole tNVDA is TNVDA_UNIT raw.
            return FullMath.mulDiv(priceX192, TNVDA_UNIT, q192) / 1e6;
        }
        // price = tNVDA raw per USDC raw; invert, then convert raw USDC to whole USDC.
        return FullMath.mulDiv(q192, TNVDA_UNIT / 1e6, priceX192);
    }
}
