// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CommonBase} from "forge-std/Base.sol";

interface IETHRegistrarLike {
    function commit(bytes32 commitment) external;
    function makeCommitment(
        string calldata label,
        address owner,
        bytes32 secret,
        address subregistry,
        address resolver,
        uint64 duration,
        bytes32 referrer
    ) external pure returns (bytes32);
    function register(
        string calldata label,
        address owner,
        bytes32 secret,
        address subregistry,
        address resolver,
        uint64 duration,
        address paymentToken,
        bytes32 referrer
    ) external returns (uint256 tokenId);
    function getRegisterPrice(string calldata label, uint64 duration, address paymentToken)
        external
        view
        returns (uint256 base, uint256 premium);
    function isAvailable(string calldata label) external view returns (bool);
    function MIN_COMMITMENT_AGE() external view returns (uint256);
}

interface IEthRegistryLike {
    function findTokenId(string calldata label) external view returns (uint256);
    function setSubregistry(uint256 anyId, address registry) external;
    function getSubregistry(string calldata label) external view returns (address);
}

interface IVerifiableFactoryLike {
    function deployProxy(address implementation, uint256 salt, bytes calldata data)
        external
        returns (address);
}

interface IUserRegistryLike {
    struct Grant {
        address account;
        uint256 roleBitmap;
    }

    function initialize(Grant[] calldata grants) external;
    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256);
    function unregister(uint256 tokenId) external;
    function setParent(address parent, string calldata label) external;
    function setSubregistry(uint256 anyId, address registry) external;
    function grantRoles(uint256 anyId, uint256 roleBitmap, address account) external returns (bool);
    function findOwner(string calldata label) external view returns (address);
    function findTokenId(string calldata label) external view returns (uint256);
    function findExpiry(string calldata label) external view returns (uint64);
    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata data)
        external;
}

