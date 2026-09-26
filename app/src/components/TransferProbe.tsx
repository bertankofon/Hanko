'use client';

import {useState, useTransition} from 'react';
import {probeTransfer} from '@/app/pool/actions';
import {IDLE, type ProbeResult} from '@/lib/probe';

const TONE: Record<ProbeResult['status'], string> = {
  idle: '',
  allowed: 'border-pass/40 bg-pass/5',
  refused: 'border-fail/40 bg-fail/5',
  error: 'border-unknown/40 bg-unknown/5',
};

const DOT: Record<ProbeResult['status'], string> = {
  idle: '',
  allowed: 'bg-pass',
  refused: 'bg-fail',
  error: 'bg-unknown',
};

export function TransferProbe({actors, symbol}: {actors: {name: string}[]; symbol: string}) {
  const [from, setFrom] = useState('Alice');
  const [to, setTo] = useState('Stranger');
  const [amount, setAmount] = useState('1');
  const [result, setResult] = useState<ProbeResult>(IDLE);
  const [pending, startTransition] = useTransition();

  // Submitting through `action={...}` makes React reset the form afterwards, which would snap the
  // dropdowns back to their defaults mid-demo. Calling the server action ourselves keeps the
  // chosen actors on screen next to the answer they produced.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    data.set('from', from);
    data.set('to', to);
    data.set('amount', amount);
    startTransition(async () => setResult(await probeTransfer(IDLE, data)));
  }

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-panel">
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Try a transfer</h2>
        <p className="mt-0.5 text-xs text-muted">
          Simulated with <span className="font-mono">eth_call</span> against the deployed token — no
          key, no gas, but the same answer a real transfer would give.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 px-4 py-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">From</span>
          <select
            name="from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-sm"
          >
            {actors.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">To</span>
          <select
            name="to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-sm"
          >
            {actors.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Amount ({symbol})</span>
          <input
            name="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="w-28 rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 font-mono text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-seal px-3 py-1.5 text-sm text-seal hover:bg-seal/10 disabled:opacity-50"
        >
          {pending ? 'Asking the chain…' : 'Simulate'}
        </button>
      </form>

      {result.status !== 'idle' && (
        <div className={`border-t border-line px-4 py-3 ${TONE[result.status]}`}>
          <div className="flex items-start gap-2.5">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[result.status]}`} />
            <div className="min-w-0 text-sm">
              <p>{result.headline}</p>
              {result.detail && <p className="mt-1 text-xs text-muted">{result.detail}</p>}
              {result.revert && (
                <p className="mt-2 rounded-lg border border-line bg-panel px-3 py-2 font-mono text-xs break-all">
                  {result.revert}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
