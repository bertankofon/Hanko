'use client';

import {useRouter} from 'next/navigation';
import {useState, useTransition} from 'react';
import {delegate, grantAccess, resetVenue, revokeAccess, undelegate} from '@/app/venue-actions';
import type {OperatorResult} from '@/lib/operator-result';

type Kind = 'grant' | 'revoke' | 'delegate' | 'undelegate' | 'reset';

export interface ActionSpec {
  kind: Kind;
  actor?: string;
  label: string;
  hint: string;
  tone?: 'danger';
}

const IDLE: OperatorResult = {status: 'idle', headline: ''};

async function run(spec: ActionSpec): Promise<OperatorResult> {
  switch (spec.kind) {
    case 'grant':
      return grantAccess(spec.actor!);
    case 'revoke':
      return revokeAccess(spec.actor!);
    case 'delegate':
      return delegate();
    case 'undelegate':
      return undelegate();
    case 'reset':
      return resetVenue();
  }
}

/** The writes available to whoever is looking, with the outcome shown where it happened. */
export function AccessActions({actions}: {actions: ActionSpec[]}) {
  const [result, setResult] = useState<OperatorResult>(IDLE);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function onClick(spec: ActionSpec) {
    setBusy(spec.label);
    setResult(IDLE);
    startTransition(async () => {
      setResult(await run(spec));
      setBusy(null);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {actions.map((spec) => (
          <button
            key={spec.label}
            type="button"
            onClick={() => onClick(spec)}
            disabled={busy !== null}
            className={[
              'rounded-xl border px-4 py-3 text-left transition-colors',
              spec.tone === 'danger'
                ? 'border-fail/40 hover:bg-fail/10'
                : 'border-line hover:border-seal/60 hover:bg-panel-2',
              busy !== null && busy !== spec.label ? 'opacity-40' : '',
            ].join(' ')}
          >
            <span className="block text-base font-medium">
              {busy === spec.label ? 'Signing…' : spec.label}
            </span>
            <span className="mt-0.5 block text-sm text-muted">{spec.hint}</span>
          </button>
        ))}
      </div>

      {result.status !== 'idle' && (
        <div
          className={[
            'mt-4 rounded-xl border px-4 py-3 text-sm',
            result.status === 'ok' ? 'border-pass/40 bg-pass/5' : 'border-unknown/40 bg-unknown/5',
          ].join(' ')}
        >
          <p className="text-base font-semibold">{result.headline}</p>
          {result.detail && <p className="mt-1 text-muted">{result.detail}</p>}
          {result.txHash && (
            <a
              className="mt-2 inline-block underline underline-offset-4 hover:text-ink"
              href={`https://sepolia.etherscan.io/tx/${result.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View on Etherscan ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
