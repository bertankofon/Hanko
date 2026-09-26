import 'server-only';

import type {Address} from 'viem';

/**
 * The venue operator's levers, and the events they leave behind.
 *
 * Each of these maps onto a condition the SEC order places on a tokenized securities venue, so
 * they are not admin conveniences bolted on at the end — they are the half of the job the order
 * describes as setting and enforcing access standards.
 */

export const adapterAdminAbi = [
  {
    type: 'function',
    name: 'updateSwappingEnabled',
    inputs: [{name: 'enabled', type: 'bool'}],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {type: 'function', name: 'swappingEnabled', inputs: [], outputs: [{type: 'bool'}], stateMutability: 'view'},
  {type: 'function', name: 'owner', inputs: [], outputs: [{type: 'address'}], stateMutability: 'view'},
  {type: 'event', name: 'SwappingEnabledUpdated', inputs: [{name: 'enabled', type: 'bool', indexed: false}]},
  {
    type: 'event',
    name: 'AllowListCheckerUpdated',
    inputs: [{name: 'newAllowListChecker', type: 'address', indexed: true}],
  },
] as const;

export const registryAdminAbi = [
  {
    type: 'function',
    name: 'unregister',
    inputs: [{name: 'anyId', type: 'uint256'}],
    outputs: [],
    stateMutability: 'nonpayable',
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
    name: 'findTokenId',
    inputs: [{name: 'label', type: 'string'}],
    outputs: [{type: 'uint256'}],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'register',
    inputs: [
      {name: 'label', type: 'string'},
      {name: 'owner', type: 'address'},
      {name: 'registry', type: 'address'},
      {name: 'resolver', type: 'address'},
      {name: 'roleBitmap', type: 'uint256'},
      {name: 'expiry', type: 'uint64'},
    ],
    outputs: [{type: 'uint256'}],
    stateMutability: 'nonpayable',
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
    name: 'getSubregistry',
    inputs: [{name: 'label', type: 'string'}],
    outputs: [{type: 'address'}],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getResolver',
    inputs: [{name: 'label', type: 'string'}],
    outputs: [{type: 'address'}],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'setSubregistry',
    inputs: [
      {name: 'tokenId', type: 'uint256'},
      {name: 'registry', type: 'address'},
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setResolver',
    inputs: [
      {name: 'tokenId', type: 'uint256'},
      {name: 'resolver', type: 'address'},
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'grantRoles',
    inputs: [
      {name: 'tokenId', type: 'uint256'},
      {name: 'roleBitmap', type: 'uint256'},
      {name: 'account', type: 'address'},
    ],
    outputs: [{type: 'uint256'}],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'LabelRegistered',
    inputs: [
      {name: 'tokenId', type: 'uint256', indexed: true},
      {name: 'labelHash', type: 'bytes32', indexed: true},
      {name: 'label', type: 'string', indexed: false},
      {name: 'owner', type: 'address', indexed: false},
      {name: 'expiry', type: 'uint64', indexed: false},
      {name: 'sender', type: 'address', indexed: true},
    ],
  },
  {
    type: 'event',
    name: 'LabelUnregistered',
    inputs: [
      {name: 'tokenId', type: 'uint256', indexed: true},
      {name: 'sender', type: 'address', indexed: true},
    ],
  },
] as const;

export const posmAdminAbi = [
  {
    type: 'function',
    name: 'unwindPosition',
    inputs: [
      {name: 'tokenId', type: 'uint256'},
      {name: 'amount0Min', type: 'uint128'},
      {name: 'amount1Min', type: 'uint128'},
      {name: 'hookData', type: 'bytes'},
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getPositionLiquidity',
    inputs: [{name: 'tokenId', type: 'uint256'}],
    outputs: [{type: 'uint128'}],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'ownerOf',
    inputs: [{name: 'tokenId', type: 'uint256'}],
    outputs: [{type: 'address'}],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'CurrencyUnwound',
    inputs: [
      {name: 'tokenId', type: 'uint256', indexed: true},
      {name: 'currency', type: 'address', indexed: true},
      {name: 'recipient', type: 'address', indexed: true},
      {name: 'caller', type: 'address', indexed: false},
      {name: 'lp', type: 'address', indexed: false},
      {name: 'amount', type: 'uint256', indexed: false},
    ],
  },
] as const;

export const hookEventAbi = [
  {
    type: 'event',
    name: 'Swap',
    inputs: [
      {name: 'id', type: 'bytes32', indexed: true},
      {name: 'sender', type: 'address', indexed: true},
      {name: 'amount0', type: 'int128', indexed: false},
      {name: 'amount1', type: 'int128', indexed: false},
      {name: 'sqrtPriceX96', type: 'uint160', indexed: false},
      {name: 'liquidity', type: 'uint128', indexed: false},
      {name: 'tick', type: 'int24', indexed: false},
      {name: 'fee', type: 'uint24', indexed: false},
    ],
  },
] as const;

/** ENS Explorer, so a reader can check a name without taking our word for it. */
export function ensExplorer(name: string): string {
  return `https://explorer.ens.dev/${name}`;
}
