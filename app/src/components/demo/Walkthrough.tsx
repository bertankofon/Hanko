'use client';

import {useRouter} from 'next/navigation';
import {useState, useTransition} from 'react';
import {runStep, type StepResult} from '@/app/demo/actions';
import type {DemoStep} from '@/lib/demo-steps';

const ACTOR_TONE: Record<DemoStep['actor'], string> = {
  'Venue operator': 'border-seal/50 text-seal',
  'A stranger': 'border-line text-muted',
  'The investor': 'border-pass/40 text-pass',
  'Her bot': 'border-pass/40 text-pass',
};

const STATUS_TONE = {
  ok: {dot: 'bg-pass', text: 'text-pass', word: 'allowed'},
  refused: {dot: 'bg-fail', text: 'text-fail', word: 'refused'},
  error: {dot: 'bg-unknown', text: 'text-unknown', word: 'failed'},
} as const;

/**
 * The venue's story, one real transaction at a time.
 *
 * Nothing here is staged: every button signs on Sepolia and shows what came back, including the
 * refusals. A refusal is the product working, so it is drawn as an outcome rather than an error.
 */
export function Walkthrough({steps}: {steps: DemoStep[]}) {
  const [results, setResults] = useState<Record<string, StepResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function run(id: string) {
    setRunning(id);
    startTransition(async () => {
      const result = await runStep(id);
      setResults((prev) => ({...prev, [id]: result}));
      setRunning(null);
      router.refresh();
    });
  }

  return (
    <ol className="space-y-3">
      {steps.map((step, index) => {
        const result = results[step.id];
        const busy = running === step.id;
        const done = Boolean(result);

        return (
          <li
            key={step.id}
            className={[
              'rounded-2xl border bg-panel p-5 transition-colors',
              done ? 'border-line' : 'border-line',
            ].join(' ')}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line text-sm text-muted">
                    {index + 1}
                  </span>
                  <h3 className="text-lg font-semibold tracking-tight">{step.title}</h3>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${ACTOR_TONE[step.actor]}`}
                  >
                    {step.actor}
                  </span>
                </div>
                <p className="mt-2 text-body text-muted">{step.claim}</p>
                {!done && (
                  <p className="mt-1 text-sm text-pending">Expect: {step.expect}</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => run(step.id)}
                disabled={busy || running !== null}
                className={[
                  'shrink-0 rounded-xl border px-5 py-2.5 text-base font-medium transition-colors',
                  done
                    ? 'border-line text-muted hover:text-ink'
                    : 'border-seal bg-seal/15 text-seal hover:bg-seal/25',
                  running !== null && !busy ? 'opacity-40' : '',
                ].join(' ')}
              >
                {busy ? 'Signing…' : done ? 'Run again' : 'Run'}
              </button>
            </div>

            {result && (
              <ul className="mt-4 space-y-2 border-t border-line pt-4">
                {result.outcomes.map((outcome, i) => {
                  const tone = STATUS_TONE[outcome.status];
                  return (
                    <li key={i} className="flex gap-3">
                      <span className={`mt-2 size-2 shrink-0 rounded-full ${tone.dot}`} />
                      <span className="min-w-0">
                        <span className="text-base">
                          {outcome.label} — <span className={tone.text}>{tone.word}</span>
                        </span>
                        {outcome.detail && (
                          <span className="mt-0.5 block text-sm text-muted">{outcome.detail}</span>
                        )}
                        {outcome.revert && (
                          <span className="mt-1 block font-mono text-xs text-fail">
                            reverted with {outcome.revert}
                          </span>
                        )}
                        {outcome.txHash && (
                          <a
                            className="mt-1 inline-block text-sm text-muted underline underline-offset-4 hover:text-ink"
                            href={`https://sepolia.etherscan.io/tx/${outcome.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View on Etherscan ↗
                          </a>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
