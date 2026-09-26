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

    /// @notice The registry hanging under `label`, or zero if the name has lapsed or holds none.
    /// @dev Returns zero for an expired *or* unregistered name — `unregister` sets the expiry to
    ///      the current block, so a revoked name stops resolving in the same transaction.
    function getSubregistry(string calldata label) external view returns (address);

    /// @notice The registry this one hangs under, and the label it hangs from.
    function getParent() external view returns (address parent, string memory label);
}

/// @title EnsAllowlistChecker
/// @notice Answers Uniswap's `checkAllowlist` out of ENSv2 instead of a mapping.
///
/// @dev A wallet may swap if it owns its own name under `swap.tnvda.eth`, and may provide
///      liquidity if it owns one under `lp.tnvda.eth`. The label is the wallet's own address in
///      lowercase hex, so the lookup is a direct hash with nothing to index and no room for two
///      wallets to claim the same name.
///
///      An agent — a trading bot acting for a cleared investor — holds a name inside its
///      principal's own registry, which hangs under the principal's name:
///
///        <agent>.<principal>.swap.tnvda.eth
///
///      That nesting is the delegation. Nothing in this contract records who an agent belongs to:
///      when the principal's name lapses or is revoked, ENS stops resolving their registry and the
///      agent stops trading in the same transaction, with nobody having touched the agent.
///
///      Uniswap hands the checker an address and nothing else, so the agent's principal has to be
///      discoverable from that address alone. The index that makes it possible lives in ENS too:
///      `agents.tnvda.eth` holds one entry per agent whose *subregistry* field points at the
///      principal's registry. It is a pointer, not an authority — an agent with a pointer but no
///      name inside the principal's registry has no permission at all.
///
///      Agents get `SWAP_ALLOWED` and never `LIQUIDITY_ALLOWED`. A bot can trade its principal's
///      position; it cannot commit their capital as liquidity.
contract EnsAllowlistChecker is BaseAllowlistChecker {
    /// @notice Registry behind `swap.tnvda.eth`.
    IEnsRegistry public immutable SWAP_REGISTRY;

    /// @notice Registry behind `lp.tnvda.eth`.
    IEnsRegistry public immutable LP_REGISTRY;

    /// @notice Registry behind `agents.tnvda.eth`, the agent-to-principal index.
    IEnsRegistry public immutable AGENT_INDEX;

    constructor(IEnsRegistry swapRegistry, IEnsRegistry lpRegistry, IEnsRegistry agentIndex) {
        SWAP_REGISTRY = swapRegistry;
        LP_REGISTRY = lpRegistry;
        AGENT_INDEX = agentIndex;
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

        // A wallet cleared in its own right has no need of a principal.
        if (!(flags == PermissionFlags.NONE)) return flags;

        if (isActiveAgent(account, label)) {
            flags = PermissionFlags.SWAP_ALLOWED;
        }
    }

    /// @notice Whether `account` is an agent whose grant and whose principal are both still live.
    /// @dev Four reads, every one of them a question ENS already knows the answer to:
    ///      1. the index points at a registry (zero once the agent's index entry is revoked);
    ///      2. that registry says which name it hangs under;
    ///      3. the principal still owns that name — this is the cascade;
    ///      4. the agent still holds a name inside the principal's registry.
    function isActiveAgent(address account, string memory label) public view returns (bool) {
        address principalRegistry = AGENT_INDEX.getSubregistry(label);
        if (principalRegistry == address(0)) return false;

        (address parentRegistry, string memory principalLabel) = IEnsRegistry(principalRegistry).getParent();
        if (parentRegistry == address(0)) return false;

        // The principal's name having lapsed or been revoked ends the agent's access here.
        if (IEnsRegistry(parentRegistry).findOwner(principalLabel) == address(0)) return false;

        return IEnsRegistry(principalRegistry).findOwner(label) == account;
    }

    /// @notice The principal an agent acts for, or the zero address if it is not an agent.
    /// @dev For display. Enforcement uses `isActiveAgent`, which also checks both names are live.
    function principalOf(address account) external view returns (address principal) {
        address principalRegistry = AGENT_INDEX.getSubregistry(labelFor(account));
        if (principalRegistry == address(0)) return address(0);

        (address parentRegistry, string memory principalLabel) = IEnsRegistry(principalRegistry).getParent();
        if (parentRegistry == address(0)) return address(0);

        return IEnsRegistry(parentRegistry).findOwner(principalLabel);
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
