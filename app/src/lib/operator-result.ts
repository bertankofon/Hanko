import type {Address} from 'viem';

/**
 * Outcome of an operator action.
 *
 * Kept out of the `'use server'` module, which may only export async functions.
 */
export interface OperatorResult {
  status: 'idle' | 'ok' | 'error';
  headline: string;
  detail?: string;
  txHash?: Address;
}

export const OPERATOR_IDLE: OperatorResult = {status: 'idle', headline: ''};
