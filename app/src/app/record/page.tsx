import {RefreshButton} from '@/components/RefreshButton';
import {getActors} from '@/lib/actors';
import {loadAudit, type AuditKind} from '@/lib/audit';
import {explorer, hankoAddress} from '@/lib/hanko';
import {ensExplorer} from '@/lib/operator';

export const dynamic = 'force-dynamic';

export const metadata = {title: 'Record — Hanko'};

const DOT: Record<AuditKind, string> = {
  granted: 'bg-pass',
  revoked: 'bg-fail',
  halted: 'bg-fail',
  resumed: 'bg-pass',
  checker: 'bg-seal',
  swap: 'bg-pending',
  unwound: 'bg-unknown',
};

const KIND_LABEL: Record<AuditKind, string> = {
  granted: 'granted',
  revoked: 'revoked',
  halted: 'halt',
  resumed: 'resumed',
  checker: 'allowlist',
  swap: 'trade',
  unwound: 'unwind',
};

export default async function RecordPage() {
  const actors = getActors();
  const {entries, error} = await loadAudit(actors);
  const swapRegistry = hankoAddress('SwapRegistry');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-xs">
        <span className="text-muted">
          {entries.length} events, read from chain since block{' '}
          <span className="font-mono text-ink">{String(entries.at(-1)?.block ?? '—')}</span>
        </span>
        <RefreshButton />
      </div>

      {error && (
        <p className="rounded-xl border border-fail/40 bg-fail/5 px-4 py-3 text-xs text-fail">{error}</p>
      )}

      <section className="rounded-xl border border-line bg-panel px-4 py-3 text-xs leading-relaxed">
        <h2 className="mb-1 text-sm font-semibold">Don&apos;t take this page&apos;s word for it</h2>
        <p className="text-muted">
          Every row below is an event the contracts emitted, not a log we keep. Anyone can fetch the
          same list without this app running, and the permissions themselves are ENS names — so they
          show up in{' '}
          <a
            className="underline underline-offset-2 hover:text-ink"
            href={ensExplorer('hanko.eth')}
            target="_blank"
            rel="noreferrer"
          >
            ENS&apos;s own explorer
          </a>{' '}
          too. That is what makes a venue&apos;s access decisions auditable rather than merely
          reported.
          {swapRegistry && (
            <>
              {' '}
              The registry holding trading permissions is{' '}
              <a
                className="font-mono underline underline-offset-2 hover:text-ink"
                href={explorer(swapRegistry)}
                target="_blank"
                rel="noreferrer"
              >
                {swapRegistry.slice(0, 10)}…
              </a>
              .
            </>
          )}
        </p>
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-panel">
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Timeline</h2>
          <p className="mt-0.5 text-xs text-muted">Newest first.</p>
        </header>

        {entries.length === 0 ? (
          <p className="px-4 py-4 text-xs text-muted">
            {error ?? 'Nothing recorded yet — deploy and grant a permission first.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {entries.map((e) => (
              <li
                key={`${e.txHash}-${e.kind}-${e.summary}-${e.block}`}
                className="flex items-start gap-3 px-4 py-2.5 text-sm hover:bg-panel-2"
              >
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[e.kind]}`} />
                <div className="min-w-0 flex-1">
                  <p>{e.summary}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    <span className="uppercase tracking-wide">{KIND_LABEL[e.kind]}</span> ·{' '}
                    {new Date(e.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19)} UTC ·{' '}
                    {e.contractLabel}
                  </p>
                </div>
                <a
                  className="shrink-0 font-mono text-xs text-muted underline underline-offset-2 hover:text-ink"
                  href={`https://sepolia.etherscan.io/tx/${e.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {e.txHash.slice(0, 10)}… ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
