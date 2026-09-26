// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice The pool's counter asset. Six decimals, like the real thing — the decimal mismatch
///         against tNVDA's eighteen is part of what the price maths has to get right, and
///         pretending otherwise would hide a bug we would rather find in a test.
/// @dev Unrestricted on purpose: only the security is permissioned. Anyone may mint, because it
///      is a testnet faucet and a locked faucet is a demo that breaks when someone else tries it.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