interface IMintableUSDCLike {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice Builds the `tnvda.eth` name tree against the real ENSv2 deployment on a fork.
///
/// @dev Shared by the checker tests and the pool tests so both exercise the same construction the
///      deploy script performs. Addresses are the pinned Sepolia ones; Phase 0's verification
///      checks them against chain on every run.
abstract contract EnsFixture is CommonBase {
    address internal constant ETH_REGISTRAR = 0xAbe76F6C8DFcEd81AA5A2bB8034202A7136b94ca;
    address internal constant ETH_REGISTRY = 0x657eA849311d3D5823348ddEd7C2AaAFb3EDE09E;
    address internal constant VERIFIABLE_FACTORY = 0x9e726Eb570beb6BCEb495AB8cdA7df517d4e841C;
    address internal constant USER_REGISTRY_IMPL = 0xA80338aAA8D23831cEa25E858D1774534aBb0263;
    address internal constant ENS_USDC = 0x16f95D91DBa7dA3Aca778Ec053dF0FF6C6A8aA8e;

    uint256 internal constant ROLE_REGISTRAR = 1 << 0;
    uint256 internal constant ROLE_SET_PARENT = 1 << 8;
    uint256 internal constant ROLE_UNREGISTER = 1 << 12;
    uint256 internal constant ROLE_RENEW = 1 << 16;
    uint256 internal constant ROLE_SET_SUBREGISTRY = 1 << 20;
    uint256 internal constant ROLE_SET_RESOLVER = 1 << 24;

    uint256 internal constant OPERATOR_ROLES = ROLE_REGISTRAR | ROLE_SET_PARENT | ROLE_UNREGISTER
        | ROLE_RENEW | ROLE_SET_SUBREGISTRY | ROLE_SET_RESOLVER;
    uint256 internal constant OPERATOR_ROLES_WITH_ADMIN = OPERATOR_ROLES | (OPERATOR_ROLES << 128);

    address internal tnvdaRegistry;
    address internal swapRegistry;
    address internal lpRegistry;
    /// @dev `agents.tnvda.eth` — one entry per agent, pointing at its principal's registry.
    address internal agentIndex;

    /// @notice Registers `tnvda.eth` to `operator` and hangs the swap and lp registries under it.
    /// @dev Must be called inside a prank as `operator`.
    function buildEnsTree(address operator, string memory label) internal {
        tnvdaRegistry = _deployRegistry(operator, 101);
        swapRegistry = _deployRegistry(operator, 102);
        lpRegistry = _deployRegistry(operator, 103);
        agentIndex = _deployRegistry(operator, 104);

        _registerSecondLevel(operator, label);

        IEthRegistryLike(ETH_REGISTRY).setSubregistry(
            IEthRegistryLike(ETH_REGISTRY).findTokenId(label), tnvdaRegistry
        );

        IUserRegistryLike(tnvdaRegistry).register(
            "swap", operator, swapRegistry, address(0), OPERATOR_ROLES_WITH_ADMIN, type(uint64).max
        );
        IUserRegistryLike(tnvdaRegistry).register(
            "lp", operator, lpRegistry, address(0), OPERATOR_ROLES_WITH_ADMIN, type(uint64).max
        );
        IUserRegistryLike(tnvdaRegistry).register(
            "agents", operator, agentIndex, address(0), OPERATOR_ROLES_WITH_ADMIN, type(uint64).max
        );
    }

    /// @notice Gives `principal` a registry of their own, hung under their name in `swap`.
    /// @dev Must run as the operator, and the principal must follow with `adoptParent`.
    ///
    ///      The principal is the registry's only root operator: the venue attaches the registry
    ///      but cannot put agents in it, so a delegation is always the investor's act.
    ///
    ///      `ROLE_SET_SUBREGISTRY` on the principal's own name is granted so they can re-point it
    ///      later. It does not make the name transferable — that is a separate role.
    function giveOwnRegistry(address principal, uint256 salt) internal returns (address registry) {
        registry = _deployRegistry(principal, salt);

        uint256 tokenId = IUserRegistryLike(swapRegistry).findTokenId(labelFor(principal));
        IUserRegistryLike(swapRegistry).grantRoles(tokenId, ROLE_SET_SUBREGISTRY, principal);
        IUserRegistryLike(swapRegistry).setSubregistry(tokenId, registry);
    }

    /// @notice Records which name the principal's registry hangs from.
    /// @dev Must run as the principal. Without this back-link `getParent()` is empty and the
    ///      checker cannot tell whose registry it is looking at — the cascade depends on it.
    function adoptParent(address registry, address principal) internal {
        IUserRegistryLike(registry).setParent(swapRegistry, labelFor(principal));
    }

    /// @notice Records `agent` in the index as acting for whoever owns `principalRegistry`.
    /// @dev Must run as the operator: the venue records the delegation, the investor grants it.
    ///      The entry is a pointer and nothing more — an agent listed here but holding no name
    ///      inside the principal's registry has no permission at all.
    function indexAgent(address agent, address principalRegistry, uint64 expiry) internal {
        IUserRegistryLike(agentIndex).register(
            labelFor(agent), agent, principalRegistry, address(0), 0, expiry
        );
    }

    /// @notice The grant itself: a name for `agent` inside `principalRegistry`.
    /// @dev Must run as the principal, who holds `ROLE_REGISTRAR` on their own registry.
    function grantAgentName(address principalRegistry, address agent, uint64 expiry) internal {
        IUserRegistryLike(principalRegistry).register(
            labelFor(agent), agent, address(0), address(0), 0, expiry
        );
    }

    /// @notice Grants `account` a name in `registry` until `expiry`.
    /// @dev `roleBitmap = 0` is the point: the holder owns the name and can do nothing else with
    ///      it, so access cannot be sold on to someone the venue never cleared.
    function admit(address registry, address account, uint64 expiry) internal {
        IUserRegistryLike(registry).register(
            labelFor(account), account, address(0), address(0), 0, expiry
        );
    }

    function revokeName(address registry, address account) internal {
        IUserRegistryLike(registry).unregister(
            IUserRegistryLike(registry).findTokenId(labelFor(account))
        );
    }

    /// @dev Mirrors `EnsAllowlistChecker.labelFor`; if the two disagree, nothing resolves.
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

    function _deployRegistry(address operator, uint256 salt) private returns (address) {
        IUserRegistryLike.Grant[] memory grants = new IUserRegistryLike.Grant[](1);
        grants[0] =
            IUserRegistryLike.Grant({account: operator, roleBitmap: OPERATOR_ROLES_WITH_ADMIN});
        return IVerifiableFactoryLike(VERIFIABLE_FACTORY).deployProxy(
            USER_REGISTRY_IMPL, salt, abi.encodeCall(IUserRegistryLike.initialize, (grants))
        );
    }

    /// @dev Commit, wait out `MIN_COMMITMENT_AGE`, then register. The commitment binds the
    ///      subregistry, so the name is claimed bare and pointed at its registry afterwards.
    function _registerSecondLevel(address operator, string memory label) private {
        bytes32 secret = keccak256(abi.encodePacked("hanko-test", label));
        uint64 duration = 365 days;

        bytes32 commitment = IETHRegistrarLike(ETH_REGISTRAR).makeCommitment(
            label, operator, secret, address(0), address(0), duration, bytes32(0)
        );
        IETHRegistrarLike(ETH_REGISTRAR).commit(commitment);
        vm.warp(block.timestamp + IETHRegistrarLike(ETH_REGISTRAR).MIN_COMMITMENT_AGE() + 1);

        (uint256 base, uint256 premium) =
            IETHRegistrarLike(ETH_REGISTRAR).getRegisterPrice(label, duration, ENS_USDC);
        IMintableUSDCLike(ENS_USDC).mint(operator, base + premium);
        IMintableUSDCLike(ENS_USDC).approve(ETH_REGISTRAR, base + premium);

        IETHRegistrarLike(ETH_REGISTRAR).register(
            label, operator, secret, address(0), address(0), duration, ENS_USDC, bytes32(0)
        );
    }
}
