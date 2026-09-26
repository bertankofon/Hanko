/**
 * The order's conditions on a tokenized securities venue, and which of them Hanko answers.
 *
 * The honest column matters more than the ticks. A project that claimed all six would be lying,
 * and the two it does not address are the two a hackathon weekend cannot: token design and issuer
 * notice are business processes, not access control.
 */

interface Condition {
  text: string;
  answer: 'yes' | 'partial' | 'out';
  note: string;
}

const CONDITIONS: Condition[] = [
  {
    text: 'Limits on the number of symbols and the volume traded',
    answer: 'out',
    note: 'Out of scope — a venue policy, not an access rule.',
  },
  {
    text: 'The tokenized stock must give holders the same rights as the traditional stock',
    answer: 'out',
    note: 'Out of scope — token design, upstream of us.',
  },
  {
    text: 'Written notice and a right to object for the issuer of the underlying stock',
    answer: 'out',
    note: 'Roadmap — an on-chain objection record would fit the same registries.',
  },
  {
    text: 'Smart contracts must be auditable, public, and on a public permissionless ledger',
    answer: 'yes',
    note: 'Open source, verified on Etherscan, deployed to Sepolia.',
  },
  {
    text: 'Trading must stop when the primary listing exchange stops trading the underlying',
    answer: 'yes',
    note: 'One switch on the adapter halts every swap, cleared participants included.',
  },
  {
    text: 'Public notice about operations and trading activity',
    answer: 'yes',
    note: 'Every grant, revocation, halt and trade is an on-chain event anyone can read.',
  },
];

const MARK: Record<Condition['answer'], {glyph: string; className: string; label: string}> = {
  yes: {glyph: '✓', className: 'text-pass border-pass/40 bg-pass/10', label: 'answered'},
  partial: {glyph: '~', className: 'text-unknown border-unknown/40 bg-unknown/10', label: 'partial'},
  out: {glyph: '—', className: 'text-muted border-line bg-panel-2', label: 'out of scope'},
};

export function Conditions() {
  return (
    <ul className="space-y-3">
      {CONDITIONS.map((c) => {
        const mark = MARK[c.answer];
        return (
          <li
            key={c.text}
            className="flex items-start gap-4 rounded-xl border border-line bg-panel px-5 py-4"
          >
            <span
              className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold ${mark.className}`}
              aria-label={mark.label}
            >
              {mark.glyph}
            </span>
            <div className="min-w-0">
              <p className="text-body">{c.text}</p>
              <p className={`mt-1 text-sm ${c.answer === 'yes' ? 'text-ink/70' : 'text-muted'}`}>
                {c.note}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
