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
    address internal bot2 = makeAddr("bot2"); // the delegated agent, distinct from the swap-only bot
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
        vm.etch(bot2, "");

        vm.startPrank(issuer);
        buildEnsTree(issuer, "hankotest");

        checker = new EnsAllowlistChecker(IEnsRegistry(swapRegistry), IEnsRegistry(lpRegistry), IEnsRegistry(agentIndex));

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

    // ---------------------------------------------------------------------------------------
    // Agent delegation
    // ---------------------------------------------------------------------------------------

    /// @dev Alice gives her bot a name inside her own registry, and the venue records the pointer
    ///      that makes the bot findable from its address alone.
    function _delegate(uint64 expiry) internal returns (address aliceRegistry) {
        vm.startPrank(issuer);
        aliceRegistry = giveOwnRegistry(alice, 201);
        indexAgent(bot2, aliceRegistry, expiry);
        vm.stopPrank();

        vm.startPrank(alice);
        adoptParent(aliceRegistry, alice);
        grantAgentName(aliceRegistry, bot2, expiry);
        vm.stopPrank();
    }

    function test_agentMaySwapForItsPrincipal() public {
        _delegate(aliceExpiry);

        PermissionFlag flags = checker.checkAllowlist(bot2, token);
        assertTrue((flags & PermissionFlags.SWAP_ALLOWED) == PermissionFlags.SWAP_ALLOWED);
    }

    /// An agent trades its principal's position; it never commits their capital as liquidity.
    function test_agentNeverGetsLiquidity() public {
        _delegate(aliceExpiry);

        PermissionFlag flags = checker.checkAllowlist(bot2, token);
        assertFalse((flags & PermissionFlags.LIQUIDITY_ALLOWED) == PermissionFlags.LIQUIDITY_ALLOWED);
    }

    function test_principalIsReadable() public {
        _delegate(aliceExpiry);
        assertEq(checker.principalOf(bot2), alice);
        assertEq(checker.principalOf(stranger), address(0));
    }

    /// The point of the whole phase: revoking the investor ends their agent's access in the same
    /// transaction, with nobody having touched the agent. ENS stops resolving the registry and
    /// there is no list of ours to go and update.
    function test_revokingThePrincipalStopsTheAgent() public {
        _delegate(aliceExpiry);
        assertTrue(checker.isActiveAgent(bot2, checker.labelFor(bot2)));

        vm.startPrank(issuer);
        revokeName(swapRegistry, alice);
        vm.stopPrank();

        assertTrue(checker.checkAllowlist(bot2, token) == PermissionFlags.NONE, "agent outlived its principal");
    }

    /// Same cascade, but nobody acts at all — the principal's name simply lapses.
    function test_principalLapsingStopsTheAgent() public {
        _delegate(aliceExpiry);

        vm.warp(aliceExpiry + 1);

        assertTrue(checker.checkAllowlist(bot2, token) == PermissionFlags.NONE);
    }

    /// The other direction: the venue can cut one agent loose without touching its principal.
    function test_revokingTheAgentLeavesThePrincipalAlone() public {
        address aliceRegistry = _delegate(aliceExpiry);

        vm.startPrank(alice);
        revokeName(aliceRegistry, bot2);
        vm.stopPrank();

        assertTrue(checker.checkAllowlist(bot2, token) == PermissionFlags.NONE);
        assertFalse(checker.checkAllowlist(alice, token) == PermissionFlags.NONE, "principal was harmed");
    }

    /// The index is a pointer, not an authority. Pointing at someone else's registry buys nothing
    /// without a name inside it, which only that principal can grant.
    function test_indexEntryAloneGrantsNothing() public {
        vm.startPrank(issuer);
        address aliceRegistry = giveOwnRegistry(alice, 202);
        indexAgent(stranger, aliceRegistry, aliceExpiry); // pointer, but Alice granted no name
        vm.stopPrank();

        vm.prank(alice);
        adoptParent(aliceRegistry, alice);

        assertTrue(checker.checkAllowlist(stranger, token) == PermissionFlags.NONE);
    }

    /// A wallet cleared in its own right keeps its own permissions; agency is a fallback, not an
    /// override that could quietly downgrade an investor to swap-only.
    function test_directPermissionsWinOverAgency() public {
        vm.startPrank(issuer);
        address aliceRegistry = giveOwnRegistry(alice, 203);
        indexAgent(alice, aliceRegistry, aliceExpiry);
        vm.stopPrank();

        vm.prank(alice);
        adoptParent(aliceRegistry, alice);

        PermissionFlag flags = checker.checkAllowlist(alice, token);
        assertTrue((flags & PermissionFlags.LIQUIDITY_ALLOWED) == PermissionFlags.LIQUIDITY_ALLOWED);
    }

    /// Attaching a registry must not turn the principal's own name into something sellable.
    function test_ownRegistryDoesNotMakeTheNameTransferable() public {
        _delegate(aliceExpiry);

        uint256 tokenId = IUserRegistryLike(swapRegistry).findTokenId(labelFor(alice));
        vm.prank(alice);
        vm.expectRevert();
        IUserRegistryLike(swapRegistry).safeTransferFrom(alice, stranger, tokenId, 1, "");
    }
}
