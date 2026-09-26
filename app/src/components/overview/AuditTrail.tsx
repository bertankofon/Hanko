'use client';

import {useStepLoop} from './useStepLoop';

/**
 * The record writing itself.
 *
 * Public notice is a condition of the exemption, and the usual way to meet it is a page the venue
 * publishes and everyone has to trust. Here the record is the events the contracts already emit —
 * ENS registrations and revocations, the adapter's halts, the hook's swaps. Anyone can fetch the
 * same list without the venue's cooperation, which is a different and much stronger thing.
 */

const EVENTS = [
  {kind: 'granted', text: 'capital firm granted a name in swap.tnvda.eth', tone: 'var(--pass)'},
  {kind: 'granted', text: 'bot recorded as an agent of the capital firm', tone: 'var(--pass)'},
  {kind: 'trade', text: 'bot traded 0.72 tNVDA against 100 USDC', tone: 'var(--pending)'},
  {kind: 'halt', text: 'trading halted for this asset', tone: 'var(--fail)'},
  {kind: 'resumed', text: 'trading resumed', tone: 'var(--pass)'},
  {kind: 'revoked', text: 'capital firm revoked by the venue operator', tone: 'var(--fail)'},
];

const DURATIONS = [800, 800, 800, 800, 800, 800, 2600];

export function AuditTrail() {
  const {ref, tick} = useStepLoop(DURATIONS, EVENTS.length);
  const step = tick % DURATIONS.length;

  return (
    <div ref={ref} className="rounded-2xl border border-line bg-panel p-6 sm:p-9">
      <ul className="space-y-2.5">
        {EVENTS.map((event, i) => {
          const shown = step > i;
          return (
            <li
              key={event.text}
              className="flex items-center gap-4 rounded-xl border border-line bg-panel-2 px-5 py-3.5 transition-all duration-500"
              style={{
                opacity: shown ? 1 : 0,
                transform: shown ? 'none' : 'translateX(-10px)',
              }}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{background: event.tone}} />
              <p className="text-body">{event.text}</p>
              <span className="ml-auto shrink-0 font-mono text-sm text-pending">on-chain</span>
            </li>
          );
        })}
      </ul>

      <p className="mt-7 border-t border-line pt-6 text-body text-muted">
        Nobody has to take the venue&apos;s word for any of these. They are contract events, and the
        permissions themselves are ENS names.
      </p>
    </div>
  );
}
