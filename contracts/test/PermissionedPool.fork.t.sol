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
