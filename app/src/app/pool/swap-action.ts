'use server';

import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  formatUnits,
  getAddress,
  maxUint160,
  parseUnits,
  type Address,
} from 'viem';
import {getActors} from '@/lib/actors';
import {getClient, hankoAddress, tokenAbi} from '@/lib/hanko';
import type {SwapResult} from '@/lib/swap-result';
import {
  encodeSwap,
  erc20ApproveAbi,
  getActorWallet,
  getPoolKey,
  PERMIT2,
  permit2Abi,
  revertAbi,
  routerAbi,
} from '@/lib/swap';

const ROUTER = '0x5093f1CDED83d99FfEd6602dA6260672ae16787c' as Address;
const DEADLINE_SECONDS = 600n;

/** What the refusal actually means, in the terms the demo is about. */
const REASONS: Record<string, string> = {
  Unauthorized:
    'The pool asked the checker whether this wallet may swap and got no for an answer. Nothing about the trade was wrong — the wallet simply is not cleared.',
  SwappingDisabled:
    'The venue operator has halted trading on this asset. Nobody can swap, cleared or not — this is the switch that mirrors a halt on the underlying stock.',
  RecipientNotAllowed:
    'The token itself refused delivery: this wallet may not hold tNVDA, so there is nowhere for the proceeds to go.',
  NoVerifiedAdapter: 'The pool currency is not a verified permissions adapter.',
  UnverifiedAdapter: 'The permissions adapter has not been verified by the factory.',
  HookNotAllowed: 'The adapter does not recognise this pool’s hook.',
  UnauthorizedWrapper:
    'The router is not on the adapter’s list of allowed wrappers, so it cannot move the wrapped token.',
};

/** Makes sure the router can pull `token` from `owner`, one approval chain, only if missing. */
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
 * The router wraps the inner failure — a refused swap arrives as
 * `WrappedError(hook, beforeSwap.selector, 0x82b42900, …)` — and viem cannot name a selector it
 * has no ABI for, so it reports the raw signature instead. Rather than unpack every wrapper layer
 * by hand, this gathers every hex blob anywhere in the error and looks for one of our selectors
 * inside it. The reason is the whole point of the demo; it is worth being stubborn about.
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

export async function swap(_prev: SwapResult, formData: FormData): Promise<SwapResult> {
  const client = getClient();
  const key = getPoolKey();
  const token = hankoAddress('MockStockToken');
  const usdc = hankoAddress('MockUSDC');

  if (!client || !key || !token || !usdc) {
    return {status: 'error', headline: 'Not configured', detail: 'The pool is not deployed yet.'};
  }

  const actorName = String(formData.get('actor') ?? '');
  const direction = String(formData.get('direction') ?? 'usdc-in');
  const rawAmount = String(formData.get('amount') ?? '100');

  const actor = getActors().find((a) => a.name === actorName);
  const wallet = getActorWallet(actorName);
  if (!actor || !wallet) {
    return {status: 'error', headline: 'Unknown actor', detail: 'No key for that actor in .env.'};
  }

  const usdcIn = direction === 'usdc-in';
  const currencyIn = usdcIn ? usdc : getAddress(String(hankoAddress('PermissionsAdapter')));
  const payTokenAddress = usdcIn ? usdc : token; // the adapter is paid in the underlying
  const decimalsIn = usdcIn ? 6 : 18;

  let amountIn: bigint;
  try {
    amountIn = parseUnits(rawAmount, decimalsIn);
  } catch {
    return {status: 'error', headline: 'Bad amount', detail: `Could not read "${rawAmount}".`};
  }

  const tokenBefore = await client.readContract({
    address: token,
    abi: tokenAbi,
    functionName: 'balanceOf',
    args: [actor.address],
  });

  try {
    await ensureApprovals(wallet, payTokenAddress);

    const {commands, inputs} = encodeSwap(key, currencyIn, amountIn);
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

    const tokenAfter = await client.readContract({
      address: token,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [actor.address],
    });

    const delta = tokenAfter - tokenBefore;
    const moved = delta >= 0n ? delta : -delta;

    return {
      status: 'ok',
      headline: `${actor.name} swapped ${rawAmount} ${usdcIn ? 'USDC' : 'tNVDA'}`,
      detail: `${delta >= 0n ? 'Received' : 'Sold'} ${formatUnits(moved, 18)} tNVDA. Gas used ${receipt.gasUsed}.`,
      txHash: hash,
    };
  } catch (err) {
    const decoded = decodeRevert(err);

    if (decoded) {
      const args = decoded.args.length > 0 ? `(${decoded.args.map(String).join(', ')})` : '';
      return {
        status: 'refused',
        headline: `${actor.name} was refused`,
        detail: REASONS[decoded.name] ?? 'The pool rejected this swap.',
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
