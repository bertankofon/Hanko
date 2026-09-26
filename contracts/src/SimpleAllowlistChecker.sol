// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseAllowlistChecker} from "@uniswap/v4-periphery/src/hooks/permissionedPools/BaseAllowListChecker.sol";
import {PermissionFlag, PermissionFlags} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/libraries/PermissionFlags.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SimpleAllowlistChecker
/// @notice The smallest thing that satisfies Uniswap's `IAllowlistChecker`: a mapping the owner
///         writes by hand. Used in Phases 1-2 to bring the permissioned pool up without ENS in
///         the way, and kept afterwards as the "before" side of the Phase 3 demo, where the
///         adapter's `updateAllowListChecker` swaps this out for the ENS-backed checker live.
/// @dev Deliberately ignores `tokenAddress`: this deployment serves a single asset (tNVDA). A
///      checker serving several assets would key the mapping by token as well.
contract SimpleAllowlistChecker is BaseAllowlistChecker, Ownable {
    /// @notice Permission flags granted to an account, regardless of token.
    mapping(address account => PermissionFlag) public flags;

    event FlagsUpdated(address indexed account, PermissionFlag flags);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @inheritdoc BaseAllowlistChecker
    function checkAllowlist(address account, address /* tokenAddress */ )
        public
        view
        override
        returns (PermissionFlag)
    {
        return flags[account];
    }

    /// @notice Grants or clears permissions for one account.
    /// @param account The account to update
    /// @param newFlags `PermissionFlags.NONE`, `SWAP_ALLOWED`, `LIQUIDITY_ALLOWED`, or their union
    function setFlags(address account, PermissionFlag newFlags) public onlyOwner {
        flags[account] = newFlags;
        emit FlagsUpdated(account, newFlags);
    }

    /// @notice Same as `setFlags` for several accounts, so demo setup is one transaction.
    function setFlagsBatch(address[] calldata accounts, PermissionFlag[] calldata newFlags) external onlyOwner {
        if (accounts.length != newFlags.length) revert LengthMismatch();
        for (uint256 i = 0; i < accounts.length; i++) {
            setFlags(accounts[i], newFlags[i]);
        }
    }

    /// @notice Convenience view: does this account hold every bit in `permission`?
    function isAllowed(address account, PermissionFlag permission) external view returns (bool) {
        return (flags[account] & permission) == permission;
    }

    error LengthMismatch();
}
