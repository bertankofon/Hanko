/**
 * Minimal ABI fragments used by the deployment verification checks.
 *
 * Every fragment below was read from pinned source, never guessed. The comment
 * above each block names the file it came from; see `deployments/11155111.json`
 * (`sources`) for the exact repos and commits.
 */

/**
 * Uniswap/v4-hooks-public @ src/permissioned-pools/PermissionedHooks.sol
 *   `IPermissionsAdapterFactory public immutable PERMISSIONS_ADAPTER_FACTORY;`
 * Uniswap/v4-periphery @ src/hooks/permissionedPools/PermissionedV4Router.sol
 *   (same immutable; UniversalRouter v2.2 inherits it through V4SwapRouter)
 * Uniswap/v4-periphery @ src/hooks/permissionedPools/PermissionedPositionManager.sol
 *   (same immutable)
 */
export const permissionsAdapterFactoryRefAbi = [
  {
    type: 'function',
    name: 'PERMISSIONS_ADAPTER_FACTORY',
    inputs: [],
    outputs: [{type: 'address'}],
    stateMutability: 'view',
  },
] as const;

/** v4-core BaseHook / v4-periphery ImmutableState: `poolManager()` (selector 0xdc4c90d3) */
export const poolManagerRefAbi = [
  {
    type: 'function',
    name: 'poolManager',
    inputs: [],
    outputs: [{type: 'address'}],
    stateMutability: 'view',
  },
] as const;

/** Uniswap/v4-periphery @ src/hooks/permissionedPools/interfaces/IPermissionsAdapterFactory.sol */
export const permissionsAdapterFactoryAbi = [
  {
    type: 'function',
    name: 'POOL_MANAGER',
    inputs: [],
    outputs: [{name: 'poolManager', type: 'address'}],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'permissionsAdapterOf',
    inputs: [{name: 'permissionsAdapter', type: 'address'}],
    outputs: [{name: 'permissionedToken', type: 'address'}],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'verifiedPermissionsAdapterOf',
    inputs: [{name: 'permissionsAdapter', type: 'address'}],
    outputs: [{name: 'permissionedToken', type: 'address'}],
    stateMutability: 'view',
  },
] as const;

/**
 * ensdomains/contracts-v2 @ UniversalResolverV2 (called through
 * UpgradableUniversalResolverProxy at 0xeEeE…EeEe).
 */
export const ensUniversalResolverAbi = [
  {
    type: 'function',
    name: 'ROOT_REGISTRY',
    inputs: [],
    outputs: [{type: 'address'}],
    stateMutability: 'view',
  },
] as const;

/** ensdomains/contracts-v2 @ UpgradableUniversalResolverProxy */
export const ensResolverProxyAbi = [
  {
    type: 'function',
    name: 'implementation',
    inputs: [],
    outputs: [{type: 'address'}],
    stateMutability: 'view',
  },
] as const;

/**
 * ensdomains/contracts-v2 @ RootRegistry / ETHRegistry / UserRegistryImpl
 * (all three share the registry surface we use).
 */
export const ensRegistryAbi = [
  {
    type: 'function',
    name: 'getSubregistry',
    inputs: [{name: 'label', type: 'string'}],
    outputs: [{type: 'address'}],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'findOwner',
    inputs: [{name: 'label', type: 'string'}],
    outputs: [{type: 'address'}],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'findExpiry',
    inputs: [{name: 'label', type: 'string'}],
    outputs: [{type: 'uint64'}],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getParent',
    inputs: [],
    outputs: [{type: 'address'}],
    stateMutability: 'view',
  },
] as const;

/** ensdomains/contracts-v2 @ ETHRegistrar */
export const ensEthRegistrarAbi = [
  {
    type: 'function',
    name: 'ETH_REGISTRY',
    inputs: [],
    outputs: [{type: 'address'}],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isAvailable',
    inputs: [{name: 'label', type: 'string'}],
    outputs: [{type: 'bool'}],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'MIN_COMMITMENT_AGE',
    inputs: [],
    outputs: [{type: 'uint256'}],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'rentPriceOracle',
    inputs: [],
    outputs: [{type: 'address'}],
    stateMutability: 'view',
  },
] as const;

/** ERC-20 subset, used for MockUSDC sanity checks */
export const erc20Abi = [
  {type: 'function', name: 'symbol', inputs: [], outputs: [{type: 'string'}], stateMutability: 'view'},
  {type: 'function', name: 'decimals', inputs: [], outputs: [{type: 'uint8'}], stateMutability: 'view'},
] as const;
