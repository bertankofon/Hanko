'use client';

import {useRouter} from 'next/navigation';
import {useState, useTransition} from 'react';
import {setTrading} from '@/app/venue-actions';
import type {OperatorResult} from '@/lib/operator-result';

export interface SymbolState {
  symbol: string;
  name: string;
  underlying: string;
  tradable: boolean;
  adapter: string;
}

const IDLE: OperatorResult = {status: 'idle', headline: ''};

/**
 * One switch per symbol, because that is how the condition reads.
 *
 * "A TSV must stop trading in a tokenized NMS stock concurrently with any stoppage of trading in
 * the underlying NMS stock on the primary listing exchange." Per stock, and it applies to everyone
 * — which is exactly what the adapter's own swapping switch does.
 */
export function HaltControls({symbols}: {symbols: SymbolState[]}) {
  const [result, setResult] = useState<OperatorResult>(IDLE);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function toggle(symbol: string, next: boolean) {
    setBusy(symbol);
    setResult(IDLE);
    startTransition(async () => {
      setResult(await setTrading(symbol, next));
      setBusy(null);
      router.refresh();
    });
  }

  return (
    <div>
      <ul className="overflow-hidden rounded-2xl border border-line bg-panel">
        {symbols.map((entry) => (
          <li
            key={entry.symbol}
            className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4 last:border-b-0"
          >
            <div>
              <p className="text-base font-medium">
                {entry.symbol}{' '}
                <span className="text-muted">· tracks {entry.underlying}</span>
              </p>
              <p className="mt-0.5 text-sm">
                {entry.tradable ? (
                  <span className="text-pass">Trading open</span>
                ) : (
                  <span className="text-fail">Halted by the venue</span>
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => toggle(entry.symbol, !entry.tradable)}
              disabled={busy !== null}
              className={[
                'rounded-xl border px-5 py-2.5 text-base font-medium transition-colors',
                entry.tradable
                  ? 'border-fail/50 text-fail hover:bg-fail/10'
                  : 'border-pass/50 text-pass hover:bg-pass/10',
                busy !== null && busy !== entry.symbol ? 'opacity-40' : '',
              ].join(' ')}
            >
              {busy === entry.symbol ? 'Signing…' : entry.tradable ? `Halt ${entry.symbol}` : `Resume ${entry.symbol}`}
            </button>
          </li>
        ))}
      </ul>

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
