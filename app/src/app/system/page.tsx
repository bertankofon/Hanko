import {privateKeyToAccount} from 'viem/accounts';
import {runChecks, type CheckResult} from '@hanko/verify';
import {CheckCard} from '@/components/CheckTable';
import {RefreshButton} from '@/components/RefreshButton';

// Every load re-reads the chain; nothing here may come from a build-time cache.
export const dynamic = 'force-dynamic';

const ACTOR_ENV = [
  {name: 'Deployer / issuer', env: 'DEPLOYER_PRIVATE_KEY'},
  {name: 'Attester', env: 'ATTESTER_PRIVATE_KEY'},
  {name: 'Alice', env: 'ACTOR_ALICE_PK'},
  {name: 'Stranger', env: 'ACTOR_STRANGER_PK'},
  {name: 'Bot', env: 'ACTOR_BOT_PK'},
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
  return ACTOR_ENV.flatMap(({name, env}) => {
    const raw = process.env[env];
    if (!raw) return [];
    try {
      const key = (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`;
      return [{name, address: privateKeyToAccount(key).address}];
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
        <h1 className="text-base font-semibold">Sistem hazır mı?</h1>
        <p className="mt-2 text-sm text-muted">
          <code className="font-mono text-ink">SEPOLIA_RPC_URL</code> tanımlı değil, bu yüzden hiçbir kontrol
          çalıştırılamadı. <code className="font-mono text-ink">.env.example</code> dosyasını{' '}
          <code className="font-mono text-ink">.env</code> olarak kopyalayıp doldur, sonra bu sayfayı yenile.
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
            blok <span className="font-mono text-ink">#{report.blockNumber ?? '—'}</span>
          </span>
          <span className="text-muted">
            RPC <span className="font-mono text-ink">{report.rpcUrl}</span>
          </span>
          <span className="text-muted">
            gecikme <span className="font-mono text-ink">{report.latencyMs ?? '—'}ms</span>
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span>
            <span className="text-pass">{report.summary.pass} geçti</span>
            {report.summary.fail > 0 && <span className="text-fail"> · {report.summary.fail} kaldı</span>}
            {report.summary.unknown > 0 && (
              <span className="text-unknown"> · {report.summary.unknown} belirsiz</span>
            )}
            {report.summary.pending > 0 && (
              <span className="text-muted"> · {report.summary.pending} bekliyor</span>
            )}
          </span>
          <RefreshButton />
        </div>
      </div>

      <CheckCard
        title="Ortam"
        subtitle="RPC, ağ ve .env anahtarları. Anahtar değerleri hiçbir zaman okunmaz, sadece varlıkları."
        rows={by('env')}
        chainId={chainId}
      />
      <CheckCard
        title="Uniswap v4 Permissioned"
        subtitle="Router, hook ve position manager aynı adapter factory'ye ve aynı PoolManager'a bağlı mı."
        rows={by('uniswap')}
        chainId={chainId}
      />
      <CheckCard
        title="ENSv2"
        subtitle="Sepolia stack'i pinlediğimiz 15 Eylül deployment'ı mı, ve tnvda.eth hâlâ müsait mi."
        rows={by('ens')}
        chainId={chainId}
      />
      <CheckCard
        title="Hesaplar"
        subtitle="Private key'lerden türetilen adresler ve Sepolia bakiyeleri."
        rows={by('accounts')}
        chainId={chainId}
        emptyNote=".env'de hiçbir private key yok, bu yüzden kontrol edilecek hesap da yok. Anahtarları girince bu kart adresleri ve Sepolia bakiyelerini gösterir."
      />
      <CheckCard
        title="Hanko kontratları"
        subtitle="Faz 1'den itibaren deploy script'leri doldurur."
        rows={by('hanko')}
        chainId={chainId}
      />

      <details className="rounded-xl border border-line bg-panel">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm hover:bg-panel-2">
          <span className="text-seal">Ne oldu?</span>{' '}
          <span className="text-muted">
            Bu sayfa yüklenirken {calls.length} zincir çağrısı yapıldı ({report.ranAt}).
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
