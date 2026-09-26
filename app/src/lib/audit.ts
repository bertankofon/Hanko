import 'server-only';

import {decodeEventLog, formatUnits, getAddress, parseAbiItem, type Address, type Hex} from 'viem';
import {d} from '@hanko/verify';
import {hankoAddress} from './hanko';

/**
 * The venue's history, assembled from its own on-chain events.
 *
 * The SEC order asks a venue to give public notice of its operations. The stronger version of that
 * is what this reads: every grant, revocation, halt and trade is already an event anyone can fetch
 * without this app running. The page is a convenience over public data, not the record itself,
 * which is why each row links out rather than asking to be believed.
 *
 * Logs come from Etherscan rather than `eth_getLogs`: Alchemy's free tier caps a log query at ten
 * blocks, and the venue's history is thousands of blocks long by now. Etherscan has no such cap,
 * we already depend on it for contract verification, and it returns timestamps, so rows can show a
 * time instead of a block number.
 */

export type AuditKind = 'granted' | 'revoked' | 'halted' | 'resumed' | 'checker' | 'swap' | 'unwound';

export interface AuditEntry {
  kind: AuditKind;
  block: number;
  timestamp: number;
  txHash: string;
  /** One line, in the terms the demo is about rather than the terms of the ABI. */
  summary: string;
  contractLabel: string;
}

const EVENTS = [
  parseAbiItem(
    'event LabelRegistered(uint256 indexed tokenId, bytes32 indexed labelHash, string label, address owner, uint64 expiry, address indexed sender)',
  ),
  parseAbiItem('event LabelUnregistered(uint256 indexed tokenId, address indexed sender)'),
  parseAbiItem('event SwappingEnabledUpdated(bool enabled)'),
  parseAbiItem('event AllowListCheckerUpdated(address indexed newAllowListChecker)'),
  parseAbiItem(
    'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
  ),
  parseAbiItem(
    'event CurrencyUnwound(uint256 indexed tokenId, address indexed currency, address indexed recipient, address caller, address lp, uint256 amount)',
  ),
] as const;

interface RawLog {
  address: string;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  timeStamp: Hex;
  transactionHash: string;
}

/**
 * @dev Returns null when the source could not be read, rather than an empty list. An audit page
 *      that silently drops a source is worse than one that admits it is incomplete — the whole
 *      claim is that nothing is hidden.
 */
async function fetchLogs(
  address: Address,
  fromBlock: number,
  apiKey: string,
): Promise<RawLog[] | null> {
  const url =
    `https://api.etherscan.io/v2/api?chainid=11155111&module=logs&action=getLogs` +
    `&address=${address}&fromBlock=${fromBlock}&toBlock=latest&page=1&offset=500&apikey=${apiKey}`;

  try {
    const response = await fetch(url, {cache: 'no-store'});
    if (!response.ok) return null;

    const body = (await response.json()) as {status: string; message?: string; result: RawLog[] | string};
    if (Array.isArray(body.result)) return body.result;

    // "No records found" is an empty history, not a failure. Anything else — rate limiting above
    // all — is a failure we have to report.
    return /no records/i.test(String(body.message ?? body.result)) ? [] : null;
  } catch {
    return null;
  }
}

/** Etherscan's free tier allows five calls a second, and firing these in parallel loses some. */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Turns an address into the demo name for it, so rows read as people rather than hex. */
function namer(actors: {name: string; address: string}[]) {
  const byAddress = new Map(actors.map((a) => [a.address.toLowerCase(), a.name]));
  return (address: string) =>
    byAddress.get(address.toLowerCase()) ?? `${address.slice(0, 8)}…${address.slice(-4)}`;
}

