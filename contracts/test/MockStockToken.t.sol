// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAllowlistChecker} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IAllowlistChecker.sol";
import {PermissionFlag, PermissionFlags} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/libraries/PermissionFlags.sol";
import {MockStockToken} from "../src/MockStockToken.sol";
import {SimpleAllowlistChecker} from "../src/SimpleAllowlistChecker.sol";

contract MockStockTokenTest is Test {
    MockStockToken internal token;
    SimpleAllowlistChecker internal checker;

    address internal issuer = makeAddr("issuer");
    address internal alice = makeAddr("alice");
    address internal stranger = makeAddr("stranger");
    address internal bot = makeAddr("bot");
    address internal adapter = makeAddr("adapter");

    uint256 internal constant MINT = 1_000e18;

    function setUp() public {
        checker = new SimpleAllowlistChecker(issuer);
        token = new MockStockToken(issuer, checker, "Tokenized NVIDIA", "tNVDA");

        vm.startPrank(issuer);
        checker.setFlags(alice, PermissionFlags.SWAP_ALLOWED | PermissionFlags.LIQUIDITY_ALLOWED);
        checker.setFlags(bot, PermissionFlags.SWAP_ALLOWED);
        token.mint(alice, MINT);
        vm.stopPrank();
    }

    function test_metadata() public view {
        assertEq(token.symbol(), "tNVDA");
        assertEq(token.decimals(), 18);
        assertEq(token.balanceOf(alice), MINT);
    }

    function test_transferToAllowedRecipient() public {
        vm.prank(alice);
        token.transfer(bot, 10e18);
        assertEq(token.balanceOf(bot), 10e18);
    }

    function test_transferToUnallowedRecipientReverts() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(MockStockToken.RecipientNotAllowed.selector, stranger, PermissionFlags.NONE)
        );
        token.transfer(stranger, 1e18);
    }

    /// Token-level permission is binary: holding is holding. Whether you may swap or provide
    /// liquidity is decided at the pool, not here.
    function test_swapOnlyHolderMayStillHoldTokens() public {
        vm.prank(alice);
        token.transfer(bot, 5e18);
        assertEq(token.balanceOf(bot), 5e18);
    }

    /// The issuer must not be able to hand new shares to someone who is not cleared to hold them.
    function test_mintToUnallowedRecipientReverts() public {
        vm.prank(issuer);
        vm.expectRevert(
            abi.encodeWithSelector(MockStockToken.RecipientNotAllowed.selector, stranger, PermissionFlags.NONE)
        );
        token.mint(stranger, 1e18);
    }

    function test_onlyIssuerCanMint() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        token.mint(alice, 1e18);
    }

    /// Revocation must not strand assets: a holder who loses permission can still send their
    /// position out. Phase 5's unwind depends on this.
    function test_revokedHolderCanStillSendOut() public {
        vm.prank(issuer);
        checker.setFlags(alice, PermissionFlags.NONE);

        vm.prank(alice);
        token.transfer(bot, 1e18);
        assertEq(token.balanceOf(bot), 1e18);
    }

    function test_revokedHolderCannotReceive() public {
        vm.startPrank(issuer);
        checker.setFlags(alice, PermissionFlags.NONE);
        checker.setFlags(bot, PermissionFlags.SWAP_ALLOWED);
        vm.stopPrank();

        // Give bot something to send back.
        vm.prank(alice);
        token.transfer(bot, 1e18);

        vm.prank(bot);
        vm.expectRevert(
            abi.encodeWithSelector(MockStockToken.RecipientNotAllowed.selector, alice, PermissionFlags.NONE)
        );
        token.transfer(alice, 1e18);
    }

    /// The permissions adapter is the vault behind the pool's wrapped currency. It is a contract,
    /// not a participant, so it is exempt — without this every wrap reverts.
    function test_systemAllowedBypassesChecker() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(MockStockToken.RecipientNotAllowed.selector, adapter, PermissionFlags.NONE)
        );
        token.transfer(adapter, 1e18);

        vm.prank(issuer);
        token.setSystemAllowed(adapter, true);

        vm.prank(alice);
        token.transfer(adapter, 1e18);
        assertEq(token.balanceOf(adapter), 1e18);
    }

    /// Swapping the checker changes behaviour immediately — this is the Phase 3 demo in miniature.
    function test_swappingCheckerChangesBehaviour() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(MockStockToken.RecipientNotAllowed.selector, stranger, PermissionFlags.NONE)
        );
        token.transfer(stranger, 1e18);

        SimpleAllowlistChecker permissive = new SimpleAllowlistChecker(issuer);
        vm.startPrank(issuer);
        permissive.setFlags(stranger, PermissionFlags.SWAP_ALLOWED);
        token.setChecker(permissive);
        vm.stopPrank();

        vm.prank(alice);
        token.transfer(stranger, 1e18);
        assertEq(token.balanceOf(stranger), 1e18);
    }

    function test_onlyIssuerCanSwapChecker() public {
        SimpleAllowlistChecker other = new SimpleAllowlistChecker(issuer);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        token.setChecker(other);
    }

    function test_canReceiveMatchesTransferBehaviour() public {
        (bool aliceOk,) = token.canReceive(alice);
        (bool strangerOk, PermissionFlag strangerFlags) = token.canReceive(stranger);

        assertTrue(aliceOk);
        assertFalse(strangerOk);
        assertTrue(strangerFlags == PermissionFlags.NONE);

        vm.prank(issuer);
        token.setSystemAllowed(adapter, true);
        (bool adapterOk, PermissionFlag adapterFlags) = token.canReceive(adapter);
        assertTrue(adapterOk);
        assertTrue(adapterFlags == PermissionFlags.ALL_ALLOWED);
    }

    /// Anyone with permission may receive any amount; the restriction is on who, not how much.
    function testFuzz_allowedRecipientAcceptsAnyAmount(uint256 amount) public {
        amount = bound(amount, 0, MINT);
        vm.prank(alice);
        token.transfer(bot, amount);
        assertEq(token.balanceOf(bot), amount);
    }
}
