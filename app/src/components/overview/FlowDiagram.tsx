'use client';

import {Fragment, useEffect, useRef, useState} from 'react';

/**
 * What happens on every swap, drawn as it happens.
 *
 * The claim the whole project rests on is that the rule runs *inside* the trade rather than beside
 * it, and a sentence saying so is far less convincing than watching the request stop to ask. A
 * pulse travels from the trader through Uniswap's pool to Hanko's checker and into ENS, the answer
 * comes back, and the trade either completes or is refused.
 *
 * The two outcomes alternate on purpose: the refusal is the interesting half.
 */

const NODES = [
  {id: 'trader', label: 'Trader', sub: 'a wallet', brand: null},
  {id: 'pool', label: 'Uniswap v4', sub: 'permissioned pool', brand: '/brand/uniswap-mark-pink.svg'},
  {id: 'checker', label: 'Hanko', sub: 'allowlist checker', brand: null},
  {id: 'ens', label: 'ENS', sub: 'the permission', brand: '/brand/ens-mark-White.svg'},
] as const;

type Phase = 'idle' | 'outbound' | 'asking' | 'answer' | 'settled';

const ALLOWED_STEPS: {phase: Phase; ms: number}[] = [
  {phase: 'outbound', ms: 900},
  {phase: 'asking', ms: 800},
  {phase: 'answer', ms: 900},
  {phase: 'settled', ms: 1600},
  {phase: 'idle', ms: 400},
];

export function FlowDiagram() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [allowed, setAllowed] = useState(true);
  const [running, setRunning] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Only animate while on screen; a loop running in a background tab is wasted work.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase('settled');
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setRunning(entry.isIntersecting), {
      threshold: 0.3,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;

    const advance = () => {
      const current = ALLOWED_STEPS[step % ALLOWED_STEPS.length];
      setPhase(current.phase);
      if (current.phase === 'idle') setAllowed((prev) => !prev);
      step += 1;
      timer = setTimeout(advance, current.ms);
    };

    advance();
    return () => clearTimeout(timer);
  }, [running]);

  const reached = (index: number) => {
    if (phase === 'idle') return false;
    if (phase === 'outbound') return index <= 1;
    if (phase === 'asking') return index <= 3;
    return true;
  };

  const verdictVisible = phase === 'answer' || phase === 'settled';

  return (
    <div ref={ref} className="rounded-2xl border border-line bg-panel p-6 sm:p-9">
      {/* A row on desktop so the connectors sit between the nodes; a stack on phones, where a
          horizontal chain of four would be unreadable. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-0">
        {NODES.map((node, i) => (
          <Fragment key={node.id}>
            <div
              className="rounded-xl border px-5 py-4 transition-all duration-500 sm:flex-1"
              style={{
                borderColor: reached(i) ? 'var(--seal)' : 'var(--border)',
                background: reached(i) ? 'color-mix(in oklab, var(--seal) 8%, transparent)' : 'transparent',
                transform: reached(i) ? 'translateY(-2px)' : 'none',
              }}
            >
              <div className="flex h-7 items-center">
                {node.brand ? (
                  // eslint-disable-next-line @next/next/no-img-element -- fixed-size brand SVG
                  <img src={node.brand} alt={node.label} className="h-6 w-auto" />
                ) : (
                  <span className="text-lg font-semibold">{node.label}</span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted">{node.sub}</p>
            </div>

            {i < NODES.length - 1 && (
              <div className="hidden w-10 shrink-0 sm:block">
                <Connector active={reached(i + 1)} />
              </div>
            )}
          </Fragment>
        ))}
      </div>

      <div className="mt-7 flex min-h-14 items-center justify-between gap-4 border-t border-line pt-6">
        <p className="text-body text-muted">
          {phase === 'idle' && 'A swap is submitted…'}
          {phase === 'outbound' && 'The pool receives it…'}
          {phase === 'asking' && 'It asks the checker, which reads ENS…'}
          {(phase === 'answer' || phase === 'settled') &&
            (allowed ? 'The name resolves. The trade goes through.' : 'No name. The trade never happens.')}
        </p>

        <span
          // Only opacity and scale transition. Colour must not: the verdict flips while the badge
          // is hidden, and a colour that eases would show "Unauthorized" in green on the way in.
          className="shrink-0 rounded-lg border px-4 py-2 text-body font-semibold"
          style={{
            opacity: verdictVisible ? 1 : 0,
            transform: verdictVisible ? 'none' : 'scale(0.94)',
            transition: 'opacity 400ms ease, transform 400ms cubic-bezier(0.16, 1, 0.3, 1)',
            borderColor: allowed ? 'var(--pass)' : 'var(--fail)',
            color: allowed ? 'var(--pass)' : 'var(--fail)',
            background: allowed
              ? 'color-mix(in oklab, var(--pass) 10%, transparent)'
              : 'color-mix(in oklab, var(--fail) 10%, transparent)',
          }}
        >
          {allowed ? 'Allowed' : 'Unauthorized'}
        </span>
      </div>
    </div>
  );
}

/** A line the request travels along, drawn in as it is crossed. */
function Connector({active}: {active: boolean}) {
  return (
    <svg viewBox="0 0 48 8" className="h-2 w-full" aria-hidden>
      <line x1="0" y1="4" x2="48" y2="4" stroke="var(--border)" strokeWidth="1.5" />
      <line
        x1="0"
        y1="4"
        x2="48"
        y2="4"
        stroke="var(--seal)"
        strokeWidth="1.5"
        strokeDasharray="48"
        strokeDashoffset={active ? 0 : 48}
        style={{transition: 'stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1)'}}
      />
      <circle
        cx="48"
        cy="4"
        r="3"
        fill="var(--seal)"
        style={{
          opacity: active ? 1 : 0,
          transition: 'opacity 300ms ease 400ms',
        }}
      />
    </svg>
  );
}