export async function loadAudit(
  actors: {name: string; address: string}[],
): Promise<{entries: AuditEntry[]; error?: string}> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return {entries: [], error: 'ETHERSCAN_API_KEY is not set, so the history cannot be fetched.'};
  }

  const fromBlock = Number(d.hanko.deployBlock ?? 0);
  const name = namer(actors);

  const sources: {address: Address; label: string}[] = [
    ...(
      [
        ['SwapRegistry', 'swap.hanko.eth'],
        ['LpRegistry', 'lp.hanko.eth'],
        ['AgentIndex', 'agents.hanko.eth'],
        ['PermissionsAdapter', 'permissions adapter'],
      ] as const
    ).flatMap(([key, label]) => {
      const address = hankoAddress(key);
      return address ? [{address, label}] : [];
    }),
    {address: getAddress(d.uniswap.PermissionedHooks), label: 'permissioned hook'},
    {address: getAddress(d.uniswap.PermissionedPositionManager), label: 'position manager'},
  ];

  const entries: AuditEntry[] = [];
  const unreadable: string[] = [];

  for (const [i, source] of sources.entries()) {
    if (i > 0) await sleep(250);
    const logs = await fetchLogs(source.address, fromBlock, apiKey);
    if (logs === null) {
      unreadable.push(source.label);
      continue;
    }

    for (const log of logs) {
      const decoded = decode(log);
      if (!decoded) continue;

      const summary = describe(decoded, source.label, name);
      if (!summary) continue;

      entries.push({
        kind: summary.kind,
        block: Number(log.blockNumber),
        timestamp: Number(log.timeStamp),
        txHash: log.transactionHash,
        summary: summary.text,
        contractLabel: source.label,
      });
    }
  }

  return {
    entries: entries.sort((a, b) => b.timestamp - a.timestamp || b.block - a.block),
    error:
      unreadable.length > 0
        ? `Could not read ${unreadable.join(', ')} — this list is incomplete.`
        : undefined,
  };
}

type Decoded = {eventName: string; args: Record<string, unknown>};

/** Tries each event we care about; anything else in the log stream is skipped. */
function decode(log: RawLog): Decoded | null {
  for (const event of EVENTS) {
    try {
      const result = decodeEventLog({abi: [event], data: log.data, topics: log.topics as [Hex, ...Hex[]]});
      return {eventName: result.eventName as string, args: result.args as Record<string, unknown>};
    } catch {
      // not this one
    }
  }
  return null;
}

function describe(
  decoded: Decoded,
  contractLabel: string,
  name: (address: string) => string,
): {kind: AuditKind; text: string} | null {
  const {eventName, args} = decoded;

  switch (eventName) {
    case 'LabelRegistered': {
      const label = String(args.label ?? '');
      const who = label.startsWith('0x') && label.length === 42 ? name(label) : label;
      return {
        kind: 'granted',
        text:
          contractLabel === 'agents.hanko.eth'
            ? `${who} recorded as an agent`
            : `${who} granted a name in ${contractLabel}`,
      };
    }
    case 'LabelUnregistered':
      return {
        kind: 'revoked',
        text: `a name in ${contractLabel} was revoked by ${name(String(args.sender ?? ''))}`,
      };
    case 'SwappingEnabledUpdated':
      return args.enabled
        ? {kind: 'resumed', text: 'trading resumed'}
        : {kind: 'halted', text: 'trading halted for this asset'};
    case 'AllowListCheckerUpdated': {
      const checker = String(args.newAllowListChecker ?? '');
      const isEns = checker.toLowerCase() === (d.hanko.EnsAllowlistChecker ?? '').toLowerCase();
      return {
        kind: 'checker',
        text: `the pool's allowlist was pointed at ${isEns ? 'ENS' : 'another checker'} (${checker.slice(0, 10)}…)`,
      };
    }
    case 'Swap': {
      const a0 = BigInt((args.amount0 as bigint) ?? 0n);
      const a1 = BigInt((args.amount1 as bigint) ?? 0n);
      const abs = (v: bigint) => (v < 0n ? -v : v);
      return {
        kind: 'swap',
        text: `${name(String(args.sender ?? ''))} traded ${formatUnits(abs(a0), 18)} tNVDA against ${formatUnits(abs(a1), 6)} USDC`,
      };
    }
    case 'CurrencyUnwound':
      return {
        kind: 'unwound',
        text: `position #${args.tokenId} unwound, assets returned to ${name(String(args.recipient ?? ''))}`,
      };
    default:
      return null;
  }
}
