import {readOperatorState} from './actions';
import {OperatorControls} from '@/components/OperatorControls';
import {RefreshButton} from '@/components/RefreshButton';
import {getActors} from '@/lib/actors';
import {d} from '@hanko/verify';
import {explorer, hankoAddress} from '@/lib/hanko';

export const dynamic = 'force-dynamic';

export default async function IssuerPage() {
  const state = await readOperatorState();
  const adapter = hankoAddress('PermissionsAdapter');

  if (!state || !adapter) {
    return (
      <div className="rounded-xl border border-line bg-panel p-6">
        <h1 className="text-base font-semibold">Venue operator</h1>
        <p className="mt-2 text-sm text-muted">The pool is not deployed yet.</p>
      </div>
    );
  }

  // Only the adapter's owner can pull these levers; showing who that is keeps the claim checkable.
  const actors = getActors();
  const operator = actors.find((a) => a.address.toLowerCase() === state.owner.toLowerCase());
  const positionTokenId = d.pool?.positionTokenId ? String(d.pool.positionTokenId) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${state.swappingEnabled ? 'bg-pass' : 'bg-fail'}`} />
            {state.swappingEnabled ? 'Trading open' : 'Trading halted'}
          </span>
          <span className="text-muted">
            operator{' '}
            <a
              className="font-mono underline underline-offset-2 hover:text-ink"
              href={explorer(state.owner)}
              target="_blank"
              rel="noreferrer"
            >
              {operator?.name ?? `${state.owner.slice(0, 10)}…`} ↗
            </a>
          </span>
        </div>
        <RefreshButton />
      </div>

      <p className="rounded-xl border border-line bg-panel px-4 py-3 text-xs leading-relaxed text-muted">
        <span className="text-ink">These are the venue&apos;s powers, and only the venue&apos;s.</span>{' '}
        The operator can halt trading and revoke an investor&apos;s access. It cannot grant an agent
        a name inside an investor&apos;s own registry — that half belongs to the investor, who can
        also take it back without asking. The split is enforced by ENS roles, not by convention.
      </p>

      <OperatorControls
        actors={actors.map((a) => ({name: a.name}))}
        tradingEnabled={state.swappingEnabled}
        positionTokenId={positionTokenId}
      />
    </div>
  );
}
