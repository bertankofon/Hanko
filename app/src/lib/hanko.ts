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

export function explorer(address: string): string {
  return `https://sepolia.etherscan.io/address/${address}`;
}
