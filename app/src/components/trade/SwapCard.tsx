'use client';

import {useState, useTransition} from 'react';
import {swap} from '@/app/trade/actions';
import {SWAP_IDLE, type SwapResult} from '@/lib/swap-result';

export interface SwapCardProps {
  symbol: string;
  underlying: string;
  price: number | null;
  tradable: boolean;
  /** What the checker says about the current viewer for this symbol. */
  maySwap: boolean;
  viewerLabel: string;
  usdcBalance: string;
  stockBalance: string;
}

const TONE: Record<SwapResult['status'], string> = {
  idle: '',
  ok: 'border-pass/40 bg-pass/5',
  refused: 'border-fail/40 bg-fail/5',
  error: 'border-unknown/40 bg-unknown/5',
};

/**
 * The trading panel, shaped like the one people already know.
 *
 * The only thing that differs from an ordinary AMM swap box is the line under the button: before
 * anything is signed, the pool has already been asked whether this wallet may trade, and the
 * answer is shown rather than discovered on failure.
 */
export function SwapCard(props: SwapCardProps) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('1000');
  const [result, setResult] = useState<SwapResult>(SWAP_IDLE);
  const [pending, startTransition] = useTransition();

  const buying = side === 'buy';
  const payUnit = buying ? 'USDC' : props.symbol;
  const getUnit = buying ? props.symbol : 'USDC';
  const payBalance = buying ? props.usdcBalance : props.stockBalance;

  const parsed = Number(amount);
  const estimate =
    props.price && Number.isFinite(parsed) && parsed > 0
      ? buying
        ? parsed / props.price
        : parsed * props.price
      : null;

  const blocked = !props.tradable || !props.maySwap;

  function submit() {
    setResult(SWAP_IDLE);
    startTransition(async () => {
      setResult(await swap({symbol: props.symbol, side, amount}));
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex gap-1 rounded-xl bg-panel-2 p-1">
        {(['buy', 'sell'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSide(option)}
            className={[
              'flex-1 rounded-lg py-2 text-base font-medium capitalize transition-colors',
              side === option ? 'bg-panel text-ink' : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-line bg-panel-2 px-4 py-3">
        <div className="flex items-center justify-between text-sm text-muted">
          <span>You pay</span>
          <span>
            Balance {payBalance} {payUnit}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            className="w-full bg-transparent text-3xl font-medium tracking-tight outline-none"
          />
          <span className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-base font-medium">
            {payUnit}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-line bg-panel-2 px-4 py-3">
        <p className="text-sm text-muted">You receive, about</p>
        <div className="mt-1 flex items-center gap-3">
          <span className="w-full truncate text-3xl font-medium tracking-tight text-muted">
            {estimate === null ? '—' : estimate.toLocaleString('en-US', {maximumFractionDigits: 4})}
          </span>
          <span className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-base font-medium">
            {getUnit}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className={[
          'mt-3 w-full rounded-xl px-4 py-3.5 text-base font-semibold transition-colors',
          blocked
            ? 'border border-fail/50 bg-fail/10 text-fail hover:bg-fail/15'
            : 'border border-seal bg-seal/15 text-seal hover:bg-seal/25',
          pending ? 'opacity-60' : '',
        ].join(' ')}
      >
        {pending ? 'Signing…' : blocked ? `Try anyway as ${props.viewerLabel}` : `${buying ? 'Buy' : 'Sell'} ${props.symbol}`}
      </button>

      {/* The honest line: the answer exists before the attempt, and we show it. */}
      <p className="mt-3 text-center text-sm">
        {!props.tradable ? (
          <span className="text-fail">Trading in {props.symbol} is halted by the venue.</span>
        ) : props.maySwap ? (
          <span className="text-pass">This wallet holds a swap seal. The pool will allow it.</span>
        ) : (
          <span className="text-fail">This wallet holds no swap seal. The pool will refuse.</span>
        )}
      </p>

      {result.status !== 'idle' && (
        <div className={`mt-3 rounded-xl border px-4 py-3 text-sm ${TONE[result.status]}`}>
          <p className="font-semibold">{result.headline}</p>
          {result.detail && <p className="mt-1 text-muted">{result.detail}</p>}
          {result.revert && (
            <p className="mt-2 font-mono text-xs text-fail">reverted with {result.revert}</p>
          )}
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
    </section>
  );
}
