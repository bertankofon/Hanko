import {Countdown} from '@/components/Countdown';
import {NameTree} from '@/components/NameTree';
import {RefreshButton} from '@/components/RefreshButton';
import {getActors} from '@/lib/actors';
import {
  adapterAbi,
  decodeFlags,
  ensCheckerAbi,
  explorer,
  getClient,
  hankoAddress,
  tokenAbi,
} from '@/lib/hanko';

export const dynamic = 'force-dynamic';

function Placeholder({what}: {what: string}) {
  return (
    <div className="rounded-xl border border-line bg-panel p-6">
      <h1 className="text-base font-semibold">Identity</h1>
      <p className="mt-2 text-sm text-muted">{what}</p>
    </div>
  );
}

export default async function IdentityPage() {
  const client = getClient();
  const ensChecker = hankoAddress('EnsAllowlistChecker');
  const simpleChecker = hankoAddress('SimpleAllowlistChecker');
  const tnvdaRegistry = hankoAddress('TnvdaRegistry');
  const swapRegistry = hankoAddress('SwapRegistry');
  const lpRegistry = hankoAddress('LpRegistry');
  const adapter = hankoAddress('PermissionsAdapter');
  const token = hankoAddress('MockStockToken');

  if (!client) return <Placeholder what="No RPC configured — set SEPOLIA_RPC_URL in .env." />;
  if (!ensChecker || !tnvdaRegistry || !swapRegistry || !lpRegistry || !token || !adapter) {
    return <Placeholder what="The ENS registries are not deployed yet. Run the Phase 3 setup script." />;
  }

  const actors = getActors();

  // Which allowlist the pool and the token are reading right now. They must agree: if the pool
  // refuses a wallet but the token still lets it hold the underlying, the restriction is theatre.
  const [poolChecker, tokenChecker] = await Promise.all([
    client.readContract({address: adapter, abi: adapterAbi, functionName: 'allowListChecker'}),
    client.readContract({address: token, abi: tokenAbi, functionName: 'checker'}),
  ]);

  const usingEns = poolChecker.toLowerCase() === ensChecker.toLowerCase();
  const checkersAgree = poolChecker.toLowerCase() === tokenChecker.toLowerCase();

  const rows = await Promise.all(
    actors.map(async (actor) => {
      const [flagsRaw, expiries, label, principal] = await Promise.all([
        client.readContract({
          address: ensChecker,
          abi: ensCheckerAbi,
          functionName: 'checkAllowlist',
          args: [actor.address, token],
        }),
        client.readContract({
          address: ensChecker,
          abi: ensCheckerAbi,
          functionName: 'expiryOf',
          args: [actor.address],
        }),
        client.readContract({
          address: ensChecker,
          abi: ensCheckerAbi,
          functionName: 'labelFor',
          args: [actor.address],
        }),
        client.readContract({
          address: ensChecker,
          abi: ensCheckerAbi,
          functionName: 'principalOf',
          args: [actor.address],
        }),
      ]);

      const flags = decodeFlags(flagsRaw);
      return {
        ...actor,
        label,
        raw: flags.raw,
        swap: flags.swap,
        liquidity: flags.liquidity,
        swapExpiry: Number(expiries[0]),
        lpExpiry: Number(expiries[1]),
        principal: principal === '0x0000000000000000000000000000000000000000' ? null : principal,
      };
    }),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${usingEns ? 'bg-pass' : 'bg-unknown'}`} />
            {usingEns ? 'The pool is reading ENS' : 'The pool is reading the mapping'}
          </span>
          <a
            className="font-mono text-muted underline underline-offset-2 hover:text-ink"
            href={explorer(poolChecker)}
            target="_blank"
            rel="noreferrer"
          >
            {poolChecker.slice(0, 10)}…{poolChecker.slice(-4)} ↗
          </a>
          {!checkersAgree && (
            <span className="text-fail">
              the token reads a different checker — a barred wallet could still take delivery
            </span>
          )}
        </div>
        <RefreshButton />
      </div>

      <NameTree
        tnvdaRegistry={tnvdaRegistry}
        swapRegistry={swapRegistry}
        lpRegistry={lpRegistry}
        members={rows}
      />

      <section className="overflow-hidden rounded-xl border border-line bg-panel">
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Permissions</h2>
          <p className="mt-0.5 text-xs text-muted">
            Read from ENS on every load. The countdown is the part a mapping cannot give you: when
            it reaches zero the name is gone and the next swap is refused, with nobody having
            revoked anything.
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-2 font-normal">Wallet</th>
                <th className="px-4 py-2 font-normal">ENS label</th>
                <th className="px-4 py-2 font-normal">Flags</th>
                <th className="px-4 py-2 font-normal">Swap</th>
                <th className="px-4 py-2 font-normal">LP</th>
                <th className="px-4 py-2 font-normal">Expires in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.address} className="hover:bg-panel-2">
                  <td className="px-4 py-2.5">
                    <div className={row.principal ? 'pl-4' : ''}>
                      {row.principal && <span className="text-pending">└─ </span>}
                      {row.name}
                    </div>
                    <div className={`text-xs text-muted ${row.principal ? 'pl-4' : ''}`}>
                      {row.principal
                        ? `agent of ${rows.find((r) => r.address === row.principal)?.name ?? row.principal}`
                        : row.role}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <a
                      className="font-mono text-xs text-muted underline underline-offset-2 hover:text-ink"
                      href={explorer(row.address)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.label.slice(0, 12)}…{row.label.slice(-6)}
                    </a>
                    <div className="text-xs text-pending">
                      {row.principal
                        ? 'inside its principal’s registry'
                        : row.swap && row.liquidity
                          ? '.swap + .lp.tnvda.eth'
                          : row.swap
                            ? '.swap.tnvda.eth'
                            : row.liquidity
                              ? '.lp.tnvda.eth'
                              : 'no name registered'}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">{row.raw}</td>
                  <td className={`px-4 py-2.5 text-xs ${row.swap ? 'text-pass' : 'text-muted'}`}>
                    {row.swap ? '✓' : '✗'}
                  </td>
                  <td className={`px-4 py-2.5 text-xs ${row.liquidity ? 'text-pass' : 'text-muted'}`}>
                    {row.liquidity ? '✓' : '✗'}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    <Countdown expiry={row.swapExpiry} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-panel px-4 py-3 text-xs leading-relaxed">
        <h3 className="mb-1.5 text-sm font-semibold">Why a name instead of a row in a mapping?</h3>
        <ul className="space-y-1.5 text-muted">
          <li>
            <span className="text-ink">It ends by itself.</span> ENS returns no owner once a name
            lapses, so an expiring permission needs no timekeeping of ours and no sweep.
          </li>
          <li>
            <span className="text-ink">It cannot be passed on.</span> Names are granted with an
            empty role bitmap, so a cleared wallet cannot sell its access to one the venue never
            cleared.
          </li>
          <li>
            <span className="text-ink">Admitting and revoking are different powers.</span> One role
            registers, another clears. From Phase 4 the attester holds the first and the venue
            operator the second, so the backend can let people in but never throw them out.
          </li>
          <li>
            <span className="text-ink">It nests.</span> A holder can be given a registry of their
            own, which is how an agent gets a permission that dies with its owner&apos;s — Phase 6.
          </li>
          <li>
            <span className="text-ink">Anyone can read it.</span> The permission is a public ENS
            record, not private state inside one venue&apos;s contract.
          </li>
        </ul>
        {simpleChecker && (
          <p className="mt-3 text-pending">
            The mapping-backed checker is still deployed at{' '}
            <a
              className="font-mono underline underline-offset-2 hover:text-ink"
              href={explorer(simpleChecker)}
              target="_blank"
              rel="noreferrer"
            >
              {simpleChecker.slice(0, 10)}…
            </a>{' '}
            — the pool can be pointed back at it in one transaction, which is the whole argument
            that these access rules are pluggable.
          </p>
        )}
      </section>
    </div>
  );
}
