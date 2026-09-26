'use client';

import {useStepLoop} from './useStepLoop';

/**
 * Two ways a venue stops trading, and who is allowed to do which.
 *
 * The order requires a venue to halt an asset when its primary exchange does. That is one lever,
 * and it stops everyone. Revoking a single participant is a different lever with a different
 * holder, and ENSv2's role system is what keeps them apart: the role that admits a member and the
 * role that clears one are separate grants, so neither party can do the other's job.
 */

// open · halt · held · resume · revoke one · held
const DURATIONS = [1500, 900, 1800, 900, 1400, 2000];

const MEMBERS = [
  {name: 'capital firm', scope: 'swap + liquidity'},
  {name: 'its trading bot', scope: 'swap only'},
  {name: 'a liquidity desk', scope: 'liquidity only'},
];

export function SeparatedPowers() {
  const {ref, tick} = useStepLoop(DURATIONS, 0);
  const step = tick % DURATIONS.length;

  const halted = step === 1 || step === 2;
  const revokedFirm = step >= 4;

  const state = (i: number) => {
    if (halted) return 'halted';
    // Revoking the firm takes its bot with it; the desk is untouched.
    if (revokedFirm && i <= 1) return 'revoked';
    return 'live';
  };

  const STYLE = {
    live: {color: 'var(--pass)', border: 'var(--pass)', label: 'trading'},
    halted: {color: 'var(--unknown)', border: 'var(--unknown)', label: 'halted'},
    revoked: {color: 'var(--fail)', border: 'var(--fail)', label: 'no access'},
  } as const;

  return (
    <div ref={ref} className="rounded-2xl border border-line bg-panel p-6 sm:p-9">
      <div className="space-y-3">
        {MEMBERS.map((member, i) => {
          const style = STYLE[state(i)];
          return (
            <div
              key={member.name}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-5 py-4 transition-colors duration-500"
              style={{
                borderColor: style.border,
                background: `color-mix(in oklab, ${style.border} 7%, transparent)`,
                marginLeft: i === 1 ? '1.75rem' : 0,
              }}
            >
              <div>
                <p className="text-body">
                  {i === 1 && <span className="text-pending">└─ </span>}
                  {member.name}
                </p>
                <p className="mt-0.5 text-sm text-muted">{member.scope}</p>
              </div>
              <span className="text-body font-semibold" style={{color: style.color}}>
                {style.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-7 grid gap-4 border-t border-line pt-6 sm:grid-cols-2">
        <div
          className="rounded-lg border px-4 py-3 transition-colors duration-500"
          style={{
            borderColor: halted ? 'var(--unknown)' : 'var(--border)',
            background: halted ? 'color-mix(in oklab, var(--unknown) 8%, transparent)' : 'transparent',
          }}
        >
          <p className="text-body font-semibold">Halt the asset</p>
          <p className="mt-1 text-sm text-muted">Stops everyone, cleared or not.</p>
        </div>
        <div
          className="rounded-lg border px-4 py-3 transition-colors duration-500"
          style={{
            borderColor: revokedFirm ? 'var(--fail)' : 'var(--border)',
            background: revokedFirm ? 'color-mix(in oklab, var(--fail) 8%, transparent)' : 'transparent',
          }}
        >
          <p className="text-body font-semibold">Revoke a member</p>
          <p className="mt-1 text-sm text-muted">Takes their agents with them.</p>
        </div>
      </div>

      <p className="mt-6 text-body text-muted">
        {step <= 0 && 'Three members, each with the scope they were granted.'}
        {halted && 'The underlying halted on its exchange. The venue halts here, at the same moment.'}
        {step === 3 && 'Trading resumes for everyone who still holds a name.'}
        {revokedFirm &&
          'The firm is revoked. Its bot goes with it; the liquidity desk is untouched.'}
      </p>
    </div>
  );
}
