// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAllowlistChecker} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IAllowlistChecker.sol";
import {PermissionFlag, PermissionFlags} from
    "@uniswap/v4-periphery/src/hooks/permissionedPools/libraries/PermissionFlags.sol";

/// @title MockStockToken
/// @notice A stand-in for a tokenized NMS stock: transfer-restricted, issuer-minted.
///
/// @dev The token asks the *same* allowlist checker the pool's permissions adapter asks. If the
///      two read from different sources, someone barred from the pool could still take delivery
///      of the token by a direct transfer and the pool's restriction would mean nothing. Keeping
///      one source is what makes "the rule is enforced in code, not in the terms of service" true.
///
///      Only the recipient is checked. A holder who loses permission can still send their
///      position to someone who has it, which is what an issuer-run venue wants: revocation must
///      not strand assets. Phase 5's `unwindPosition` relies on this.
///
///      `systemAllowed` is the issuer's short list of protocol addresses that hold the token on
///      someone else's behalf — above all the permissions adapter, which is the vault backing the
///      pool's wrapped currency. Those are contracts, not participants, so they are not on the
///      investor allowlist; without this exemption every wrap would revert.
contract MockStockToken is ERC20, Ownable {
    /// @notice The allowlist the token defers to. Swapped in Phase 3 from the simple checker to
    ///         the ENS-backed one, the same way the adapter's checker is swapped.
    IAllowlistChecker public checker;

    /// @notice Protocol addresses exempt from the recipient check (adapter, position manager, …).
    mapping(address account => bool) public systemAllowed;

    event CheckerUpdated(address indexed previousChecker, address indexed newChecker);
    event SystemAllowedUpdated(address indexed account, bool allowed);

    /// @notice Thrown when `to` may not receive the token.
    /// @param to The rejected recipient
    /// @param flags What the checker returned for them (`0x0000` means no permission at all)
    error RecipientNotAllowed(address to, PermissionFlag flags);

    /// @param name_ Display name, e.g. "Tokenized NVIDIA".
    /// @param symbol_ Ticker, e.g. "tNVDA".
    /// @dev The venue lists several of these. They share one checker, because the order describes
    ///      clearance as a property of the person, not of the symbol — see docs/refs.
    constructor(address initialOwner, IAllowlistChecker initialChecker, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        Ownable(initialOwner)
    {
        checker = initialChecker;
        emit CheckerUpdated(address(0), address(initialChecker));
    }

    /// @notice Issues new tokens. Only the issuer, and the recipient must still be allowed.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Points the token at a different allowlist. Phase 3 demo hinges on this.
    function setChecker(IAllowlistChecker newChecker) external onlyOwner {
        emit CheckerUpdated(address(checker), address(newChecker));
        checker = newChecker;
    }

    /// @notice Adds or removes a protocol address from the recipient-check exemption.
    function setSystemAllowed(address account, bool allowed) external onlyOwner {
        systemAllowed[account] = allowed;
        emit SystemAllowedUpdated(account, allowed);
    }

    /// @notice Whether `account` could receive the token right now, and why.
    /// @dev Exposed so the UI can explain a rejection before the user pays for a reverting tx.
    function canReceive(address account) external view returns (bool allowed, PermissionFlag flags) {
        if (systemAllowed[account]) {
            return (systemAllowed[account], PermissionFlags.ALL_ALLOWED);
        }
        flags = checker.checkAllowlist(account, address(this));
        // PermissionFlags only overloads ==, |, & — there is no != for this type.
        allowed = !(flags == PermissionFlags.NONE);
    }

    /// @dev Mints go through this too, so the issuer cannot hand new shares to someone who is not
    ///      cleared to hold them. There is no burn path on this token; if one is ever added, this
    ///      needs a `to == address(0)` exemption or burning becomes impossible.
    function _update(address from, address to, uint256 value) internal override {
        if (!systemAllowed[to]) {
            PermissionFlag flags = checker.checkAllowlist(to, address(this));
            if (flags == PermissionFlags.NONE) revert RecipientNotAllowed(to, flags);
        }
        super._update(from, to, value);
    }
}
