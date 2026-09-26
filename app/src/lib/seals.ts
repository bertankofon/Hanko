import 'server-only';

import type {Address} from 'viem';
import {checkerAbi, decodeFlags, ensCheckerAbi, getClient, hankoAddress} from './hanko';
import {getStocks} from './venue';

/** What a wallet holds right now, in the venue's own words. */
export interface SealStatus {
  swap: boolean;
  liquidity: boolean;
  /** True when the only reason this wallet may trade is someone else's clearance. */
  viaAgent: boolean;
  label: string;
}

const ZERO = '0x0000000000000000000000000000000000000000';

function describe(swap: boolean, liquidity: boolean, viaAgent: boolean): string {
  if (viaAgent) return 'delegated';
  if (swap && liquidity) return 'cleared';
  if (swap) return 'swap only';
  if (liquidity) return 'liquidity only';
  return 'no seal';
}

/**
 * Reads every actor's seals in one pass, so the header can say what is true now.
 *
 * The role names are fixed; what each wallet holds is not. Showing a stale word next to a live
 * screen is how someone ends up believing they are locked out of their own demo.
 */
export async function readSeals(accounts: Address[]): Promise<Map<string, SealStatus>> {
  const client = getClient();
  const checker = hankoAddress('EnsAllowlistChecker');
  const token = getStocks()[0]?.token;
  const out = new Map<string, SealStatus>();

  if (!client || !checker || !token) return out;

  await Promise.all(
    accounts.map(async (account) => {
      const [flags, principal] = await Promise.all([
        client
          .readContract({
            address: checker,
            abi: checkerAbi,
            functionName: 'checkAllowlist',
            args: [account, token],
          })
          .catch(() => '0x0000' as const),
        client
          .readContract({address: checker, abi: ensCheckerAbi, functionName: 'principalOf', args: [account]})
          .catch(() => ZERO as Address),
      ]);

      const decoded = decodeFlags(flags as `0x${string}`);
      const viaAgent = principal !== ZERO && decoded.swap && !decoded.liquidity;

      out.set(account.toLowerCase(), {
        swap: decoded.swap,
        liquidity: decoded.liquidity,
        viaAgent,
        label: describe(decoded.swap, decoded.liquidity, viaAgent),
      });
    }),
  );

  return out;
}
