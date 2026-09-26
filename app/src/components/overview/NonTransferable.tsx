'use client';

import {useStepLoop} from './useStepLoop';

/**
 * A seal refusing to move.
 *
 * ENSv2 makes transferability a role, and Hanko registers every member name without it. So a
 * cleared investor cannot sell, lend or hand their access to a wallet the venue never cleared —
 * the attempt reverts at the registry, not at a policy layer that has to be remembered.
 */

// rest · lift · travel · reject · snap back
const DURATIONS = [1400, 500, 800, 1100, 700];

export function NonTransferable() {
  const {ref, tick} = useStepLoop(DURATIONS, 3);
  const step = tick % DURATIONS.length;

  const moving = step === 2 || step === 3;
  const rejected = step === 3;

  return (
    <div ref={ref} className="rounded-2xl border border-line bg-panel p-6 sm:p-9">
      <div className="grid items-center gap-5 sm:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-xl border border-pass/50 bg-pass/5 px-5 py-4">
          <p className="text-sm text-muted">cleared investor</p>
          <p className="mt-1 font-mono text-body">0x053674af…8055c9</p>
        </div>

        {/* the seal, trying to travel */}
        <div className="relative h-16 sm:w-40">
          <div
            className="absolute top-1/2 size-12 -translate-y-1/2 transition-all duration-700"
            style={{
              left: moving ? 'calc(100% - 3rem)' : '0',
              transform: `translateY(-50%) ${step === 1 ? 'scale(1.12)' : 'scale(1)'} ${rejected ? 'rotate(-14deg)' : ''}`,
              filter: rejected ? 'grayscale(0.55) brightness(0.8)' : 'none',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size brand asset */}
            <img src="/brand/hanko-mark-trimmed.webp" alt="the seal" className="size-full object-contain" />
          </div>
        </div>

        <div
          className="rounded-xl border px-5 py-4 transition-colors duration-500"
          style={{
            borderColor: rejected ? 'var(--fail)' : 'var(--border)',
            background: rejected ? 'color-mix(in oklab, var(--fail) 8%, transparent)' : 'transparent',
          }}
        >
          <p className="text-sm text-muted">a wallet the venue never cleared</p>
          <p className="mt-1 font-mono text-body">0x2f6c3bde…9f297d</p>
        </div>
      </div>

      <p
        className="mt-7 border-t border-line pt-6 text-body transition-colors duration-500"
        style={{color: rejected ? 'var(--fail)' : 'var(--muted)'}}
      >
        {step <= 1 && 'A seal sits with the wallet it was granted to.'}
        {step === 2 && 'An attempt to pass it on…'}
        {rejected && 'Reverted. The name was registered with no transfer role — access is not an asset.'}
        {step === 4 && 'It stays where the venue put it.'}
      </p>
    </div>
  );
}
