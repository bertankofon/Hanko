import 'server-only';

import {createPublicClient, getAddress, http, type Address, type PublicClient} from 'viem';
import {sepolia} from 'viem/chains';
import {d} from '@hanko/verify';

/** Uniswap's flag bits, from v4-periphery libraries/PermissionFlags.sol. */
export const SWAP_ALLOWED = 0x0001;
export const LIQUIDITY_ALLOWED = 0x0002;

export const tokenAbi = [
  {type: 'function', name: 'symbol', inputs: [], outputs: [{type: 'string'}], stateMutability: 'view'},
  {type: 'function', name: 'decimals', inputs: [], outputs: [{type: 'uint8'}], stateMutability: 'view'},
  {type: 'function', name: 'totalSupply', inputs: [], outputs: [{type: 'uint256'}], stateMutability: 'view'},
  {type: 'function', name: 'owner', inputs: [], outputs: [{type: 'address'}], stateMutability: 'view'},
  {type: 'function', name: 'checker', inputs: [], outputs: [{type: 'address'}], stateMutability: 'view'},
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{name: 'account', type: 'address'}],
    outputs: [{type: 'uint256'}],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'systemAllowed',
    inputs: [{name: 'account', type: 'address'}],
    outputs: [{type: 'bool'}],
    stateMutability: 'view',
  },
  {
    type: 'error',
    name: 'RecipientNotAllowed',
    inputs: [
      {name: 'to', type: 'address'},
      {name: 'flags', type: 'bytes2'},
    ],
  },
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      {name: 'to', type: 'address'},
      {name: 'value', type: 'uint256'},
    ],
    outputs: [{type: 'bool'}],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'canReceive',
    inputs: [{name: 'account', type: 'address'}],
    outputs: [
      {name: 'allowed', type: 'bool'},
      {name: 'flags', type: 'bytes2'},
    ],
    stateMutability: 'view',
  },
] as const;

export const checkerAbi = [
  {
    type: 'function',
    name: 'checkAllowlist',
    inputs: [
      {name: 'account', type: 'address'},
      {name: 'tokenAddress', type: 'address'},
    ],
    outputs: [{type: 'bytes2'}],
    stateMutability: 'view',
  },
  {type: 'function', name: 'owner', inputs: [], outputs: [{type: 'address'}], stateMutability: 'view'},
] as const;

export const stateViewAbi = [
  {
    type: 'function',
    name: 'getSlot0',
    inputs: [{name: 'poolId', type: 'bytes32'}],
    outputs: [
      {name: 'sqrtPriceX96', type: 'uint160'},
      {name: 'tick', type: 'int24'},
      {name: 'protocolFee', type: 'uint24'},
      {name: 'lpFee', type: 'uint24'},
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getLiquidity',
    inputs: [{name: 'poolId', type: 'bytes32'}],
    outputs: [{type: 'uint128'}],
    stateMutability: 'view',
  },
] as const;

export const ensCheckerAbi = [
  {
    type: 'function',
    name: 'checkAllowlist',
    inputs: [
      {name: 'account', type: 'address'},
      {name: 'tokenAddress', type: 'address'},
    ],
    outputs: [{type: 'bytes2'}],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'expiryOf',
    inputs: [{name: 'account', type: 'address'}],
    outputs: [
      {name: 'swapExpiry', type: 'uint64'},
      {name: 'lpExpiry', type: 'uint64'},
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'labelFor',
    inputs: [{name: 'account', type: 'address'}],
    outputs: [{type: 'string'}],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'principalOf',
    inputs: [{name: 'account', type: 'address'}],
    outputs: [{type: 'address'}],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isActiveAgent',
    inputs: [
      {name: 'account', type: 'address'},
      {name: 'label', type: 'string'},
    ],
    outputs: [{type: 'bool'}],
    stateMutability: 'view',
  },
] as const;

export const ensRegistryAbi = [
  {
    type: 'function',
    name: 'findOwner',
    inputs: [{name: 'label', type: 'string'}],
    outputs: [{type: 'address'}],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getSubregistry',
    inputs: [{name: 'label', type: 'string'}],
    outputs: [{type: 'address'}],
    stateMutability: 'view',
  },
] as const;

export const adapterAbi = [
  {type: 'function', name: 'swappingEnabled', inputs: [], outputs: [{type: 'bool'}], stateMutability: 'view'},
  {
    type: 'function',
    name: 'allowListChecker',
    inputs: [],
    outputs: [{type: 'address'}],
    stateMutability: 'view',
  },
  {type: 'function', name: 'totalSupply', inputs: [], outputs: [{type: 'uint256'}], stateMutability: 'view'},
] as const;

/** v4 StateView on Sepolia, from Uniswap/contracts deployments. */
export const STATE_VIEW = '0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C' as const;

/** Server-side client. The RPC URL stays on the server. */
export function getClient(): PublicClient | null {
  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? process.env.ANVIL_RPC_URL;
  if (!rpcUrl) return null;
  return createPublicClient({chain: sepolia, transport: http(rpcUrl)}) as PublicClient;
}

/** Hanko's own deployed addresses, or null before the phase that deploys them. */
export function hankoAddress(name: keyof typeof d.hanko): Address | null {
  const value = d.hanko[name];
  return typeof value === 'string' ? getAddress(value) : null;
}

/** A `bytes2` flag word as the two permissions it encodes. */
export function decodeFlags(flags: `0x${string}`) {
  const bits = Number(BigInt(flags));
  return {
    raw: flags,
    swap: (bits & SWAP_ALLOWED) === SWAP_ALLOWED,
    liquidity: (bits & LIQUIDITY_ALLOWED) === LIQUIDITY_ALLOWED,
  };
}

/** Whole-token amount with a fixed number of decimals, for display only. */
export function formatAmount(value: bigint, decimals: number, places = 2): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = ((value % base) * 10n ** BigInt(places)) / base;
  return `${whole.toLocaleString('en-US')}.${frac.toString().padStart(places, '0')}`;
}

/**
 * Whole USDC per whole tNVDA from a Q64.96 sqrt price.
 *
 * The inversion below is where a permissioned pool most easily goes wrong: which side tNVDA sits
 * on depends on the adapter's address, and getting it backwards yields a price off by 1e12 that
 * still looks like a working pool.
 */
export function usdcPerTnvda(sqrtPriceX96: bigint, tnvdaIsCurrency0: boolean): number {
  const q192 = 1n << 192n;
  const priceX192 = sqrtPriceX96 * sqrtPriceX96;
  const SCALE = 1_000_000n; // keep six decimals of precision through the integer maths

  if (tnvdaIsCurrency0) {
    // price = raw USDC per raw tNVDA
    return Number((priceX192 * 10n ** 18n * SCALE) / q192 / 10n ** 6n) / Number(SCALE);
  }
  // price = raw tNVDA per raw USDC; invert
  return Number((q192 * 10n ** 12n * SCALE) / priceX192) / Number(SCALE);
}

export function explorer(address: string): string {
  return `https://sepolia.etherscan.io/address/${address}`;
}
