// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAllowlistChecker} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IAllowlistChecker.sol";
import {PermissionFlag, PermissionFlags} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/libraries/PermissionFlags.sol";
import {SimpleAllowlistChecker} from "../src/SimpleAllowlistChecker.sol";

contract SimpleAllowlistCheckerTest is Test {
    SimpleAllowlistChecker internal checker;

    address internal issuer = makeAddr("issuer");
    address internal alice = makeAddr("alice");
    address internal stranger = makeAddr("stranger");
    address internal bot = makeAddr("bot");
    address internal token = makeAddr("token");

    event FlagsUpdated(address indexed account, PermissionFlag flags);

    function setUp() public {
        checker = new SimpleAllowlistChecker(issuer);
    }

    /// The flag constants are Uniswap's, not ours. If upstream ever changes them, this fails
    /// loudly instead of the pool quietly allowing the wrong thing.
    function test_upstreamFlagValues() public pure {
        assertEq(PermissionFlag.unwrap(PermissionFlags.NONE), bytes2(0x0000));
        assertEq(PermissionFlag.unwrap(PermissionFlags.SWAP_ALLOWED), bytes2(0x0001));
        assertEq(PermissionFlag.unwrap(PermissionFlags.LIQUIDITY_ALLOWED), bytes2(0x0002));
    }

    function test_unknownAccountHasNoPermission() public view {
        assertTrue(checker.checkAllowlist(stranger, token) == PermissionFlags.NONE);
    }

    function test_setFlagsGrantsPermission() public {
        vm.prank(issuer);
        checker.setFlags(alice, PermissionFlags.SWAP_ALLOWED | PermissionFlags.LIQUIDITY_ALLOWED);

        PermissionFlag flags = checker.checkAllowlist(alice, token);
        assertTrue((flags & PermissionFlags.SWAP_ALLOWED) == PermissionFlags.SWAP_ALLOWED);
        assertTrue((flags & PermissionFlags.LIQUIDITY_ALLOWED) == PermissionFlags.LIQUIDITY_ALLOWED);
    }

    /// Swap and LP are separate grants: this is the SEC condition that liquidity providers are a
    /// distinct exemption category, not a nicety.
    function test_swapPermissionDoesNotImplyLiquidity() public {
        vm.prank(issuer);
        checker.setFlags(bot, PermissionFlags.SWAP_ALLOWED);

        assertTrue(checker.isAllowed(bot, PermissionFlags.SWAP_ALLOWED));
        assertFalse(checker.isAllowed(bot, PermissionFlags.LIQUIDITY_ALLOWED));
    }

    function test_setFlagsCanRevoke() public {
        vm.startPrank(issuer);
        checker.setFlags(alice, PermissionFlags.SWAP_ALLOWED);
        checker.setFlags(alice, PermissionFlags.NONE);
        vm.stopPrank();

        assertTrue(checker.checkAllowlist(alice, token) == PermissionFlags.NONE);
    }

    function test_setFlagsEmitsEvent() public {
        vm.expectEmit(true, false, false, true, address(checker));
        emit FlagsUpdated(alice, PermissionFlags.SWAP_ALLOWED);

        vm.prank(issuer);
        checker.setFlags(alice, PermissionFlags.SWAP_ALLOWED);
    }

    function test_setFlagsBatch() public {
        address[] memory accounts = new address[](2);
        accounts[0] = alice;
        accounts[1] = bot;

        PermissionFlag[] memory flags = new PermissionFlag[](2);
        flags[0] = PermissionFlags.SWAP_ALLOWED | PermissionFlags.LIQUIDITY_ALLOWED;
        flags[1] = PermissionFlags.SWAP_ALLOWED;

        vm.prank(issuer);
        checker.setFlagsBatch(accounts, flags);

        assertTrue(checker.isAllowed(alice, PermissionFlags.LIQUIDITY_ALLOWED));
        assertFalse(checker.isAllowed(bot, PermissionFlags.LIQUIDITY_ALLOWED));
    }

    function test_setFlagsBatchRejectsLengthMismatch() public {
        address[] memory accounts = new address[](2);
        PermissionFlag[] memory flags = new PermissionFlag[](1);

        vm.prank(issuer);
        vm.expectRevert(SimpleAllowlistChecker.LengthMismatch.selector);
        checker.setFlagsBatch(accounts, flags);
    }

    function test_onlyOwnerCanSetFlags() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        checker.setFlags(stranger, PermissionFlags.SWAP_ALLOWED);
    }

    /// The adapter discovers a checker through ERC-165; getting this wrong means the pool cannot
    /// adopt it at all.
    function test_supportsInterface() public view {
        assertTrue(checker.supportsInterface(type(IAllowlistChecker).interfaceId));
        assertTrue(checker.supportsInterface(type(IERC165).interfaceId));
        assertFalse(checker.supportsInterface(bytes4(0xdeadbeef)));
    }
}
