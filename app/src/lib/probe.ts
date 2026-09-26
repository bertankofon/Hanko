/**
 * Shape of a transfer simulation result.
 *
 * Lives outside the `'use server'` module because such a file may only export
 * async functions — a plain constant there is a build error.
 */
export interface ProbeResult {
  status: 'idle' | 'allowed' | 'refused' | 'error';
  headline: string;
  detail?: string;
  /** The decoded revert, shown verbatim so the reason is not paraphrased away. */
  revert?: string;
}

export const IDLE: ProbeResult = {status: 'idle', headline: ''};
