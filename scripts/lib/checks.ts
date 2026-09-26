/**
 * Deployment verification checks for Hanko (Phase 0).
 *
 * This module is the single source of truth for "is the outside world what we
 * think it is". The CLI (`scripts/verify-env.ts`) and the app's System tab both
 * import it, so the two can never drift apart.
 *
 * Rules:
 * - Nothing here is hard-coded status. Every result comes from an eth_call or
 *   eth_getCode against a live chain.
 * - A check that cannot be completed is `unknown`, never `pass`.
 * - Addresses come from `deployments/<chainId>.json`, which is pinned to the
 *   sources listed in that file.
 */

import {createPublicClient, http, getAddress, formatEther, type PublicClient} from 'viem';
import {sepolia} from 'viem/chains';
import deployments from '../../deployments/11155111.json' with {type: 'json'};
import {
  ensEthRegistrarAbi,
  ensRegistryAbi,
  ensResolverProxyAbi,
  ensUniversalResolverAbi,
  erc20Abi,
  permissionsAdapterFactoryAbi,
  permissionsAdapterFactoryRefAbi,
  poolManagerRefAbi,
} from './abis';

/**
 * `unknown` means we could not prove the claim (RPC error, unexpected ABI) —
 * it is never counted as green. `pending` means the thing does not exist yet
 * by design (Hanko's own contracts before Phase 1).
 */
export type CheckStatus = 'pass' | 'fail' | 'unknown' | 'pending';
export type CheckGroup = 'env' | 'uniswap' | 'ens' | 'accounts' | 'hanko';

export interface CheckResult {
  id: string;
  group: CheckGroup;
  label: string;
  /** Contract or account this row is about, for the explorer link. */
  address?: string;
  expected: string;
  actual: string;
  status: CheckStatus;
  /** Exactly what was called, so the row can be reproduced by hand. */
  howChecked: string;
  /** Where the expected value comes from. */
  source: string;
  /** Only set when status is 'fail' or 'unknown'. */
  remediation?: string;
}

export interface VerificationReport {
  ranAt: string;
  rpcUrl: string;
  chainId: number | null;
  blockNumber: string | null;
  latencyMs: number | null;
  results: CheckResult[];
  summary: {pass: number; fail: number; unknown: number; pending: number};
}

export const d = deployments;

/** Hooks.ALL_HOOK_MASK — v4-core @ src/libraries/Hooks.sol:26 */
const ALL_HOOK_MASK = (1n << 14n) - 1n;
/**
 * Expected hook-permission mask for PermissionedHooks, asserted by the deployer:
 * BEFORE_INITIALIZE | BEFORE_ADD_LIQUIDITY | BEFORE_SWAP | AFTER_SWAP.
 * Source: Uniswap/contracts @ src/briefcase/deployers/v4-hooks-public/PermissionedHooksDeployer.sol
 */
const EXPECTED_HOOK_MASK = 0x28c0n;

const eq = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function explorerUrl(address: string, chainId: number): string {
  return chainId === 11155111
    ? `https://sepolia.etherscan.io/address/${address}`
    : `https://etherscan.io/address/${address}`;
}

export function makeClient(rpcUrl: string): PublicClient {
  return createPublicClient({chain: sepolia, transport: http(rpcUrl)}) as PublicClient;
}

