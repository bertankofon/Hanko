// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {PermissionFlag, PermissionFlags} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/libraries/PermissionFlags.sol";
import {IAllowlistChecker} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IAllowlistChecker.sol";
import {EnsAllowlistChecker, IEnsRegistry} from "../src/EnsAllowlistChecker.sol";
import {EnsFixture, IUserRegistryLike} from "./helpers/EnsFixture.sol";

/// @notice The ENS-backed allowlist, against the real ENSv2 deployment on Sepolia.
///
/// @dev What these tests are really checking is that the three properties we claim come from ENS
///      actually come from ENS: permissions that lapse on their own, permissions that cannot be
///      passed to someone else, and a revocation that lands without a second bookkeeping step.
contract EnsAllowlistCheckerForkTest is Test, EnsFixture {
    EnsAllowlistChecker internal checker;

    address internal issuer = makeAddr("issuer");
    address internal alice = makeAddr("alice");
    address internal bot = makeAddr("bot");
    address internal stranger = makeAddr("stranger");
    address internal token = makeAddr("token"); // the checker ignores it; one asset per venue



    uint64 internal constant TTL = 2 hours;
    uint64 internal aliceExpiry;

    function setUp() public {
        vm.createSelectFork(vm.envString("SEPOLIA_RPC_URL"));

        // `makeAddr` labels are so widely used that some of the matching keys have been used on
        // Sepolia — `makeAddr("alice")` has real code at it there. A name is an ERC-1155 token and
        // minting one runs the receiver check against anything with code, so on a fork these stand-
        // ins stop behaving like the wallets they represent. Clearing the code after selecting the
        // fork (the fork would otherwise restore it) puts them back to being plain EOAs.
        vm.etch(issuer, "");
        vm.etch(alice, "");
        vm.etch(bot, "");
        vm.etch(stranger, "");

        vm.startPrank(issuer);
        buildEnsTree(issuer, "hankotest");

        checker = new EnsAllowlistChecker(IEnsRegistry(swapRegistry), IEnsRegistry(lpRegistry));

        aliceExpiry = uint64(block.timestamp) + TTL;
        admit(swapRegistry, alice, aliceExpiry);
        admit(lpRegistry, alice, aliceExpiry);
        admit(swapRegistry, bot, aliceExpiry); // swap only: no lp name
        vm.stopPrank();
    }

    function test_labelIsTheLowercaseAddress() public view {
        assertEq(checker.labelFor(alice), vm.toLowercase(vm.toString(alice)));
    }

    function test_registeredWalletIsAllowed() public view {
        PermissionFlag flags = checker.checkAllowlist(alice, token);
        assertTrue((flags & PermissionFlags.SWAP_ALLOWED) == PermissionFlags.SWAP_ALLOWED);
        assertTrue((flags & PermissionFlags.LIQUIDITY_ALLOWED) == PermissionFlags.LIQUIDITY_ALLOWED);
    }

    function test_unknownWalletHasNothing() public view {
        assertTrue(checker.checkAllowlist(stranger, token) == PermissionFlags.NONE);
    }

    /// Swap and liquidity are separate names in separate registries, so one does not imply the
    /// other. The SEC order treats liquidity providers as a separate category; so does this.
    function test_swapNameDoesNotGrantLiquidity() public view {
        PermissionFlag flags = checker.checkAllowlist(bot, token);
        assertTrue((flags & PermissionFlags.SWAP_ALLOWED) == PermissionFlags.SWAP_ALLOWED);
        assertFalse((flags & PermissionFlags.LIQUIDITY_ALLOWED) == PermissionFlags.LIQUIDITY_ALLOWED);
    }

    /// The property a mapping cannot give you for free: access that ends by itself, with nobody
    /// having to run a sweep or remember to revoke.
    function test_permissionLapsesOnItsOwn() public {
        assertFalse(checker.checkAllowlist(alice, token) == PermissionFlags.NONE);

        vm.warp(aliceExpiry - 1);
        assertFalse(checker.checkAllowlist(alice, token) == PermissionFlags.NONE, "expired early");

        vm.warp(aliceExpiry + 1);
        assertTrue(checker.checkAllowlist(alice, token) == PermissionFlags.NONE, "did not lapse");
    }

    function test_expiryIsReadableForTheCountdown() public view {
        (uint64 swapExpiry, uint64 lpExpiry) = checker.expiryOf(alice);
        assertEq(swapExpiry, aliceExpiry);
        assertEq(lpExpiry, aliceExpiry);

        (uint64 none,) = checker.expiryOf(stranger);
        assertEq(none, 0);
    }

    /// Revocation is one transaction against the registry and the pool sees it on the next call —
    /// no second list, no window where a stale entry still works.
    function test_revocationTakesEffectImmediately() public {
        // startPrank, not prank: `revokeName` reads the token id first, and that external call
        // would consume a single-use prank — the same trap the pool tests hit.
        vm.startPrank(issuer);
        revokeName(swapRegistry, alice);
        vm.stopPrank();

        PermissionFlag flags = checker.checkAllowlist(alice, token);
        assertFalse((flags & PermissionFlags.SWAP_ALLOWED) == PermissionFlags.SWAP_ALLOWED);
        // The liquidity name is untouched: the two permissions revoke independently.
        assertTrue((flags & PermissionFlags.LIQUIDITY_ALLOWED) == PermissionFlags.LIQUIDITY_ALLOWED);
    }

    /// Names are granted with an empty role bitmap, so a cleared wallet cannot hand its access to
    /// a wallet the venue never cleared.
    function test_permissionCannotBeTransferred() public {
        uint256 tokenId = IUserRegistryLike(swapRegistry).findTokenId(labelFor(alice));

        vm.prank(alice);
        vm.expectRevert();
        IUserRegistryLike(swapRegistry).safeTransferFrom(alice, stranger, tokenId, 1, "");

        assertTrue(checker.checkAllowlist(stranger, token) == PermissionFlags.NONE);
    }

    /// Only the operator may admit. Without this the registry is a free-for-all and the venue
    /// controls nothing.
    function test_strangerCannotAdmitThemselves() public {
        vm.prank(stranger);
        vm.expectRevert();
        IUserRegistryLike(swapRegistry).register(
            labelFor(stranger), stranger, address(0), address(0), 0, type(uint64).max
        );
    }

    /// The adapter discovers a checker through ERC-165; failing this means the pool cannot adopt
    /// it at all, which is exactly the Phase 3 switch.
    function test_supportsAllowlistCheckerInterface() public view {
        assertTrue(checker.supportsInterface(type(IAllowlistChecker).interfaceId));
    }

    /// The tree really hangs off `.eth`, rather than existing as three unrelated contracts.
    function test_treeIsRootedInEns() public view {
        assertEq(IUserRegistryLike(tnvdaRegistry).findOwner("swap"), issuer);
        assertEq(IUserRegistryLike(tnvdaRegistry).findOwner("lp"), issuer);
        assertEq(IUserRegistryLike(swapRegistry).findOwner(labelFor(alice)), alice);
    }
}
