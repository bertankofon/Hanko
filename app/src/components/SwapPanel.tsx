'use client';

import {useState, useTransition} from 'react';
import {swap} from '@/app/pool/swap-action';
import {SWAP_IDLE, type SwapResult} from '@/lib/swap-result';

const TONE: Record<SwapResult['status'], string> = {
  idle: '',
  ok: 'border-pass/40 bg-pass/5',
  refused: 'border-fail/40 bg-fail/5',
  error: 'border-unknown/40 bg-unknown/5',
};

const DOT: Record<SwapResult['status'], string> = {
  idle: '',
  ok: 'bg-pass',
  refused: 'bg-fail',
  error: 'bg-unknown',
};

const field = 'rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-sm';

export function SwapPanel({actors}: {actors: {name: string}[]}) {
  const [actor, setActor] = useState('Alice');
  const [direction, setDirection] = useState('usdc-in');
  const [amount, setAmount] = useState('100');
  const [result, setResult] = useState<SwapResult>(SWAP_IDLE);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    data.set('actor', actor);
    data.set('direction', direction);
    data.set('amount', amount);
    setResult(SWAP_IDLE);
    startTransition(async () => setResult(await swap(SWAP_IDLE, data)));
  }

  const unit = direction === 'usdc-in' ? 'USDC' : 'tNVDA';

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-panel">
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Swap</h2>
        <p className="mt-0.5 text-xs text-muted">
          A real transaction on Sepolia, signed server-side by the chosen actor, routed through
          UniversalRouter v2.2. Refusals are simulated first, so a rejected attempt costs no gas and
          still reports the contract&apos;s own reason.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 px-4 py-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Actor</span>
          <select className={field} value={actor} onChange={(e) => setActor(e.target.value)}>
            {actors.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Direction</span>
          <select className={field} value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="usdc-in">USDC → tNVDA</option>
            <option value="tnvda-in">tNVDA → USDC</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Amount ({unit})</span>
          <input
            className={`${field} w-28 font-mono`}
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-seal px-3 py-1.5 text-sm text-seal hover:bg-seal/10 disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Swap'}
        </button>
      </form>

      {result.status !== 'idle' && (
        <div className={`border-t border-line px-4 py-3 ${TONE[result.status]}`}>
          <div className="flex items-start gap-2.5">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[result.status]}`} />
            <div className="min-w-0 text-sm">
              <p>{result.headline}</p>
              {result.detail && <p className="mt-1 text-xs leading-relaxed text-muted">{result.detail}</p>}
              {result.revert && (
                <p className="mt-2 rounded-lg border border-line bg-panel px-3 py-2 font-mono text-xs break-all">
                  {result.revert}
                </p>
              )}
              {result.txHash && (
                <a
                  className="mt-2 inline-block font-mono text-xs text-muted underline underline-offset-2 hover:text-ink"
                  href={`https://sepolia.etherscan.io/tx/${result.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {result.txHash.slice(0, 14)}… ↗ Etherscan
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