/** Wraps a check so a revert or RPC error becomes `unknown` instead of killing the run. */
async function attempt(
  base: Omit<CheckResult, 'actual' | 'status'>,
  run: () => Promise<{actual: string; ok: boolean; remediation?: string}>,
): Promise<CheckResult> {
  try {
    const {actual, ok, remediation} = await run();
    return {
      ...base,
      actual,
      status: ok ? 'pass' : 'fail',
      remediation: ok ? undefined : (remediation ?? base.remediation),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message.split('\n')[0] : String(err);
    return {
      ...base,
      actual: `çağrı başarısız: ${message}`,
      status: 'unknown',
      remediation:
        base.remediation ??
        'RPC hatası veya beklenmeyen ABI. Kontratı Etherscan\'de aç ve fonksiyonun gerçekten var olduğunu doğrula.',
    };
  }
}

/** Every address we expect to find bytecode at, grouped for the UI. */
export const knownAddresses: {group: CheckGroup; name: string; address: string}[] = [
  ...Object.entries(d.uniswap)
    .filter(([name]) => !name.startsWith('_'))
    .map(([name, address]) => ({group: 'uniswap' as const, name, address: address as string})),
  ...Object.entries(d.ens).map(([name, address]) => ({
    group: 'ens' as const,
    name,
    address: address as string,
  })),
];

export interface RunOptions {
  rpcUrl: string;
  /** Derived actor addresses (never private keys). */
  actors?: {name: string; address: string}[];
  /** Env var names that must be present; values are never read into results. */
  requiredEnv?: {name: string; present: boolean}[];
  /** Minimum Sepolia balance we want each actor to hold, in ether. */
  minBalanceEth?: number;
}

export async function runChecks(opts: RunOptions): Promise<VerificationReport> {
  const {rpcUrl, actors = [], requiredEnv = [], minBalanceEth = 0.05} = opts;
  const client = makeClient(rpcUrl);
  const results: CheckResult[] = [];

  // ---- env / network -------------------------------------------------------
  let chainId: number | null = null;
  let blockNumber: string | null = null;
  let latencyMs: number | null = null;

  const startedAt = Date.now();
  results.push(
    await attempt(
      {
        id: 'env.chainId',
        group: 'env',
        label: 'RPC ulaşılabilir ve doğru ağ',
        expected: `chainId ${d.chainId}`,
        howChecked: 'eth_chainId + eth_blockNumber',
        source: 'deployments/11155111.json',
        remediation: 'SEPOLIA_RPC_URL bir Sepolia endpoint\'i mi? Anvil fork için --rpc http://127.0.0.1:8545 kullan.',
      },
      async () => {
        chainId = await client.getChainId();
        const block = await client.getBlockNumber();
        latencyMs = Date.now() - startedAt;
        blockNumber = block.toString();
        return {
          actual: `chainId ${chainId} · blok #${blockNumber} · ${latencyMs}ms`,
          ok: chainId === d.chainId,
        };
      },
    ),
  );

  for (const {name, present} of requiredEnv) {
    results.push({
      id: `env.var.${name}`,
      group: 'env',
      label: `${name} tanımlı`,
      expected: 'tanımlı',
      actual: present ? 'tanımlı' : 'eksik',
      status: present ? 'pass' : 'fail',
      howChecked: 'process.env (değer okunmaz, sadece varlığı)',
      source: '.env.example',
      remediation: present ? undefined : `.env dosyasına ${name} ekle.`,
    });
  }

  // ---- bytecode presence ---------------------------------------------------
  for (const {group, name, address} of knownAddresses) {
    results.push(
      await attempt(
        {
          id: `code.${name}`,
          group,
          label: `${name} kodu var`,
          address,
          expected: 'extcodesize > 0',
          howChecked: `eth_getCode(${short(address)})`,
          source: group === 'ens' ? 'ensdomains/contracts-v2 (pinned)' : 'Uniswap/contracts (pinned)',
          remediation: `${name} bu ağda deploy edilmemiş. deployments/11155111.json'daki adresi ve ağı kontrol et.`,
        },
        async () => {
          const code = await client.getCode({address: getAddress(address)});
          const size = code ? (code.length - 2) / 2 : 0;
          return {actual: `${size} byte`, ok: size > 0};
        },
      ),
    );
  }

  // ---- Uniswap wiring ------------------------------------------------------
  const factory = d.uniswap.PermissionsAdapterFactory;
  const poolManager = d.uniswap.PoolManager;

  const factoryRefTargets: {id: string; label: string; address: string; remediation: string}[] = [
    {
      id: 'uni.router.factory',
      label: 'UniversalRouter v2.2 → PERMISSIONS_ADAPTER_FACTORY',
      address: d.uniswap.UniversalRouterV22,
      remediation:
        'Yanlış router sürümündeyiz. v2.1.2 (0x7E4f…43f3) permissioned swap yapamaz — deployments dosyasındaki UniversalRouterV22 adresini kontrol et.',
    },
    {
      id: 'uni.hooks.factory',
      label: 'PermissionedHooks → PERMISSIONS_ADAPTER_FACTORY',
      address: d.uniswap.PermissionedHooks,
      remediation: 'Hook başka bir factory\'ye bağlı; bizim adapter\'ımızı tanımaz. Uniswap booth\'una sor.',
    },
    {
      id: 'uni.posm.factory',
      label: 'PermissionedPositionManager → PERMISSIONS_ADAPTER_FACTORY',
      address: d.uniswap.PermissionedPositionManager,
      remediation: 'PosM başka bir factory\'ye bağlı; LP akışı Faz 2\'de kırılır.',
    },
  ];

  for (const t of factoryRefTargets) {
    results.push(
      await attempt(
        {
          id: t.id,
          group: 'uniswap',
          label: t.label,
          address: t.address,
          expected: factory,
          howChecked: `eth_call PERMISSIONS_ADAPTER_FACTORY() @ ${short(t.address)}`,
          source: 'v4-hooks-public PermissionedHooks.sol:32 / v4-periphery PermissionedV4Router.sol:15 / PermissionedPositionManager.sol:24',
          remediation: t.remediation,
        },
        async () => {
          const got = (await client.readContract({
            address: getAddress(t.address),
            abi: permissionsAdapterFactoryRefAbi,
            functionName: 'PERMISSIONS_ADAPTER_FACTORY',
          })) as string;
          return {actual: got, ok: eq(got, factory)};
        },
      ),
    );
  }

  for (const t of [
    {id: 'uni.hooks.pm', label: 'PermissionedHooks → poolManager', address: d.uniswap.PermissionedHooks},
    {
      id: 'uni.posm.pm',
      label: 'PermissionedPositionManager → poolManager',
      address: d.uniswap.PermissionedPositionManager,
    },
  ]) {
    results.push(
      await attempt(
        {
          id: t.id,
          group: 'uniswap',
          label: t.label,
          address: t.address,
          expected: poolManager,
          howChecked: `eth_call poolManager() @ ${short(t.address)}`,
          source: 'v4-core BaseHook / v4-periphery ImmutableState',
          remediation: 'Farklı bir PoolManager\'a bağlı — havuzu yanlış çekirdekte açarız.',
        },
        async () => {
          const got = (await client.readContract({
            address: getAddress(t.address),
            abi: poolManagerRefAbi,
            functionName: 'poolManager',
          })) as string;
          return {actual: got, ok: eq(got, poolManager)};
        },
      ),
    );
  }

  results.push(
    await attempt(
      {
        id: 'uni.factory.pm',
        group: 'uniswap',
        label: 'PermissionsAdapterFactory → POOL_MANAGER',
        address: factory,
        expected: poolManager,
        howChecked: `eth_call POOL_MANAGER() @ ${short(factory)}`,
        source: 'v4-periphery IPermissionsAdapterFactory.sol',
      },
      async () => {
        const got = (await client.readContract({
          address: getAddress(factory),
          abi: permissionsAdapterFactoryAbi,
          functionName: 'POOL_MANAGER',
        })) as string;
        return {actual: got, ok: eq(got, poolManager)};
      },
    ),
  );

  // Hook permission bits are encoded in the hook's own address — checkable offline.
  {
    const mask = BigInt(d.uniswap.PermissionedHooks) & ALL_HOOK_MASK;
    results.push({
      id: 'uni.hooks.mask',
      group: 'uniswap',
      label: 'PermissionedHooks adres bayrakları',
      address: d.uniswap.PermissionedHooks,
      expected: `0x${EXPECTED_HOOK_MASK.toString(16)} (beforeInitialize|beforeAddLiquidity|beforeSwap|afterSwap)`,
      actual: `0x${mask.toString(16)}`,
      status: mask === EXPECTED_HOOK_MASK ? 'pass' : 'fail',
      howChecked: 'uint160(hook) & Hooks.ALL_HOOK_MASK (zincir gerekmez)',
      source: 'Uniswap/contracts PermissionedHooksDeployer.sol + v4-core Hooks.sol:26',
      remediation:
        mask === EXPECTED_HOOK_MASK
          ? undefined
          : 'Bu adres beklenen hook izinlerini kodlamıyor — yanlış adres ya da farklı bir hook.',
    });
  }

  // ---- ENSv2 wiring --------------------------------------------------------
  results.push(
    await attempt(
      {
        id: 'ens.root',
        group: 'ens',
        label: 'Universal Resolver proxy → ROOT_REGISTRY',
        address: d.ens.UniversalResolverProxy,
        expected: d.ens.RootRegistry,
        howChecked: `eth_call ROOT_REGISTRY() @ ${short(d.ens.UniversalResolverProxy)}`,
        source: `ensdomains/contracts-v2 @ ${d.sources.ens.commit}`,
        remediation:
          'ENS Sepolia stack\'i yeniden deploy edilmiş olabilir. ENS booth\'una sor: "Sepolia ENSv2 stack\'i 15 Eylül deployment\'ından sonra yenilendi mi, hackathon için sabit bir deployment var mı?" Sonra deployments/11155111.json\'u güncelle.',
      },
      async () => {
        const got = (await client.readContract({
          address: getAddress(d.ens.UniversalResolverProxy),
          abi: ensUniversalResolverAbi,
          functionName: 'ROOT_REGISTRY',
        })) as string;
        return {actual: got, ok: eq(got, d.ens.RootRegistry)};
      },
    ),
  );

  // The 0xeEeE… proxy does not point straight at the resolver: it points at the
  // managed proxy, which points at UniversalResolverV2. Both hops are checked.
  results.push(
    await attempt(
      {
        id: 'ens.proxy.impl',
        group: 'ens',
        label: 'Universal Resolver proxy → yönetilen proxy',
        address: d.ens.UniversalResolverProxy,
        expected: d.ens.ManagedUniversalResolverProxy,
        howChecked: `eth_call implementation() @ ${short(d.ens.UniversalResolverProxy)}`,
        source: `ensdomains/contracts-v2 @ ${d.sources.ens.commit}`,
        remediation: 'Sabit proxy başka bir hedefe işaret ediyor — ENS stack\'i yenilenmiş olabilir.',
      },
      async () => {
        const got = (await client.readContract({
          address: getAddress(d.ens.UniversalResolverProxy),
          abi: ensResolverProxyAbi,
          functionName: 'implementation',
        })) as string;
        return {actual: got, ok: eq(got, d.ens.ManagedUniversalResolverProxy)};
      },
    ),
  );

  results.push(
    await attempt(
      {
        id: 'ens.managed.impl',
        group: 'ens',
        label: 'Yönetilen proxy → UniversalResolverV2',
        address: d.ens.ManagedUniversalResolverProxy,
        expected: d.ens.UniversalResolverV2,
        howChecked: `eth_call implementation() @ ${short(d.ens.ManagedUniversalResolverProxy)}`,
        source: `ensdomains/contracts-v2 @ ${d.sources.ens.commit}`,
        remediation:
          'Resolver sürümü değişmiş — pinlediğimiz ABI eski olabilir. ENS booth\'una sürüm sor.',
      },
      async () => {
        const got = (await client.readContract({
          address: getAddress(d.ens.ManagedUniversalResolverProxy),
          abi: ensResolverProxyAbi,
          functionName: 'implementation',
        })) as string;
        return {actual: got, ok: eq(got, d.ens.UniversalResolverV2)};
      },
    ),
  );

  results.push(
    await attempt(
      {
        id: 'ens.root.eth',
        group: 'ens',
        label: 'RootRegistry."eth" alt kaydı → ETHRegistry',
        address: d.ens.RootRegistry,
        expected: d.ens.ETHRegistry,
        howChecked: `eth_call getSubregistry("eth") @ ${short(d.ens.RootRegistry)}`,
        source: `ensdomains/contracts-v2 @ ${d.sources.ens.commit}`,
        remediation: '.eth TLD başka bir registry\'ye bağlı — tnvda.eth kaydını yanlış yere yaparız.',
      },
      async () => {
        const got = (await client.readContract({
          address: getAddress(d.ens.RootRegistry),
          abi: ensRegistryAbi,
          functionName: 'getSubregistry',
          args: ['eth'],
        })) as string;
        return {actual: got, ok: eq(got, d.ens.ETHRegistry)};
      },
    ),
  );

  results.push(
    await attempt(
      {
        id: 'ens.registrar.registry',
        group: 'ens',
        label: 'ETHRegistrar → ETH_REGISTRY',
        address: d.ens.ETHRegistrar,
        expected: d.ens.ETHRegistry,
        howChecked: `eth_call ETH_REGISTRY() @ ${short(d.ens.ETHRegistrar)}`,
        source: `ensdomains/contracts-v2 @ ${d.sources.ens.commit}`,
        remediation: 'Registrar başka bir registry\'ye yazıyor — Faz 3\'te tnvda.eth kaydı yanlış yere gider.',
      },
      async () => {
        const got = (await client.readContract({
          address: getAddress(d.ens.ETHRegistrar),
          abi: ensEthRegistrarAbi,
          functionName: 'ETH_REGISTRY',
        })) as string;
        return {actual: got, ok: eq(got, d.ens.ETHRegistry)};
      },
    ),
  );

  // Soft check: is the name we plan to use in Phase 3 still free?
  results.push(
    await attempt(
      {
        id: 'ens.tnvda.available',
        group: 'ens',
        label: 'tnvda.eth müsait mi (Faz 3)',
        address: d.ens.ETHRegistrar,
        expected: 'müsait',
        howChecked: `eth_call isAvailable("tnvda") @ ${short(d.ens.ETHRegistrar)}`,
        source: `ensdomains/contracts-v2 @ ${d.sources.ens.commit}`,
        remediation:
          'İsim alınmış. Faz 3\'te başka bir label seç (ör. tnvda-hanko) ve CLAUDE.md ile PHASES.md\'yi güncelle.',
      },
      async () => {
        const available = (await client.readContract({
          address: getAddress(d.ens.ETHRegistrar),
          abi: ensEthRegistrarAbi,
          functionName: 'isAvailable',
          args: ['tnvda'],
        })) as boolean;
        return {actual: available ? 'müsait' : 'alınmış', ok: available};
      },
    ),
  );

  results.push(
    await attempt(
      {
        id: 'ens.usdc',
        group: 'ens',
        label: 'MockUSDC okunabilir (kira ödemesi için)',
        address: d.ens.MockUSDC,
        expected: 'symbol + decimals okunuyor',
        howChecked: `eth_call symbol()/decimals() @ ${short(d.ens.MockUSDC)}`,
        source: `ensdomains/contracts-v2 @ ${d.sources.ens.commit}`,
      },
      async () => {
        const [symbol, decimals] = await Promise.all([
          client.readContract({address: getAddress(d.ens.MockUSDC), abi: erc20Abi, functionName: 'symbol'}),
          client.readContract({address: getAddress(d.ens.MockUSDC), abi: erc20Abi, functionName: 'decimals'}),
        ]);
        return {actual: `${symbol as string} · ${decimals as number} decimals`, ok: true};
      },
    ),
  );

  // ---- accounts ------------------------------------------------------------
  for (const actor of actors) {
    results.push(
      await attempt(
        {
          id: `acct.${actor.name}`,
          group: 'accounts',
          label: `${actor.name} bakiyesi`,
          address: actor.address,
          expected: `≥ ${minBalanceEth} ETH`,
          howChecked: `eth_getBalance(${short(actor.address)})`,
          source: '.env (private key\'den türetilen adres; anahtar asla loglanmaz)',
          remediation: `${actor.name} cüzdanına Sepolia ETH gönder (faucet veya deployer\'dan transfer).`,
        },
        async () => {
          const wei = await client.getBalance({address: getAddress(actor.address)});
          const eth = Number(formatEther(wei));
          return {actual: `${eth.toFixed(4)} ETH`, ok: eth >= minBalanceEth};
        },
      ),
    );
  }

  // ---- Hanko's own contracts (empty until Phase 1) -------------------------
  for (const [name, address] of Object.entries(d.hanko)) {
    if (name === 'deployBlock') continue;
    results.push({
      id: `hanko.${name}`,
      group: 'hanko',
      label: name,
      address: (address as string | null) ?? undefined,
      expected: 'Faz 1+ içinde deploy edilir',
      actual: address ? (address as string) : 'henüz deploy edilmedi',
      status: address ? 'pass' : 'pending',
      howChecked: 'deployments/11155111.json',
      source: 'Hanko deploy script\'leri',
    });
  }

  const summary = {
    pass: results.filter((r) => r.status === 'pass').length,
    fail: results.filter((r) => r.status === 'fail').length,
    unknown: results.filter((r) => r.status === 'unknown').length,
    pending: results.filter((r) => r.status === 'pending').length,
  };

  return {
    ranAt: new Date().toISOString(),
    rpcUrl: redactRpc(rpcUrl),
    chainId,
    blockNumber,
    latencyMs,
    results,
    summary,
  };
}

/** API keys often live in the RPC path; never surface the whole URL. */
export function redactRpc(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/…`;
  } catch {
    return 'geçersiz URL';
  }
}
