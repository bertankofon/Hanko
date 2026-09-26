import {explorer} from '@/lib/hanko';

interface Member {
  name: string;
  address: string;
  label: string;
  swap: boolean;
  liquidity: boolean;
  /// Set when this wallet trades on someone else's behalf.
  principal: string | null;
}

/**
 * The name tree, drawn the way it actually exists on chain.
 *
 * It is worth a picture rather than a paragraph: the whole idea is that a permission *is* a name
 * in a hierarchy, and the hierarchy is what makes expiry, revocation and (in Phase 6) delegation
 * fall out of ENS instead of having to be written. Every address here is read from chain.
 */
export function NameTree({
  tnvdaRegistry,
  swapRegistry,
  lpRegistry,
  members,
}: {
  tnvdaRegistry: string;
  swapRegistry: string;
  lpRegistry: string;
  members: Member[];
}) {
  // An agent's name lives inside its principal's registry, not beside it, so it is drawn under
  // the principal rather than as a sibling. That nesting is the delegation.
  const agents = members.filter((m) => m.principal);
  const swapHolders = members.filter((m) => m.swap && !m.principal);
  const lpHolders = members.filter((m) => m.liquidity && !m.principal);
  const agentsOf = (principal: string) =>
    agents.filter((a) => a.principal?.toLowerCase() === principal.toLowerCase());

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-panel">
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">The name tree</h2>
        <p className="mt-0.5 text-xs text-muted">
          A permission is a name. Holding{' '}
          <span className="font-mono text-ink">&lt;your address&gt;.swap.tnvda.eth</span> is what
          lets you trade; the pool resolves it on every swap.
        </p>
      </header>

      <div className="overflow-x-auto px-4 py-4 font-mono text-xs leading-relaxed whitespace-pre">
        <div className="text-muted">
          <span className="text-ink">.eth</span>{' '}
          <span className="text-pending">— ENSv2 registry, pinned</span>
        </div>

        <div className="text-muted">
          {'└─ '}
          <a
            className="text-seal underline underline-offset-2"
            href={explorer(tnvdaRegistry)}
            target="_blank"
            rel="noreferrer"
          >
            tnvda
          </a>{' '}
          <span className="text-pending">— the venue&apos;s name, held by the operator</span>
        </div>

        <Branch
          label="swap"
          registry={swapRegistry}
          note="a name here means: may trade"
          holders={swapHolders}
          agentsOf={agentsOf}
          last={false}
        />
        <Branch
          label="lp"
          registry={lpRegistry}
          note="a name here means: may provide liquidity"
          holders={lpHolders}
          last
        />
      </div>
    </section>
  );
}

function Branch({
  label,
  registry,
  note,
  holders,
  agentsOf,
  last,
}: {
  label: string;
  registry: string;
  note: string;
  holders: Member[];
  agentsOf?: (principal: string) => Member[];
  last: boolean;
}) {
  const stem = last ? '   └─ ' : '   ├─ ';
  const rail = last ? '      ' : '   │  ';

  return (
    <>
      <div className="text-muted">
        {stem}
        <a
          className="text-seal underline underline-offset-2"
          href={explorer(registry)}
          target="_blank"
          rel="noreferrer"
        >
          {label}
        </a>{' '}
        <span className="text-pending">— {note}</span>
      </div>

      {holders.length === 0 ? (
        <div className="text-pending">{rail}└─ (nobody)</div>
      ) : (
        holders.map((m, i) => {
          const lastHolder = i === holders.length - 1;
          const agents = agentsOf?.(m.address) ?? [];
          return (
            <span key={m.address}>
              <div className="text-muted">
                {rail}
                {lastHolder ? '└─ ' : '├─ '}
                <a
                  className="text-ink underline underline-offset-2"
                  href={explorer(m.address)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {m.label.slice(0, 10)}…{m.label.slice(-4)}
                </a>{' '}
                <span className="text-pending">— {m.name}</span>
              </div>

              {agents.map((agent, j) => (
                <div key={agent.address} className="text-muted">
                  {rail}
                  {lastHolder ? '   ' : '│  '}
                  {j === agents.length - 1 ? '└─ ' : '├─ '}
                  <a
                    className="text-ink underline underline-offset-2"
                    href={explorer(agent.address)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {agent.label.slice(0, 10)}…{agent.label.slice(-4)}
                  </a>{' '}
                  <span className="text-pending">
                    — {agent.name}, inside {m.name}&apos;s own registry (swap only)
                  </span>
                </div>
              ))}
            </span>
          );
        })
      )}
    </>
  );
}
