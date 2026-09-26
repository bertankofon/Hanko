'use client';

import {useStepLoop} from './useStepLoop';

/**
 * The same socket, with Hanko in it.
 *
 * The pool still asks about an address. What changes is what the answer is made of: the checker
 * resolves that address into a name under `tnvda.eth`, and the shape of the name carries what a
 * boolean cannot — which permission, whose agent, and for how long.
 *
 * Three arrivals, because the three shapes are the whole point: an investor with names of their
 * own, an agent holding a name *inside* an investor's registry, and a wallet with no name at all.
 */

interface Arrival {
  label: string;
  address: string;
  /** Drawn one segment at a time, so the name assembles rather than appears. */
  segments: string[];
  found: boolean;
  swap: boolean;
  lp: boolean;
  note: string;
}

const ARRIVALS: Arrival[] = [
  {
    label: 'a cleared investor',
    address: '0x053674af…8055c9',
    segments: ['0x053674af…', '.swap', '.tnvda.eth'],
    found: true,
    swap: true,
    lp: true,
    note: 'Her own name, in both registries. She may trade and provide liquidity.',
  },
  {
    label: 'her trading bot',
    address: '0xc408d425…2b2226',
    segments: ['0xc408d425…', '.0x053674af…', '.swap.tnvda.eth'],
    found: true,
    swap: true,
    lp: false,
    note: 'A name inside her registry, not beside it. Trading only — and it dies the moment hers does.',
  },
  {
    label: 'nobody in particular',
    address: '0x2f6c3bde…9f297d',
    segments: ['0x2f6c3bde…', ' — no name'],
    found: false,
    swap: false,
    lp: false,
    note: 'Funded, willing, and not cleared. The pool never reaches the trade.',
  },
];

// arrive · resolve · answer · hold
const DURATIONS = [800, 1100, 800, 1800];

function Flag({on, label}: {on: boolean; label: string}) {
  return (
    <span
      className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors duration-500"
      style={{
        borderColor: on ? 'var(--pass)' : 'var(--border)',
        color: on ? 'var(--pass)' : 'var(--pending)',
        background: on ? 'color-mix(in oklab, var(--pass) 10%, transparent)' : 'transparent',
      }}
    >
      {on ? '✓' : '✗'} {label}
    </span>
  );
}

export function NameResolution() {
  const {ref, tick} = useStepLoop(DURATIONS);

  const phase = tick % 4;
  const arrival = ARRIVALS[Math.floor(tick / 4) % ARRIVALS.length];

  const resolving = phase >= 1;
  const answered = phase >= 2;

  return (
    <div ref={ref} className="rounded-2xl border border-line bg-panel p-6 sm:p-9">
      {/* the socket, now filled */}
      <div className="flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size brand SVG */}
        <img src="/brand/uniswap-logo-white.svg" alt="Uniswap" className="h-6 w-auto" />
        <span className="text-muted">asks</span>
        <span className="rounded-lg border border-seal bg-seal/10 px-4 py-2 text-body font-semibold text-seal">
          判 Hanko
        </span>
        <span className="text-muted">which reads</span>
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size brand SVG */}
        <img src="/brand/ens-logo-White.svg" alt="ENS" className="h-6 w-auto" />
      </div>

      <div className="mt-8 rounded-xl border border-line bg-panel-2 px-5 py-5">
        <p className="text-sm text-muted">{arrival.label}</p>

        {/* the address becoming a name */}
        <p className="mt-2 font-mono text-lead break-all">
          {arrival.segments.map((segment, i) => (
            <span
              key={segment}
              className="transition-all duration-500"
              style={{
                opacity: i === 0 || resolving ? 1 : 0.12,
                color: i === 0 ? 'var(--text)' : arrival.found ? 'var(--seal)' : 'var(--muted)',
                transitionDelay: `${i * 260}ms`,
              }}
            >
              {segment}
            </span>
          ))}
        </p>

        <p
          className="mt-3 text-sm text-muted transition-opacity duration-500"
          style={{opacity: resolving ? 1 : 0}}
        >
          {arrival.found
            ? 'resolved — the name exists and belongs to this wallet'
            : 'no name resolves for this wallet'}
        </p>
      </div>

      {/* what the answer carries */}
      <div
        className="mt-6 flex flex-wrap items-center gap-3 transition-all duration-500"
        style={{opacity: answered ? 1 : 0.15, transform: answered ? 'none' : 'translateY(6px)'}}
      >
        <Flag on={arrival.swap} label="swap" />
        <Flag on={arrival.lp} label="liquidity" />
        <span className="text-body text-muted">{arrival.note}</span>
      </div>
    </div>
  );
}
