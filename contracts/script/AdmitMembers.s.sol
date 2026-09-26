// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {HankoEnv} from "./HankoEnv.sol";

interface IRegistryAdmin {
    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256);
    function unregister(uint256 tokenId) external;
    function findOwner(string calldata label) external view returns (address);
    function findTokenId(string calldata label) external view returns (uint256);
}

/// @title AdmitMembers
/// @notice Grants or revokes the ENS names that stand for pool permissions.
///
/// @dev Idempotent by design, and not only for tidiness: a `forge script` run broadcasts its
///      transactions one after another, and when Sepolia's txpool filled up mid-run the first
///      registrations landed while the last ones were dropped. Re-running has to finish the job
///      rather than revert on what already exists.
///
///      Usage:
///        forge script script/AdmitMembers.s.sol --rpc-url sepolia --broadcast
///        forge script script/AdmitMembers.s.sol --sig "revoke(address)" 0x… --rpc-url sepolia --broadcast
contract AdmitMembers is Script, HankoEnv {
    using stdJson for string;

    /// @dev How long a member's permission lasts, overridable with `MEMBER_TTL_SECONDS`.
    ///
    ///      Two hours by default because the demo's strongest moment is a permission lapsing with
    ///      nobody acting, and nobody will wait a year to watch it.
    ///
    ///      This is a placeholder for the real answer. A venue should not pick this number at all:
    ///      it belongs to whatever credential admitted the member, so a passport-backed permission
    ///      should end when the passport does and a KYC-backed one on that provider's refresh
    ///      cycle. Phase 4's credential provider returns an expiry alongside the proof, and this
    ///      constant goes away when the attester starts using it.
    ///
    ///      Note this has nothing to do with the five years in the SEC order — that is when the
    ///      exemption itself sunsets, not how long a participant stays cleared.
    uint64 internal constant DEFAULT_MEMBER_TTL = 2 hours;

    function memberTtl() internal view returns (uint64) {
        return uint64(vm.envOr("MEMBER_TTL_SECONDS", uint256(DEFAULT_MEMBER_TTL)));
    }

    function run() external {
        Env memory e = readEnv();
        (address swapRegistry, address lpRegistry) = registries();

        uint64 expiry = uint64(block.timestamp) + memberTtl();

        vm.startBroadcast(e.deployerKey);
        // The issuer keeps standing permissions so it can seed and rebalance the pool.
        admitIfMissing(swapRegistry, e.issuer, type(uint64).max, "issuer swap");
        admitIfMissing(lpRegistry, e.issuer, type(uint64).max, "issuer lp");
        admitIfMissing(swapRegistry, e.alice, expiry, "alice swap");
        admitIfMissing(lpRegistry, e.alice, expiry, "alice lp");
        vm.stopBroadcast();
    }

    /// @notice Clears both of `account`'s names, the way a venue operator revokes access.
    function revoke(address account) external {
        Env memory e = readEnv();
        (address swapRegistry, address lpRegistry) = registries();

        vm.startBroadcast(e.deployerKey);
        revokeIfPresent(swapRegistry, account, "swap");
        revokeIfPresent(lpRegistry, account, "lp");
        vm.stopBroadcast();
    }

    function admitIfMissing(address registry, address account, uint64 expiry, string memory what)
        internal
    {
        string memory label = labelFor(account);
        if (IRegistryAdmin(registry).findOwner(label) == account) {
            console.log("already admitted:", what);
            return;
        }
        IRegistryAdmin(registry).register(label, account, address(0), address(0), 0, expiry);
        console.log("admitted:", what);
    }

    function revokeIfPresent(address registry, address account, string memory what) internal {
        string memory label = labelFor(account);
        if (IRegistryAdmin(registry).findOwner(label) != account) {
            console.log("nothing to revoke:", what);
            return;
        }
        IRegistryAdmin(registry).unregister(IRegistryAdmin(registry).findTokenId(label));
        console.log("revoked:", what);
    }

    function registries() internal view returns (address swapRegistry, address lpRegistry) {
        string memory json = vm.readFile(deploymentsPath());
        swapRegistry = json.readAddress(".hanko.SwapRegistry");
        lpRegistry = json.readAddress(".hanko.LpRegistry");
    }

    /// @dev Mirrors `EnsAllowlistChecker.labelFor`; the two must agree or nothing resolves.
    function labelFor(address account) internal pure returns (string memory) {
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
