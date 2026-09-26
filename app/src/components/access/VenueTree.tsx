import {explorer} from '@/lib/hanko';

export interface TreeMember {
  name: string;
  address: string;
  label: string;
  swap: boolean;
  liquidity: boolean;
  /** Set when this wallet trades on someone else's behalf. */
  principal: string | null;
  expiry: number | null;
}

function Name({label, suffix, highlight}: {label: string; suffix: string; highlight: boolean}) {
  return (
    <span className={highlight ? 'text-seal' : 'text-ink'}>
      {label.slice(0, 10)}…{label.slice(-4)}
      <span className="text-muted">.{suffix}</span>
    </span>
  );
}

/**
 * The venue's names, drawn the way they exist on chain.
 *
 * Worth a picture rather than a paragraph: the whole idea is that a permission *is* a name in a
 * hierarchy, and the hierarchy is what makes expiry, revocation and delegation fall out of ENS
 * instead of having to be written. An agent sits *inside* its principal's registry, so it is drawn
 * one level deeper — that nesting is the delegation.
 */
export function VenueTree({
  root,
  swapRegistry,
  lpRegistry,
  members,
  viewer,
}: {
  root: string;
  swapRegistry: string;
  lpRegistry: string;
  members: TreeMember[];
  viewer: string | null;
}) {
  const agents = members.filter((m) => m.principal);
  const swapHolders = members.filter((m) => m.swap && !m.principal);
  const lpHolders = members.filter((m) => m.liquidity && !m.principal);
  const isViewer = (address: string) => viewer?.toLowerCase() === address.toLowerCase();
  const agentsOf = (principal: string) =>
    agents.filter((a) => a.principal?.toLowerCase() === principal.toLowerCase());

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-panel">
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">The venue&apos;s names</h2>
        <p className="mt-1 text-sm text-muted">
          Read live from ENSv2 on Sepolia. Holding{' '}
          <span className="font-mono text-ink">&lt;your address&gt;.swap.hanko.eth</span> is what
          lets you trade; the pool resolves it on every swap.
        </p>
      </header>

      <div className="overflow-x-auto px-5 py-5 font-mono text-sm leading-7 whitespace-pre">
        <div className="text-muted">
          <span className="text-ink">.eth</span> <span className="text-pending">— ENSv2, pinned</span>
        </div>
        <div className="text-muted">
          {'└─ '}
          <a className="text-seal underline underline-offset-2" href={explorer(root)} target="_blank" rel="noreferrer">
            hanko.eth
          </a>{' '}
          <span className="text-pending">— the venue</span>
        </div>

        <div className="text-muted">
          {'   ├─ '}
          <a className="text-ink underline underline-offset-2" href={explorer(swapRegistry)} target="_blank" rel="noreferrer">
            swap.hanko.eth
          </a>{' '}
          <span className="text-pending">— may trade</span>
        </div>
        {swapHolders.length === 0 && <div className="text-pending">{'   │     (nobody)'}</div>}
        {swapHolders.map((member) => (
          <div key={`swap-${member.address}`}>
            <span className="text-muted">{'   │  └─ '}</span>
            <Name label={member.label} suffix="swap.hanko.eth" highlight={isViewer(member.address)} />
            <span className="text-pending"> — {member.name}</span>
            {isViewer(member.address) && <span className="text-seal"> ← you</span>}
            {agentsOf(member.address).map((agent) => (
              <div key={`agent-${agent.address}`}>
                <span className="text-muted">{'   │     └─ '}</span>
                <Name
                  label={agent.label}
                  suffix={`${member.label.slice(0, 10)}….swap.hanko.eth`}
                  highlight={isViewer(agent.address)}
                />
                <span className="text-pending"> — {agent.name}, swap only</span>
                {isViewer(agent.address) && <span className="text-seal"> ← you</span>}
              </div>
            ))}
          </div>
        ))}

        <div className="mt-2 text-muted">
          {'   └─ '}
          <a className="text-ink underline underline-offset-2" href={explorer(lpRegistry)} target="_blank" rel="noreferrer">
            lp.hanko.eth
          </a>{' '}
          <span className="text-pending">— may provide liquidity</span>
        </div>
        {lpHolders.length === 0 && <div className="text-pending">{'         (nobody)'}</div>}
        {lpHolders.map((member) => (
          <div key={`lp-${member.address}`}>
            <span className="text-muted">{'      └─ '}</span>
            <Name label={member.label} suffix="lp.hanko.eth" highlight={isViewer(member.address)} />
            <span className="text-pending"> — {member.name}</span>
            {isViewer(member.address) && <span className="text-seal"> ← you</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
