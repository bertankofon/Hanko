'use server';

import {revalidatePath} from 'next/cache';
import {swap} from '@/app/trade/actions';
import {delegate, grantAccess, resetVenue, revokeAccess, setTrading} from '@/app/venue-actions';
import type {SwapResult} from '@/lib/swap-result';

/**
 * One walkthrough step, executed for real on Sepolia.
 *
 * Each step names the actor it signs as rather than reading the header's role switcher: the
 * narrative only works if "a stranger" is always the stranger, whoever happens to be watching.
 */

export interface StepOutcome {
  label: string;
  status: 'ok' | 'refused' | 'error';
  detail?: string;
  revert?: string;
  txHash?: string;
}

export interface StepResult {
  id: string;
  outcomes: StepOutcome[];
}

function fromSwap(label: string, result: SwapResult): StepOutcome {
  return {
    label,
    status: result.status === 'idle' ? 'error' : result.status,
    detail: result.detail ?? result.headline,
    revert: result.revert,
    txHash: result.txHash,
  };
}

function fromOperator(
  label: string,
  result: {status: string; headline: string; detail?: string; txHash?: string},
): StepOutcome {
  return {
    label,
    status: result.status === 'ok' ? 'ok' : 'error',
    detail: result.detail ?? result.headline,
    txHash: result.txHash,
  };
}

export async function runStep(id: string): Promise<StepResult> {
  const outcomes: StepOutcome[] = [];

  switch (id) {
    case 'stranger-refused':
      outcomes.push(
        fromSwap(
          'Stranger buys 500 USDC of tNVDA',
          await swap({symbol: 'tNVDA', side: 'buy', amount: '500', asActor: 'Stranger'}),
        ),
      );
      break;

    case 'clear-stranger':
      outcomes.push(fromOperator('Venue clears the stranger', await grantAccess('Stranger')));
      break;

    case 'stranger-trades':
      outcomes.push(
        fromSwap(
          'The same wallet buys 500 USDC of tNVDA',
          await swap({symbol: 'tNVDA', side: 'buy', amount: '500', asActor: 'Stranger'}),
        ),
      );
      break;

    case 'delegate':
      outcomes.push(fromOperator('Investor delegates to her bot', await delegate()));
      break;

    case 'bot-trades':
      outcomes.push(
        fromSwap(
          'Bot buys 300 USDC of tNVDA',
          await swap({symbol: 'tNVDA', side: 'buy', amount: '300', asActor: 'Bot'}),
        ),
      );
      break;

    case 'halt': {
      outcomes.push(fromOperator('Venue halts tNVDA', await setTrading('tNVDA', false)));
      outcomes.push(
        fromSwap(
          'Investor buys tNVDA',
          await swap({symbol: 'tNVDA', side: 'buy', amount: '200', asActor: 'Alice'}),
        ),
      );
      outcomes.push(
        fromSwap(
          'The same investor buys tAAPL',
          await swap({symbol: 'tAAPL', side: 'buy', amount: '200', asActor: 'Alice'}),
        ),
      );
      break;
    }

    case 'revoke': {
      // Resume first, so the next refusal is unmistakably about the person and not the halt.
      await setTrading('tNVDA', true);
      outcomes.push(fromOperator('Venue revokes the investor', await revokeAccess('Alice')));
      outcomes.push(
        fromSwap(
          'Investor buys tNVDA',
          await swap({symbol: 'tNVDA', side: 'buy', amount: '200', asActor: 'Alice'}),
        ),
      );
      outcomes.push(
        fromSwap(
          'Her bot buys tNVDA — nobody touched the bot',
          await swap({symbol: 'tNVDA', side: 'buy', amount: '200', asActor: 'Bot'}),
        ),
      );
      break;
    }

    case 'reset':
      outcomes.push(fromOperator('Venue reset', await resetVenue()));
      break;

    default:
      outcomes.push({label: 'Unknown step', status: 'error'});
  }

  revalidatePath('/', 'layout');
  return {id, outcomes};
}
