import {Countdown} from '@/components/Countdown';
import {AccessActions, type ActionSpec} from '@/components/access/AccessActions';
import {VenueTree, type TreeMember} from '@/components/access/VenueTree';
import {getActors} from '@/lib/actors';
import {decodeFlags, ensCheckerAbi, getClient, hankoAddress} from '@/lib/hanko';
import {getViewer} from '@/lib/role';
import {getStocks} from '@/lib/venue';

export const dynamic = 'force-dynamic';

export const metadata = {title: 'Access — Hanko'};

function Placeholder({what}: {what: string}) {
  return <p className="rounded-2xl border border-line bg-panel p-6 text-body text-muted">{what}</p>;
}

/** What each role may actually do here. The separation of powers is the product, so it shows. */
function actionsFor(role: string): ActionSpec[] {
  if (role === 'operator') {
    return [
      {kind: 'grant', actor: 'Alice', label: 'Clear the investor', hint: 'Swap and liquidity seals, 30-day expiry.'},
      {kind: 'revoke', actor: 'Alice', label: 'Revoke the investor', hint: 'Her agents stop in the same transaction.', tone: 'danger'},
      {kind: 'grant', actor: 'Stranger', label: 'Clear the stranger', hint: 'Turns a refused wallet into a member.'},
      {kind: 'revoke', actor: 'Stranger', label: 'Revoke the stranger', hint: 'Back to being refused.', tone: 'danger'},
      {kind: 'reset', label: 'Reset the venue', hint: 'Trading on, investor cleared, agent delegated.'},
    ];
  }
  if (role === 'alice') {
    return [
      {kind: 'delegate', label: 'Delegate to my bot', hint: 'A name inside my own registry. The venue is not asked.'},
      {kind: 'undelegate', label: 'Take it back', hint: 'The bot stops trading immediately.', tone: 'danger'},
    ];
  }
  return [];
}

export default async function AccessPage() {
  const client = getClient();
  const checker = hankoAddress('EnsAllowlistChecker');
  const root = hankoAddress('VenueRegistry');
  const swapRegistry = hankoAddress('SwapRegistry');
  const lpRegistry = hankoAddress('LpRegistry');
  const viewer = await getViewer();
  const stocks = getStocks();

  if (!client) return <Placeholder what="No RPC configured — set SEPOLIA_RPC_URL in .env." />;
  if (!checker || !root || !swapRegistry || !lpRegistry) {
    return <Placeholder what="The venue's ENS registries are not deployed yet." />;
  }

  const members: TreeMember[] = await Promise.all(
    getActors().map(async (actor) => {
      const [flags, label, principal, expiry] = await Promise.all([
        client.readContract({
          address: checker,
          abi: ensCheckerAbi,
          functionName: 'checkAllowlist',
          args: [actor.address, stocks[0]?.token ?? actor.address],
        }),
        client.readContract({address: checker, abi: ensCheckerAbi, functionName: 'labelFor', args: [actor.address]}),
        client.readContract({address: checker, abi: ensCheckerAbi, functionName: 'principalOf', args: [actor.address]}),
        client.readContract({address: checker, abi: ensCheckerAbi, functionName: 'expiryOf', args: [actor.address]}),
      ]);
      const decoded = decodeFlags(flags);
      const zero = '0x0000000000000000000000000000000000000000';
      return {
        name: actor.name,
        address: actor.address,
        label,
        swap: decoded.swap,
        liquidity: decoded.liquidity,
        principal: principal === zero ? null : principal,
        expiry: Number(expiry[0]) > 0 ? Number(expiry[0]) : null,
      };
    }),
  );

  const you = members.find((m) => m.address.toLowerCase() === viewer.address?.toLowerCase());
  const actions = actionsFor(viewer.id);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-8">
        <header>
          <h1 className="text-section">Who may trade here</h1>
          <p className="mt-3 text-body text-muted">
            One set of seals covers every symbol the venue lists. That is how the order reads it:
            the venue sets standards &ldquo;for persons to access trading&rdquo;, and stops a
            symbol separately when its underlying stops.
          </p>
        </header>

        <VenueTree
          root={root}
          swapRegistry={swapRegistry}
          lpRegistry={lpRegistry}
          members={members}
          viewer={viewer.address}
        />

        {actions.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold tracking-tight">
              {viewer.id === 'operator' ? 'What the venue can do' : 'What you can do'}
            </h2>
            <p className="mt-1 mb-4 text-body text-muted">
              {viewer.id === 'operator'
                ? 'Clear a member, withdraw a member. The venue cannot put an agent inside someone’s registry — that half belongs to them.'
                : 'Open names for your own agents, and close them again. The venue is not involved either way.'}
            </p>
            <AccessActions actions={actions} />
          </section>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="rounded-2xl border border-line bg-panel p-5">
          <p className="text-sm uppercase tracking-[0.14em] text-muted">Your seals</p>
          <p className="mt-1 text-lg font-semibold">{viewer.label}</p>

          <ul className="mt-4 space-y-2 text-base">
            <li className={you?.swap ? 'text-pass' : 'text-muted'}>
              {you?.swap ? '✓' : '✗'} may trade
            </li>
            <li className={you?.liquidity ? 'text-pass' : 'text-muted'}>
              {you?.liquidity ? '✓' : '✗'} may provide liquidity
            </li>
          </ul>

          {you?.principal && (
            <p className="mt-4 text-sm text-muted">
              Acting for{' '}
              <span className="font-mono text-ink">
                {you.principal.slice(0, 10)}…{you.principal.slice(-4)}
              </span>
              . This access ends the moment theirs does.
            </p>
          )}

          {you?.expiry && (
            <p className="mt-4 text-sm text-muted">
              Lapses in <Countdown expiry={you.expiry} />, unless the venue renews it.
            </p>
          )}

          {!you?.swap && !you?.liquidity && (
            <p className="mt-4 text-sm text-muted">
              No name resolves for this wallet, so the pool refuses it. Nothing else about it
              matters — not its balance, not its history.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-panel p-5 text-sm">
          <p className="font-medium">Non-transferable by construction</p>
          <p className="mt-1 text-muted">
            Every name here was registered with an empty role bitmap. The holder owns it and
            nothing else — no transfer, no renewal. Clearance that can be sold is not clearance.
          </p>
        </section>
      </aside>
    </div>
  );
}
