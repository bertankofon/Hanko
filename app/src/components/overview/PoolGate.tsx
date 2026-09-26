'use client';

import {useStepLoop} from './useStepLoop';

/**
 * What Uniswap's permissioned pools already give you, animated.
 *
 * A wallet arrives, the pool asks its allowlist checker whether that address is approved, and the
 * trade goes through or does not. The important thing the picture makes visible is the *empty
 * socket*: Uniswap defines the question and the interface, and leaves the answer to whoever runs
 * the venue. That socket is where Hanko goes, and the next diagram fills it.
 */

const ARRIVALS = [
  {address: '0x053674af…8055c9', approved: true},
  {address: '0x2f6c3bde…9f297d', approved: false},
  {address: '0xc408d425…2b2226', approved: false},
];

// arrive · ask · answer · hold
const DURATIONS = [850, 750, 700, 1400];

export function PoolGate() {
  const {ref, tick} = useStepLoop(DURATIONS);

  const phase = tick % 4;
  const arrival = ARRIVALS[Math.floor(tick / 4) % ARRIVALS.length];

  const arrived = phase >= 0;
  const asking = phase >= 1;
  const answered = phase >= 2;

  return (
    <div ref={ref} className="rounded-2xl border border-line bg-panel p-6 sm:p-9">
      <div className="grid items-center gap-5 sm:grid-cols-[1fr_auto_1fr]">
        {/* the wallet */}
        <div
          className="rounded-xl border border-line bg-panel-2 px-5 py-4 transition-all duration-700"
          style={{
            opacity: arrived ? 1 : 0,
            transform: arrived ? 'none' : 'translateX(-14px)',
          }}
        >
          <p className="text-sm text-muted">a wallet wants to trade</p>
          <p className="mt-1 font-mono text-body text-ink">{arrival.address}</p>
        </div>

        {/* the pool */}
        <div
          className="rounded-xl border px-6 py-5 text-center transition-all duration-500"
          style={{
            borderColor: asking ? 'var(--seal)' : 'var(--border)',
            background: asking ? 'color-mix(in oklab, var(--seal) 8%, transparent)' : 'transparent',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size brand SVG */}
          <img src="/brand/uniswap-logo-white.svg" alt="Uniswap" className="mx-auto h-6 w-auto" />
          <p className="mt-2 text-sm text-muted">permissioned pool</p>

          <div
            className="mt-4 rounded-lg border border-dashed px-4 py-3 transition-colors duration-500"
            style={{borderColor: asking ? 'var(--seal)' : 'var(--border)'}}
          >
            <p className="text-sm text-muted">allowlist checker</p>
            <p className="mt-0.5 text-body font-semibold" style={{color: 'var(--pending)'}}>
              your implementation
            </p>
          </div>
        </div>

        {/* the verdict */}
        <div
          className="rounded-xl border px-5 py-4 transition-all duration-500"
          style={{
            opacity: answered ? 1 : 0.15,
            transform: answered ? 'none' : 'translateX(-10px)',
            borderColor: !answered
              ? 'var(--border)'
              : arrival.approved
                ? 'var(--pass)'
                : 'var(--fail)',
            background: !answered
              ? 'transparent'
              : arrival.approved
                ? 'color-mix(in oklab, var(--pass) 10%, transparent)'
                : 'color-mix(in oklab, var(--fail) 10%, transparent)',
          }}
        >
          <p className="text-sm text-muted">the pool answers</p>
          <p
            className="mt-1 text-body font-semibold"
            style={{color: arrival.approved ? 'var(--pass)' : 'var(--fail)'}}
          >
            {arrival.approved ? 'approved — trade goes through' : 'not approved — reverted'}
          </p>
        </div>
      </div>

      <p className="mt-7 border-t border-line pt-6 text-body text-muted">
        {phase <= 1
          ? 'The pool asks one question: is this address approved?'
          : 'A yes or a no. Nothing about how long, or with what scope.'}
      </p>
    </div>
  );
}
