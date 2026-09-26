import {privateKeyToAccount} from 'viem/accounts';
import {
  ACTOR_FUNDING_TARGETS,
  LOW_BALANCE_FRACTION,
  runChecks,
  type CheckResult,
} from '@hanko/verify';
import {CheckCard} from '@/components/CheckTable';
import {RefreshButton} from '@/components/RefreshButton';

// Every load re-reads the chain; nothing here may come from a build-time cache.
export const dynamic = 'force-dynamic';

// The deployer pays for everything, so it gets its own floor; the rest are
// checked against the targets fund-actors.ts tops them up to.
const ACTOR_ENV = [
  {name: 'Deployer / issuer', env: 'DEPLOYER_PRIVATE_KEY', minEth: 0.05},
  ...ACTOR_FUNDING_TARGETS.map((t) => ({
    name: t.name,
    env: t.env,
    minEth: Number(t.eth) * LOW_BALANCE_FRACTION,
  })),
];

const REQUIRED_ENV = [
  'SEPOLIA_RPC_URL',
  'ETHERSCAN_API_KEY',
  'DEPLOYER_PRIVATE_KEY',
  'ATTESTER_PRIVATE_KEY',
  'ACTOR_ALICE_PK',
  'ACTOR_STRANGER_PK',
  'ACTOR_BOT_PK',
];

/** Derives the public address only. Private keys never leave this function. */
function deriveActors() {
  return ACTOR_ENV.flatMap(({name, env, minEth}) => {
    const raw = process.env[env];
    if (!raw) return [];
    try {
      const key = (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`;
      return [{name, address: privateKeyToAccount(key).address, minEth}];
    } catch {
      return [];
    }
  });
}

export default async function SystemPage() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? process.env.ANVIL_RPC_URL ?? '';

  if (!rpcUrl) {
    return (
      <div className="rounded-xl border border-line bg-panel p-6">
        <h1 className="text-base font-semibold">Is the system ready?</h1>
        <p className="mt-2 text-sm text-muted">
          <code className="font-mono text-ink">SEPOLIA_RPC_URL</code> is not set, so no check could run. Copy{' '}
          <code className="font-mono text-ink">.env.example</code> to{' '}
          <code className="font-mono text-ink">.env</code>, fill it in, then reload this page.
        </p>
      </div>
    );
  }

  const report = await runChecks({
    rpcUrl,
    actors: deriveActors(),
    requiredEnv: REQUIRED_ENV.map((name) => ({name, present: Boolean(process.env[name])})),
  });

  const chainId = report.chainId ?? 11155111;
  const by = (group: CheckResult['group']) => report.results.filter((r) => r.group === group);
  const calls = report.results.filter((r) => r.howChecked.startsWith('eth_'));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="rounded-full border border-line px-2 py-0.5 font-mono">
            {chainId === 11155111 ? 'Sepolia' : `chainId ${chainId}`}
          </span>
          <span className="text-muted">
            block <span className="font-mono text-ink">#{report.blockNumber ?? '—'}</span>
          </span>
          <span className="text-muted">
            RPC <span className="font-mono text-ink">{report.rpcUrl}</span>
          </span>
          <span className="text-muted">
            latency <span className="font-mono text-ink">{report.latencyMs ?? '—'}ms</span>
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span>
            <span className="text-pass">{report.summary.pass} passed</span>
            {report.summary.fail > 0 && <span className="text-fail"> · {report.summary.fail} failed</span>}
            {report.summary.unknown > 0 && (
              <span className="text-unknown"> · {report.summary.unknown} unknown</span>
            )}
            {report.summary.pending > 0 && (
              <span className="text-muted"> · {report.summary.pending} pending</span>
            )}
          </span>
          <RefreshButton />
        </div>
      </div>

      <CheckCard
        title="Environment"
        subtitle="RPC, network and .env keys. Key values are never read — only whether they are set."
        rows={by('env')}
        chainId={chainId}
      />
      <CheckCard
        title="Uniswap v4 Permissioned"
        subtitle="Do the router, the hook and the position manager share one adapter factory and one PoolManager?"
        rows={by('uniswap')}
        chainId={chainId}
      />
      <CheckCard
        title="ENSv2"
        subtitle="Is the Sepolia stack the 15 Sep deployment we pinned, and is tnvda.eth still available?"
        rows={by('ens')}
        chainId={chainId}
      />
      <CheckCard
        title="Accounts"
        subtitle="Addresses derived from the private keys, and their Sepolia balances."
        rows={by('accounts')}
        chainId={chainId}
        emptyNote="No private keys in .env yet, so there is no account to check. Once the keys are set, this card shows each address and its Sepolia balance."
      />
      <CheckCard
        title="Hanko contracts"
        subtitle="Filled in by the deploy scripts from Phase 1 onwards."
        rows={by('hanko')}
        chainId={chainId}
      />

      <details className="rounded-xl border border-line bg-panel">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm hover:bg-panel-2">
          <span className="text-seal">What happened?</span>{' '}
          <span className="text-muted">
            {calls.length} chain calls were made while this page loaded ({report.ranAt}).
          </span>
        </summary>
        <ul className="space-y-1 border-t border-line px-4 py-3 font-mono text-xs text-muted">
          {calls.map((c) => (
            <li key={c.id} className="break-all">
              {c.howChecked}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
