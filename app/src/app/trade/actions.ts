'use server';

import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  maxUint160,
  parseUnits,
  type Address,
} from 'viem';
import {getActors} from '@/lib/actors';
import {formatAmount, getClient} from '@/lib/hanko';
import {actorForRole, getViewer} from '@/lib/role';
import type {SwapResult} from '@/lib/swap-result';
import {
  encodeSwap,
  erc20ApproveAbi,
  getActorWallet,
  PERMIT2,
  permit2Abi,
  revertAbi,
  routerAbi,
  type PoolKeyShape,
} from '@/lib/swap';
import {getStock, usdcAddress, type Stock} from '@/lib/venue';

const ROUTER = '0x5093f1CDED83d99FfEd6602dA6260672ae16787c' as Address;
const DEADLINE_SECONDS = 600n;

/** What the refusal means, in the terms the venue is about rather than the router's. */
function reasonFor(name: string, symbol: string): string {
  switch (name) {
    case 'Unauthorized':
      return 'The pool asked the checker whether this wallet may swap and got no for an answer. Nothing about the trade was wrong — the wallet simply is not cleared.';
    case 'SwappingDisabled':
      return `The venue has halted trading in ${symbol}. Nobody can trade it, cleared or not — this is the switch that mirrors a halt on the underlying stock.`;
    case 'RecipientNotAllowed':
      return `The token itself refused delivery: this wallet may not hold ${symbol}, so there is nowhere for the proceeds to go.`;
    case 'NoVerifiedAdapter':
      return 'The pool currency is not a verified permissions adapter.';
    case 'UnverifiedAdapter':
      return 'The permissions adapter has not been verified by the factory.';
    case 'HookNotAllowed':
      return 'The adapter does not recognise this pool’s hook.';
    case 'UnauthorizedWrapper':
      return 'The router is not on the adapter’s list of allowed wrappers, so it cannot move the wrapped token.';
    default:
      return 'The pool rejected this swap.';
  }
}

function poolKeyOf(stock: Stock): PoolKeyShape {
  return {
    currency0: stock.currency0,
    currency1: stock.currency1,
    fee: stock.fee,
    tickSpacing: stock.tickSpacing,
    hooks: stock.hooks,
  };
}

/** Makes sure the router can pull `token` from the actor, only if the approvals are missing. */
async function ensureApprovals(wallet: NonNullable<ReturnType<typeof getActorWallet>>, token: Address) {
  const client = getClient();
  if (!client) return;
  const owner = wallet.account.address;

  const erc20Allowance = await client.readContract({
    address: token,
    abi: erc20ApproveAbi,
    functionName: 'allowance',
    args: [owner, PERMIT2],
  });

  if (erc20Allowance < parseUnits('1', 30)) {
    const hash = await wallet.writeContract({
      address: token,
      abi: erc20ApproveAbi,
      functionName: 'approve',
      args: [PERMIT2, maxUint160],
      chain: wallet.chain,
      account: wallet.account,
    });
    await client.waitForTransactionReceipt({hash});
  }

  const [permitAmount, expiration] = await client.readContract({
    address: PERMIT2,
    abi: permit2Abi,
    functionName: 'allowance',
    args: [owner, token, ROUTER],
  });

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (permitAmount < parseUnits('1', 24) || Number(expiration) < nowSeconds + 3600) {
    const hash = await wallet.writeContract({
      address: PERMIT2,
      abi: permit2Abi,
      functionName: 'approve',
      args: [token, ROUTER, maxUint160, 2 ** 48 - 1],
      chain: wallet.chain,
      account: wallet.account,
    });
    await client.waitForTransactionReceipt({hash});
  }
}

/**
 * Pulls a named custom error out of whatever shape viem hands back.
 *
 * The router wraps the inner failure, and viem cannot name a selector it has no ABI for, so it
 * reports the raw signature instead. Rather than unpack every wrapper layer by hand, this gathers
 * every hex blob anywhere in the error and looks for one of our selectors inside it. The reason is
 * the whole point of the demo; it is worth being stubborn about.
 */
function collectHex(err: unknown): string[] {
  const out: string[] = [];
  const seen = new WeakSet<object>();

  const visit = (value: unknown, depth: number) => {
    if (value == null || depth > 6) return;
    if (typeof value === 'string') {
      const matches = value.match(/0x[0-9a-fA-F]{8,}/g);
      if (matches) out.push(...matches);
      return;
    }
    if (typeof value !== 'object') return;
    if (seen.has(value as object)) return;
    seen.add(value as object);
    for (const entry of Object.values(value as Record<string, unknown>)) visit(entry, depth + 1);
  };

  visit(err, 0);
  if (err instanceof Error) visit(err.message, 0);
  return out;
}

function decodeRevert(err: unknown): {name: string; args: readonly unknown[]} | null {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName) {
      return {name: reverted.data.errorName, args: reverted.data.args ?? []};
    }
  }

  for (const blob of collectHex(err)) {
    for (let i = 2; i + 8 <= blob.length; i += 2) {
      const candidate = `0x${blob.slice(i, i + 8)}` as `0x${string}`;
      try {
        const decoded = decodeErrorResult({abi: revertAbi, data: candidate});
        return {name: decoded.errorName, args: decoded.args ?? []};
      } catch {
        // not one of ours; keep scanning
      }
    }
  }
  return null;
}

