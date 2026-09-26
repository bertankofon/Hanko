/**
 * Shape of a swap attempt's outcome.
 *
 * Kept out of the `'use server'` module, which may only export async functions.
 */
export interface SwapResult {
  status: 'idle' | 'ok' | 'refused' | 'error';
  headline: string;
  detail?: string;
  /** The contract's own error, shown verbatim rather than paraphrased. */
  revert?: string;
  txHash?: string;
}

export const SWAP_IDLE: SwapResult = {status: 'idle', headline: ''};
