'use server';

import {ContractFunctionRevertedError, BaseError, getAddress, parseUnits} from 'viem';
import {getActors} from '@/lib/actors';
import {getClient, hankoAddress, tokenAbi} from '@/lib/hanko';
import type {ProbeResult} from '@/lib/probe';

/**
 * Simulates `transfer(to, amount)` as `from` with `eth_call` and reports what the chain says.
 *
 * A simulation, not a transaction: it needs no key and costs nothing, and it returns the same
 * custom error a real transfer would revert with. Phase 2 sends the real thing through the
 * router; the point here is that the rule already lives in the contract, and we can read its
 * reason rather than guess at it.
 */
export async function probeTransfer(_prev: ProbeResult, formData: FormData): Promise<ProbeResult> {
  const client = getClient();
  const token = hankoAddress('MockStockToken');
  if (!client || !token) {
    return {status: 'error', headline: 'Not configured', detail: 'No RPC or no deployed token.'};
  }

  const actors = getActors();
  const from = actors.find((a) => a.name === formData.get('from'));
  const to = actors.find((a) => a.name === formData.get('to'));
  const rawAmount = String(formData.get('amount') ?? '1');

  if (!from || !to) {
    return {status: 'error', headline: 'Unknown actor', detail: 'Pick a sender and a recipient.'};
  }

  let amount: bigint;
  try {
    amount = parseUnits(rawAmount, 18);
  } catch {
    return {status: 'error', headline: 'Bad amount', detail: `Could not read "${rawAmount}" as a number.`};
  }

  try {
    await client.simulateContract({
      address: token,
      abi: tokenAbi,
      functionName: 'transfer',
      args: [getAddress(to.address), amount],
      account: getAddress(from.address),
    });

    return {
      status: 'allowed',
      headline: `${from.name} → ${to.name} would succeed`,
      detail: `${rawAmount} tNVDA. The checker returns a non-zero flag for ${to.name}, so the token lets them take delivery.`,
    };
  } catch (err) {
    if (err instanceof BaseError) {
      const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
      if (reverted instanceof ContractFunctionRevertedError) {
        const name = reverted.data?.errorName ?? reverted.reason ?? 'revert';
        const args = reverted.data?.args ?? [];

        if (name === 'RecipientNotAllowed') {
          return {
            status: 'refused',
            headline: `${from.name} → ${to.name} is refused`,
            detail: `The token asked the checker about ${to.name} and got ${args[1]} back — no permission at all. The rule is in the contract, not in a terms-of-service page.`,
            revert: `RecipientNotAllowed(${args[0]}, ${args[1]})`,
          };
        }

        return {
          status: 'refused',
          headline: `${from.name} → ${to.name} is refused`,
          detail: 'The transfer reverted for a reason other than the allowlist.',
          revert: args.length > 0 ? `${name}(${args.join(', ')})` : name,
        };
      }
    }

    return {
      status: 'error',
      headline: 'Simulation failed',
      detail: err instanceof Error ? err.message.split('\n')[0] : String(err),
    };
  }
}