/**
 * How much of the stock this transaction moved for `account`, from its own logs.
 *
 * Diffing the wallet balance before and after looks simpler and is wrong: anything else touching
 * the same wallet in the meantime lands in the number. The receipt only holds this transaction.
 */
function stockMovedInReceipt(
  logs: readonly {address: string; topics: readonly string[]; data: string}[],
  token: Address,
  account: Address,
): bigint {
  const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const padded = account.toLowerCase().slice(2).padStart(64, '0');

  let total = 0n;
  for (const log of logs) {
    if (log.address.toLowerCase() !== token.toLowerCase()) continue;
    if (log.topics[0] !== TRANSFER) continue;

    const from = log.topics[1]?.slice(2);
    const to = log.topics[2]?.slice(2);
    if (from !== padded && to !== padded) continue;

    total += BigInt(log.data);
  }
  return total;
}

export interface SwapRequest {
  symbol: string;
  /** 'buy' spends USDC for the stock; 'sell' does the reverse. */
  side: 'buy' | 'sell';
  amount: string;
  /** Overrides the viewer — the walkthrough drives specific actors by name. */
  asActor?: (typeof TRADEABLE_ACTORS)[number];
}

/**
 * Whose key this action will sign with, at most.
 *
 * A server action takes whatever the caller sends, so the override is a closed list rather than a
 * free string. The venue operator is deliberately absent: it holds the ENS roles and the token
 * ownership, and nothing on this screen should ever be able to spend from it.
 */
const TRADEABLE_ACTORS = ['Alice', 'Bot', 'Stranger'] as const;

/** Signs and sends a swap as whoever the visitor is currently acting as. */
export async function swap(request: SwapRequest): Promise<SwapResult> {
  const client = getClient();
  const stock = getStock(request.symbol);
  const usdc = usdcAddress();

  if (!client || !stock || !usdc) {
    return {status: 'error', headline: 'Not configured', detail: 'That symbol is not listed.'};
  }

  const override = request.asActor;
  const actorName =
    override && (TRADEABLE_ACTORS as readonly string[]).includes(override)
      ? override
      : actorForRole((await getViewer()).id);
  const actor = getActors().find((a) => a.name === actorName);
  const wallet = getActorWallet(actorName);
  if (!actor || !wallet) {
    return {status: 'error', headline: 'Unknown actor', detail: 'No key for that actor in .env.'};
  }

  const buying = request.side === 'buy';
  const currencyIn = buying ? usdc : stock.adapter;
  // The adapter is paid in the underlying: the wrapped token can never sit in a wallet.
  const payToken = buying ? usdc : stock.token;
  const decimalsIn = buying ? 6 : 18;

  let amountIn: bigint;
  try {
    amountIn = parseUnits(request.amount, decimalsIn);
  } catch {
    return {status: 'error', headline: 'Bad amount', detail: `Could not read "${request.amount}".`};
  }
  if (amountIn <= 0n) {
    return {status: 'error', headline: 'Bad amount', detail: 'Enter an amount above zero.'};
  }

  try {
    await ensureApprovals(wallet, payToken);

    const {commands, inputs} = encodeSwap(poolKeyOf(stock), currencyIn, amountIn);
    const deadline = BigInt(Math.floor(Date.now() / 1000)) + DEADLINE_SECONDS;

    // Simulate first: a refusal should cost nothing and still report the contract's own reason.
    await client.simulateContract({
      address: ROUTER,
      abi: routerAbi,
      functionName: 'execute',
      args: [commands, inputs, deadline],
      account: actor.address,
    });

    const hash = await wallet.writeContract({
      address: ROUTER,
      abi: routerAbi,
      functionName: 'execute',
      args: [commands, inputs, deadline],
      chain: wallet.chain,
      account: wallet.account,
    });
    const receipt = await client.waitForTransactionReceipt({hash});
    const moved = stockMovedInReceipt(receipt.logs, stock.token, actor.address);

    return {
      status: 'ok',
      headline: `${actor.name} ${buying ? 'bought' : 'sold'} ${stock.symbol}`,
      detail: buying
        ? `Spent ${request.amount} USDC, received ${formatAmount(moved, 18, 4)} ${stock.symbol}.`
        : `Sold ${formatAmount(moved, 18, 4)} ${stock.symbol}.`,
      txHash: hash,
    };
  } catch (err) {
    const decoded = decodeRevert(err);

    if (decoded) {
      const args = decoded.args.length > 0 ? `(${decoded.args.map(String).join(', ')})` : '';
      return {
        status: 'refused',
        headline: `${actor.name} was refused`,
        detail: reasonFor(decoded.name, stock.symbol),
        revert: `${decoded.name}${args}`,
      };
    }

    return {
      status: 'error',
      headline: 'Swap failed',
      detail: err instanceof Error ? err.message.split('\n')[0] : String(err),
    };
  }
}
