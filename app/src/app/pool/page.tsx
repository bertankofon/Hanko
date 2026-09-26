import {RefreshButton} from '@/components/RefreshButton';
import {TransferProbe} from '@/components/TransferProbe';
import {getActors} from '@/lib/actors';
import {
  checkerAbi,
  decodeFlags,
  explorer,
  formatAmount,
  getClient,
  hankoAddress,
  tokenAbi,
} from '@/lib/hanko';

export const dynamic = 'force-dynamic';

function NotDeployed({what}: {what: string}) {
  return (
    <div className="rounded-xl border border-line bg-panel p-6">
      <h1 className="text-base font-semibold">Pool</h1>
      <p className="mt-2 text-sm text-muted">{what}</p>
    </div>
  );
}

function Flag({on, label}: {on: boolean; label: string}) {
  return (
    <span className={on ? 'text-pass' : 'text-muted'}>
      {on ? '✓' : '✗'} {label}
    </span>
  );
}

export default async function PoolPage() {
  const client = getClient();
  const token = hankoAddress('MockStockToken');
  const checker = hankoAddress('SimpleAllowlistChecker');

  if (!client) return <NotDeployed what="No RPC configured — set SEPOLIA_RPC_URL in .env." />;
  if (!token || !checker) {
    return <NotDeployed what="tNVDA is not deployed yet. Run the Phase 1 deploy script first." />;
  }

  const actors = getActors();

  const [symbol, decimals, totalSupply, tokenOwner, activeChecker] = await Promise.all([
    client.readContract({address: token, abi: tokenAbi, functionName: 'symbol'}),
    client.readContract({address: token, abi: tokenAbi, functionName: 'decimals'}),
    client.readContract({address: token, abi: tokenAbi, functionName: 'totalSupply'}),
    client.readContract({address: token, abi: tokenAbi, functionName: 'owner'}),
    client.readContract({address: token, abi: tokenAbi, functionName: 'checker'}),
  ]);

  const rows = await Promise.all(
    actors.map(async (actor) => {
      const [balance, flags, systemAllowed] = await Promise.all([
        client.readContract({
          address: token,
          abi: tokenAbi,
          functionName: 'balanceOf',
          args: [actor.address],
        }),
        client.readContract({
          address: checker,
          abi: checkerAbi,
          functionName: 'checkAllowlist',
          args: [actor.address, token],
        }),
        client.readContract({
          address: token,
          abi: tokenAbi,
          functionName: 'systemAllowed',
          args: [actor.address],
        }),
      ]);
      return {...actor, balance, systemAllowed, ...decodeFlags(flags)};
    }),
  );

  // The token must defer to the same checker the pool will, or the restriction is decorative.
  const checkersAgree = activeChecker.toLowerCase() === checker.toLowerCase();

  const calls = [
    `symbol() / decimals() / totalSupply() / owner() / checker() @ ${token}`,
    ...rows.flatMap((r) => [
      `balanceOf(${r.address}) @ ${token}`,
      `checkAllowlist(${r.address}, ${token}) @ ${checker}`,
      `systemAllowed(${r.address}) @ ${token}`,
    ]),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="rounded-full border border-line px-2 py-0.5 font-mono">{symbol}</span>
          <span className="text-muted">
            supply <span className="font-mono text-ink">{formatAmount(totalSupply, decimals)}</span>
          </span>
          <a className="text-muted underline underline-offset-2 hover:text-ink" href={explorer(token)} target="_blank" rel="noreferrer">
            token ↗
          </a>
          <a className="text-muted underline underline-offset-2 hover:text-ink" href={explorer(checker)} target="_blank" rel="noreferrer">
            checker ↗
          </a>
          <a className="text-muted underline underline-offset-2 hover:text-ink" href={explorer(tokenOwner)} target="_blank" rel="noreferrer">
            issuer ↗
          </a>
        </div>
        <RefreshButton />
      </div>

      <section className="overflow-hidden rounded-xl border border-line bg-panel">
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Who may hold {symbol}?</h2>
          <p className="mt-0.5 text-xs text-muted">
            Balances and permissions are read from chain on every load. Swap and LP are separate
            grants — the pool enforces them in Phase 2; today only the raw flags exist.
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-2 font-normal">Actor</th>
                <th className="px-4 py-2 font-normal">Address</th>
                <th className="px-4 py-2 text-right font-normal">{symbol}</th>
                <th className="px-4 py-2 font-normal">Flags</th>
                <th className="px-4 py-2 font-normal">Permissions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.address} className="hover:bg-panel-2">
                  <td className="px-4 py-2.5">
                    <div>{row.name}</div>
                    <div className="text-xs text-muted">{row.role}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <a
                      className="font-mono text-xs text-muted underline underline-offset-2 hover:text-ink"
                      href={explorer(row.address)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.address.slice(0, 10)}…{row.address.slice(-6)}
                    </a>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {formatAmount(row.balance, decimals)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">{row.raw}</td>
                  <td className="px-4 py-2.5 text-xs">
                    <div className="flex gap-3">
                      <Flag on={row.swap} label="Swap" />
                      <Flag on={row.liquidity} label="LP" />
                    </div>
                    {row.systemAllowed && (
                      <div className="mt-0.5 text-muted">exempt (protocol address)</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <TransferProbe actors={actors.map((a) => ({name: a.name}))} symbol={symbol} />

      <section className="rounded-xl border border-line bg-panel px-4 py-3 text-xs">
        <div className="flex items-start gap-2">
          <span className={`mt-1 size-2 shrink-0 rounded-full ${checkersAgree ? 'bg-pass' : 'bg-fail'}`} />
          <p className="leading-relaxed">
            <span className="text-ink">The token defers to the same checker the pool will.</span>{' '}
            <span className="text-muted">
              {checkersAgree
                ? `${symbol}.checker() is ${activeChecker}, which is the checker this page reads. If the two
                   ever diverged, someone barred from the pool could still take delivery by a direct
                   transfer and the restriction would mean nothing.`
                : `${symbol}.checker() is ${activeChecker} but this page reads ${checker}. They must
                   match — fix the deployment record or call setChecker.`}
            </span>
          </p>
        </div>
      </section>

      <details className="rounded-xl border border-line bg-panel">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm hover:bg-panel-2">
          <span className="text-seal">What happened?</span>{' '}
          <span className="text-muted">{calls.length} chain calls were made while this page loaded.</span>
        </summary>
        <ul className="space-y-1 border-t border-line px-4 py-3 font-mono text-xs text-muted">
          {calls.map((call) => (
            <li key={call} className="break-all">
              {call}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
