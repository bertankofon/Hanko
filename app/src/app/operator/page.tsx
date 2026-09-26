import {redirect} from 'next/navigation';
import {AccessActions} from '@/components/access/AccessActions';
import {HaltControls, type SymbolState} from '@/components/operator/HaltControls';
import {adapterAbi, explorer, getClient, hankoAddress} from '@/lib/hanko';
import {getViewer} from '@/lib/role';
import {getStocks} from '@/lib/venue';

export const dynamic = 'force-dynamic';

export const metadata = {title: 'Operator — Hanko'};

export default async function OperatorPage() {
  const viewer = await getViewer();
  if (viewer.id !== 'operator') redirect('/access');

  const client = getClient();
  const stocks = getStocks();
  if (!client) {
    return <p className="rounded-2xl border border-line bg-panel p-6 text-body text-muted">No RPC configured.</p>;
  }

  const symbols: SymbolState[] = await Promise.all(
    stocks.map(async (stock) => ({
      symbol: stock.symbol,
      name: stock.name,
      underlying: stock.underlying,
      adapter: stock.adapter,
      tradable: Boolean(
        await client
          .readContract({address: stock.adapter, abi: adapterAbi, functionName: 'swappingEnabled'})
          .catch(() => false),
      ),
    })),
  );

  const checker = hankoAddress('EnsAllowlistChecker');

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header>
        <h1 className="text-section">Venue operator</h1>
        <p className="mt-3 text-body text-muted">
          The two powers the order expects a venue to hold, and nothing else. They are deliberately
          different shapes: a halt is per symbol and hits everyone, a revocation is per person and
          follows them wherever they trade.
        </p>
      </header>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Trading status, per symbol</h2>
        <p className="mt-1 mb-4 text-body text-muted">
          Halting one symbol leaves the others open. Try it against the Trade tab in another
          window — the same wallet will be refused on one and filled on the next.
        </p>
        <HaltControls symbols={symbols} />
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Membership</h2>
        <p className="mt-1 mb-4 text-body text-muted">
          Clearing a member mints their ENS names; revoking withdraws them, and anyone acting on
          their behalf stops in the same transaction.
        </p>
        <AccessActions
          actions={[
            {kind: 'grant', actor: 'Alice', label: 'Clear the investor', hint: 'Swap and liquidity, 30-day expiry.'},
            {kind: 'revoke', actor: 'Alice', label: 'Revoke the investor', hint: 'Cascades to her agents.', tone: 'danger'},
            {kind: 'grant', actor: 'Stranger', label: 'Clear the stranger', hint: 'Turns a refused wallet into a member.'},
            {kind: 'revoke', actor: 'Stranger', label: 'Revoke the stranger', hint: 'Back to being refused.', tone: 'danger'},
            {kind: 'reset', label: 'Reset the venue', hint: 'Back to the starting state for the next visitor.'},
          ]}
        />
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5 text-sm">
        <p className="font-medium">What the venue cannot do</p>
        <p className="mt-1 text-muted">
          It cannot put an agent inside a member&apos;s registry. Delegation is the member&apos;s
          own grant, made with their own key, and the venue only records a pointer so the checker
          can find the principal from the agent&apos;s address.
        </p>
        {checker && (
          <a
            className="mt-3 inline-block font-mono text-xs text-muted underline underline-offset-4 hover:text-ink"
            href={explorer(checker)}
            target="_blank"
            rel="noreferrer"
          >
            EnsAllowlistChecker {checker}
          </a>
        )}
      </section>
    </div>
  );
}
