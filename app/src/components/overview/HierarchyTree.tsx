'use client';

import {useStepLoop} from './useStepLoop';

/**
 * The name tree building itself, branch by branch, then collapsing when the branch above it goes.
 *
 * This is the argument for ENS in one picture. A capital firm is cleared once; its bots hang
 * underneath its own name and need no separate clearance. Revoke the firm and every bot under it
 * stops resolving in the same transaction — not because we cascade anything, but because a child
 * of a lapsed name has nothing to resolve through.
 *
 * The addresses are the real ones from the Sepolia deployment.
 */

interface Branch {
  indent: number;
  name: string;
  note: string;
  /** Step at which this branch appears. */
  at: number;
}

const BRANCHES: Branch[] = [
  {indent: 0, name: 'tnvda.eth', note: 'the venue registers the asset', at: 1},
  {indent: 1, name: 'swap.tnvda.eth', note: 'a name here means: may trade', at: 2},
  {indent: 1, name: 'lp.tnvda.eth', note: 'a name here means: may provide liquidity', at: 3},
  {
    indent: 2,
    name: '0x053674af….swap.tnvda.eth',
    note: 'the capital firm, cleared once',
    at: 4,
  },
  {
    indent: 3,
    name: '0xc408d425….0x053674af….swap.tnvda.eth',
    note: 'its bot — the firm grants this itself, no second clearance',
    at: 5,
  },
];

// build · build · build · build · build · hold · revoke · hold
const DURATIONS = [700, 700, 700, 900, 900, 2200, 1200, 2000];
const REVOKE_STEP = 6;

export function HierarchyTree() {
  const {ref, tick} = useStepLoop(DURATIONS, 5);

  const step = tick % DURATIONS.length;
  const revoked = step >= REVOKE_STEP;

  const visible = (branch: Branch) => step >= branch.at;
  // Revoking the firm takes its own name and everything under it; the venue's own registries stay.
  const dead = (branch: Branch) => revoked && branch.indent >= 2;

  return (
    <div ref={ref} className="rounded-2xl border border-line bg-panel p-6 sm:p-9">
      <div className="space-y-2.5 font-mono">
        {BRANCHES.map((branch) => (
          <div
            key={branch.name}
            className="transition-all duration-500"
            style={{
              opacity: visible(branch) ? (dead(branch) ? 0.28 : 1) : 0,
              transform: visible(branch) ? 'none' : 'translateY(-6px)',
              paddingLeft: `${branch.indent * 1.6}rem`,
            }}
          >
            <p className="flex flex-wrap items-baseline gap-x-3 break-all">
              {branch.indent > 0 && <span className="text-pending">└─</span>}
              <span
                className="text-body transition-colors duration-500"
                style={{
                  color: dead(branch) ? 'var(--fail)' : branch.indent >= 2 ? 'var(--seal)' : 'var(--text)',
                  textDecoration: dead(branch) ? 'line-through' : 'none',
                }}
              >
                {branch.name}
              </span>
            </p>
            <p
              className="mt-0.5 pl-8 font-sans text-sm text-muted transition-opacity duration-500"
              style={{opacity: dead(branch) ? 0 : 1}}
            >
              {branch.note}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-7 border-t border-line pt-6">
        <p
          className="text-body transition-colors duration-500"
          style={{color: revoked ? 'var(--fail)' : 'var(--muted)'}}
        >
          {step < 4 && 'The venue lays out its registries.'}
          {step === 4 && 'One firm is cleared — once.'}
          {step === 5 && 'The firm grants its own bot a name inside its registry. The venue is not asked.'}
          {revoked && 'The venue revokes the firm. Its bot stops trading in the same transaction.'}
        </p>
      </div>
    </div>
  );
}
