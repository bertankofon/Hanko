import type {CheckResult, CheckStatus} from '@hanko/verify';
import {explorerUrl} from '@hanko/verify';

const DOT: Record<CheckStatus, string> = {
  pass: 'bg-pass',
  fail: 'bg-fail',
  unknown: 'bg-unknown',
  pending: 'bg-pending',
};

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: 'passed',
  fail: 'failed',
  unknown: 'unknown',
  pending: 'pending',
};

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function CheckCard({
  title,
  subtitle,
  rows,
  chainId,
  emptyNote,
}: {
  title: string;
  subtitle?: string;
  rows: CheckResult[];
  chainId: number;
  /** Shown instead of the list when there is nothing to check yet. */
  emptyNote?: string;
}) {
  if (rows.length === 0 && !emptyNote) return null;
  const failed = rows.filter((r) => r.status === 'fail').length;
  const unknown = rows.filter((r) => r.status === 'unknown').length;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-panel">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        <span className="text-xs text-muted">
          {failed > 0 && <span className="text-fail">{failed} failed · </span>}
          {unknown > 0 && <span className="text-unknown">{unknown} unknown · </span>}
          {rows.length} checks
        </span>
      </header>

      {rows.length === 0 && emptyNote && <p className="px-4 py-4 text-xs text-muted">{emptyNote}</p>}

      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.id}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-panel-2">
                <span
                  className={`size-2 shrink-0 rounded-full ${DOT[row.status]}`}
                  aria-label={STATUS_LABEL[row.status]}
                />
                <span className="min-w-0 flex-1 truncate text-sm">{row.label}</span>
                <span
                  className={`hidden truncate font-mono text-xs sm:block sm:max-w-[42%] ${
                    row.status === 'fail' ? 'text-fail' : 'text-muted'
                  }`}
                >
                  {row.actual}
                </span>
                <span className="text-muted transition-transform group-open:rotate-90">›</span>
              </summary>

              <div className="space-y-2 bg-panel-2 px-4 py-3 pl-9 text-xs">
                <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[7rem_1fr]">
                  <dt className="text-muted">Expected</dt>
                  <dd className="font-mono break-all">{row.expected}</dd>
                  <dt className="text-muted">Actual</dt>
                  <dd className="font-mono break-all">{row.actual}</dd>
                  <dt className="text-muted">How</dt>
                  <dd className="font-mono break-all text-muted">{row.howChecked}</dd>
                  <dt className="text-muted">Source</dt>
                  <dd className="break-all text-muted">{row.source}</dd>
                </dl>

                {row.remediation && (
                  <p className="rounded-lg border border-line bg-panel px-3 py-2 leading-relaxed">
                    <span className="text-seal">What to do: </span>
                    {row.remediation}
                  </p>
                )}

                {row.address && (
                  <a
                    className="inline-block font-mono text-muted underline underline-offset-2 hover:text-ink"
                    href={explorerUrl(row.address, chainId)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {short(row.address)} ↗ Etherscan
                  </a>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
