'use client';

import {useRouter} from 'next/navigation';
import {useState, useTransition} from 'react';
import {revokeAccess, setTrading, unwind} from '@/app/issuer/actions';
import {OPERATOR_IDLE, type OperatorResult} from '@/lib/operator-result';

const TONE: Record<OperatorResult['status'], string> = {
  idle: '',
  ok: 'border-pass/40 bg-pass/5',
  error: 'border-fail/40 bg-fail/5',
};

const DOT: Record<OperatorResult['status'], string> = {idle: '', ok: 'bg-pass', error: 'bg-fail'};

function Result({result}: {result: OperatorResult}) {
  if (result.status === 'idle') return null;
  return (
    <div className={`mt-3 rounded-lg border border-line px-3 py-2.5 ${TONE[result.status]}`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[result.status]}`} />
        <div className="min-w-0 text-sm">
          <p>{result.headline}</p>
          {result.detail && <p className="mt-1 text-xs leading-relaxed text-muted">{result.detail}</p>}
          {result.txHash && (
            <a
              className="mt-1.5 inline-block font-mono text-xs text-muted underline underline-offset-2 hover:text-ink"
              href={`https://sepolia.etherscan.io/tx/${result.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {result.txHash.slice(0, 14)}… ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  why,
  children,
}: {
  title: string;
  why: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-panel px-4 py-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-0.5 mb-3 text-xs leading-relaxed text-muted">{why}</p>
      {children}
    </section>
  );
}

const button =
  'rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-seal/10 border-seal text-seal';
const field = 'rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-sm';

export function OperatorControls({
  actors,
  tradingEnabled,
  positionTokenId,
}: {
  actors: {name: string}[];
  tradingEnabled: boolean;
  positionTokenId: string | null;
}) {
  const [halt, setHalt] = useState<OperatorResult>(OPERATOR_IDLE);
  const [revoke, setRevoke] = useState<OperatorResult>(OPERATOR_IDLE);
  const [unwound, setUnwound] = useState<OperatorResult>(OPERATOR_IDLE);
  const [target, setTarget] = useState(actors[1]?.name ?? actors[0]?.name ?? '');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (
    fn: (prev: OperatorResult, data: FormData) => Promise<OperatorResult>,
    data: FormData,
    set: (r: OperatorResult) => void,
  ) => {
    set(OPERATOR_IDLE);
    startTransition(async () => {
      const result = await fn(OPERATOR_IDLE, data);
      set(result);
      // These actions change what the page reports about itself, so re-read the chain rather
      // than leaving a stale banner above a result that contradicts it.
      if (result.status === 'ok') router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Card
        title="Trading halt"
        why="The order requires a venue to stop trading a tokenized stock when the primary listing exchange does. This is that switch: it stops everyone at once, cleared participants included."
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending || !tradingEnabled}
            className={button}
            onClick={() => {
              const d = new FormData();
              d.set('enabled', 'false');
              run(setTrading, d, setHalt);
            }}
          >
            Halt trading
          </button>
          <button
            type="button"
            disabled={pending || tradingEnabled}
            className={`${button} border-pass text-pass hover:bg-pass/10`}
            onClick={() => {
              const d = new FormData();
              d.set('enabled', 'true');
              run(setTrading, d, setHalt);
            }}
          >
            Resume
          </button>
          <span className="text-xs text-muted">
            currently {tradingEnabled ? 'open' : 'halted'}
          </span>
        </div>
        <Result result={halt} />
      </Card>

      <Card
        title="Revoke access"
        why="Clears the investor's names in both registries. Anyone acting as their agent loses access in the same transaction — there is no separate list of agents to go and clean up."
      >
        <div className="flex flex-wrap items-end gap-2">
          <select className={field} value={target} onChange={(e) => setTarget(e.target.value)}>
            {actors.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            className={`${button} border-fail text-fail hover:bg-fail/10`}
            onClick={() => {
              const d = new FormData();
              d.set('actor', target);
              run(revokeAccess, d, setRevoke);
            }}
          >
            Revoke
          </button>
        </div>
        <Result result={revoke} />
      </Card>

      <Card
        title="Unwind a position"
        why="Barring someone must not strand their capital. This force-closes the position and delivers both assets back to the liquidity provider, so revocation is a control rather than a trap."
      >
        {positionTokenId ? (
          <button
            type="button"
            disabled={pending}
            className={button}
            onClick={() => {
              const d = new FormData();
              d.set('tokenId', positionTokenId);
              run(unwind, d, setUnwound);
            }}
          >
            Unwind position #{positionTokenId}
          </button>
        ) : (
          <p className="text-xs text-muted">No position recorded yet.</p>
        )}
        <Result result={unwound} />
      </Card>
    </div>
  );
}
