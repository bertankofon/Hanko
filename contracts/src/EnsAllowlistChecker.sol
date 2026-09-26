// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseAllowlistChecker} from "@uniswap/v4-periphery/src/hooks/permissionedPools/BaseAllowListChecker.sol";
import {PermissionFlag, PermissionFlags} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/libraries/PermissionFlags.sol";

/// @notice The slice of ENSv2's registry we depend on.
interface IEnsRegistry {
    /// @notice Owner of `label`, or the zero address if the name has expired or never existed.
    function findOwner(string calldata label) external view returns (address);

    /// @notice Unix time the name lapses at, in seconds.
    function findExpiry(string calldata label) external view returns (uint64);
}

/// @title EnsAllowlistChecker
/// @notice Answers Uniswap's `checkAllowlist` out of ENSv2 instead of a mapping.
///
/// @dev A wallet may swap if it owns its own name under `swap.tnvda.eth`, and may provide
///      liquidity if it owns one under `lp.tnvda.eth`. The label is the wallet's own address in
///      lowercase hex, so the lookup is a direct hash with nothing to index and no room for two
///      wallets to claim the same name.
///
///      Three properties come from ENS rather than from code we had to write:
///
///      - **Expiry.** `findOwner` returns zero once the name lapses, so a permission that was
///        granted for two hours stops working on its own. A mapping would need a timestamp beside
///        every entry and a sweep to enforce it.
///      - **Non-transferability.** Names are registered without the transfer role, so a cleared
///        wallet cannot sell its access to someone the venue never cleared.
///      - **Separation of powers.** The registries are written by whoever holds `ROLE_REGISTRAR`
///        and cleared by whoever holds `ROLE_UNREGISTER`. From Phase 4 those are different parties:
///        the attester may admit and the venue operator may revoke, and neither can do the other's
///        job.
///
///      The checker is deliberately read-only and owns nothing. Swapping the venue's checker is an
///      adapter-level decision, which is what makes the Phase 3 switch a one-transaction change.
contract EnsAllowlistChecker is BaseAllowlistChecker {
    /// @notice Registry behind `swap.tnvda.eth`.
    IEnsRegistry public immutable SWAP_REGISTRY;

    /// @notice Registry behind `lp.tnvda.eth`.
    IEnsRegistry public immutable LP_REGISTRY;

    constructor(IEnsRegistry swapRegistry, IEnsRegistry lpRegistry) {
        SWAP_REGISTRY = swapRegistry;
        LP_REGISTRY = lpRegistry;
    }

    /// @inheritdoc BaseAllowlistChecker
    /// @dev `tokenAddress` is ignored: this venue lists one asset, and the registries are its
    ///      access lists. A checker serving several assets would key the registries by token.
    function checkAllowlist(address account, address /* tokenAddress */ )
        public
        view
        override
        returns (PermissionFlag flags)
    {
        string memory label = labelFor(account);

        if (SWAP_REGISTRY.findOwner(label) == account) {
            flags = flags | PermissionFlags.SWAP_ALLOWED;
        }
        if (LP_REGISTRY.findOwner(label) == account) {
            flags = flags | PermissionFlags.LIQUIDITY_ALLOWED;
        }
    }

    /// @notice When each of `account`'s permissions lapses, in unix seconds; zero means none.
    /// @dev Only for display — the UI counts down from this. Enforcement reads `findOwner`, which
    ///      already accounts for expiry, so nothing depends on this function being right.
    function expiryOf(address account) external view returns (uint64 swapExpiry, uint64 lpExpiry) {
        string memory label = labelFor(account);
        if (SWAP_REGISTRY.findOwner(label) == account) swapExpiry = SWAP_REGISTRY.findExpiry(label);
        if (LP_REGISTRY.findOwner(label) == account) lpExpiry = LP_REGISTRY.findExpiry(label);
    }

    /// @notice The ENS label a wallet's permissions live under: its address, lowercase hex.
    /// @dev Deliberately not a human-readable name. The address is public on chain already, so the
    ///      label leaks nothing extra, and it keeps the lookup a pure function of the account — no
    ///      registry of who chose which name, and no way to squat someone else's entry.
    function labelFor(address account) public pure returns (string memory) {
        bytes16 hexDigits = "0123456789abcdef";
        bytes memory out = new bytes(42);
        out[0] = "0";
        out[1] = "x";

        uint160 value = uint160(account);
        for (uint256 i = 41; i > 1; --i) {
            out[i] = hexDigits[value & 0xf];
            value >>= 4;
        }
        return string(out);
    }
}
