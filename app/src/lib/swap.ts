import 'server-only';

import {
  createWalletClient,
  encodeAbiParameters,
  encodePacked,
  getAddress,
  http,
  parseAbiParameters,
  type Address,
  type Hex,
} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {sepolia} from 'viem/chains';
import {d} from '@hanko/verify';
import {ACTORS} from './actors';

/**
 * Builds and sends a swap through UniversalRouter v2.2 on behalf of a demo actor.
 *
 * The actor keys live only on the server. This is a demo convenience so nobody has to switch
 * MetaMask accounts on stage; it is not how a real venue would work, and Phase 7's notes say so.
 */

/** UniversalRouter command for a v4 swap — universal-router Commands.sol. */
const V4_SWAP = 0x10;

/** v4-periphery Actions.sol */
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;

export const PERMIT2: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

export const permit2Abi = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      {name: 'token', type: 'address'},
      {name: 'spender', type: 'address'},
      {name: 'amount', type: 'uint160'},
      {name: 'expiration', type: 'uint48'},
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      {name: 'user', type: 'address'},
      {name: 'token', type: 'address'},
      {name: 'spender', type: 'address'},
    ],
    outputs: [
      {name: 'amount', type: 'uint160'},
      {name: 'expiration', type: 'uint48'},
      {name: 'nonce', type: 'uint48'},
    ],
    stateMutability: 'view',
  },
] as const;

export const erc20ApproveAbi = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      {name: 'spender', type: 'address'},
      {name: 'amount', type: 'uint256'},
    ],
    outputs: [{type: 'bool'}],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      {name: 'owner', type: 'address'},
      {name: 'spender', type: 'address'},
    ],
    outputs: [{type: 'uint256'}],
    stateMutability: 'view',
  },
] as const;

export const routerAbi = [
  {
    type: 'function',
    name: 'execute',
    inputs: [
      {name: 'commands', type: 'bytes'},
      {name: 'inputs', type: 'bytes[]'},
      {name: 'deadline', type: 'uint256'},
    ],
    outputs: [],
    stateMutability: 'payable',
  },
] as const;

/** Every custom error a refused swap can surface, so viem can name it instead of printing hex. */
export const revertAbi = [
  {type: 'error', name: 'Unauthorized', inputs: []},
  {type: 'error', name: 'SwappingDisabled', inputs: []},
  {type: 'error', name: 'NoVerifiedAdapter', inputs: []},
  {type: 'error', name: 'UnverifiedAdapter', inputs: []},
  {type: 'error', name: 'HookNotAllowed', inputs: []},
  {type: 'error', name: 'UnauthorizedWrapper', inputs: [{name: 'wrapper', type: 'address'}]},
  {
    type: 'error',
    name: 'RecipientNotAllowed',
    inputs: [
      {name: 'to', type: 'address'},
      {name: 'flags', type: 'bytes2'},
    ],
  },
  {
    type: 'error',
    name: 'InvalidTransfer',
    inputs: [
      {name: 'from', type: 'address'},
      {name: 'to', type: 'address'},
    ],
  },
] as const;

export function getActorWallet(name: string) {
  const entry = ACTORS.find((a) => a.name === name);
  if (!entry) return null;
  const raw = process.env[entry.env];
  if (!raw) return null;

  const key = (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
  const account = privateKeyToAccount(key);
  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? process.env.ANVIL_RPC_URL;
  if (!rpcUrl) return null;

  return createWalletClient({account, chain: sepolia, transport: http(rpcUrl)});
}

export interface PoolKeyShape {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export function getPoolKey(): PoolKeyShape | null {
  const p = d.pool;
  if (!p?.currency0 || !p.currency1 || !p.hooks || p.fee == null || p.tickSpacing == null) return null;
  return {
    currency0: getAddress(p.currency0),
    currency1: getAddress(p.currency1),
    fee: Number(p.fee),
    tickSpacing: Number(p.tickSpacing),
    hooks: getAddress(p.hooks),
  };
}

const poolKeyParams = parseAbiParameters(
  '(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)',
);

const exactInputSingleParams = parseAbiParameters(
  '((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, uint256 minHopPriceX36, bytes hookData)',
);

const currencyAmountParams = parseAbiParameters('address currency, uint256 amount');
const actionsParams = parseAbiParameters('bytes actions, bytes[] params');

/**
 * Encodes a single-hop exact-input swap for `router.execute`.
 *
 * `amountOutMinimum` is 0 because this is a demo pool with one position and no other traders;
 * a production venue would quote first and set a real bound.
 */
export function encodeSwap(
  key: PoolKeyShape,
  currencyIn: Address,
  amountIn: bigint,
): {commands: Hex; inputs: Hex[]} {
  const zeroForOne = key.currency0.toLowerCase() === currencyIn.toLowerCase();
  const currencyOut = zeroForOne ? key.currency1 : key.currency0;

  const actions = encodePacked(
    ['uint8', 'uint8', 'uint8'],
    [SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL],
  );

  const params: Hex[] = [
    encodeAbiParameters(exactInputSingleParams, [
      {
        poolKey: {
          currency0: key.currency0,
          currency1: key.currency1,
          fee: key.fee,
          tickSpacing: key.tickSpacing,
          hooks: key.hooks,
        },
        zeroForOne,
        amountIn,
        amountOutMinimum: 0n,
        minHopPriceX36: 0n,
        hookData: '0x',
      },
    ]),
    encodeAbiParameters(currencyAmountParams, [currencyIn, amountIn]),
    encodeAbiParameters(currencyAmountParams, [currencyOut, 0n]),
  ];

  return {
    commands: encodePacked(['uint8'], [V4_SWAP]),
    inputs: [encodeAbiParameters(actionsParams, [actions, params])],
  };
}

/** Kept so the pool page can spell out the same encoding it sends. */
export {poolKeyParams};
