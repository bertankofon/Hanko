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

/**
 * How much Sepolia ETH each non-deployer wallet should hold, keyed by its .env
 * name. One table drives both `fund-actors.ts` (which tops wallets up to the
 * target) and the balance check below (which warns at half the target), so the
 * two can never disagree about what "funded" means.
 *
 * Sizing: Sepolia gas was ~1.1 gwei when these were set, putting a swap at
 * ~0.0003 ETH and the whole Phase 2 pool setup at ~0.009 ETH. These are ~10x
 * that, so a gas spike cannot strand an actor mid-demo.
 */
export const ACTOR_FUNDING_TARGETS: {name: string; env: string; eth: string}[] = [
  {name: 'Attester', env: 'ATTESTER_PRIVATE_KEY', eth: '0.02'},
  {name: 'Alice', env: 'ACTOR_ALICE_PK', eth: '0.03'},
  {name: 'Stranger', env: 'ACTOR_STRANGER_PK', eth: '0.01'},
  {name: 'Bot', env: 'ACTOR_BOT_PK', eth: '0.01'},
];

/** A wallet is flagged once it drops below this fraction of its target. */
export const LOW_BALANCE_FRACTION = 0.5;

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
      actual: `call failed: ${message}`,
      status: 'unknown',
      remediation:
        base.remediation ??
        'RPC error or an unexpected ABI. Open the contract on Etherscan and confirm the function really exists.',
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
  actors?: {name: string; address: string; minEth?: number}[];
  /** Env var names that must be present; values are never read into results. */
  requiredEnv?: {name: string; present: boolean}[];
  /** Fallback minimum, used only for actors with no target of their own. */
  minBalanceEth?: number;
}

export async function runChecks(opts: RunOptions): Promise<VerificationReport> {
  const {rpcUrl, actors = [], requiredEnv = [], minBalanceEth = 0.01} = opts;
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
        label: 'RPC reachable and on the right network',
        expected: `chainId ${d.chainId}`,
        howChecked: 'eth_chainId + eth_blockNumber',
        source: 'deployments/11155111.json',
        remediation: 'Is SEPOLIA_RPC_URL a Sepolia endpoint? For an anvil fork pass --rpc http://127.0.0.1:8545.',
      },
      async () => {
        chainId = await client.getChainId();
        const block = await client.getBlockNumber();
        latencyMs = Date.now() - startedAt;
        blockNumber = block.toString();
        return {
          actual: `chainId ${chainId} · block #${blockNumber} · ${latencyMs}ms`,
          ok: chainId === d.chainId,
        };
      },
    ),
  );

  for (const {name, present} of requiredEnv) {
    results.push({
      id: `env.var.${name}`,
      group: 'env',
      label: `${name} is set`,
      expected: 'set',
      actual: present ? 'set' : 'missing',
      status: present ? 'pass' : 'fail',
      howChecked: 'process.env (presence only; the value is never read)',
      source: '.env.example',
      remediation: present ? undefined : `Add ${name} to .env.`,
    });
  }

  // ---- bytecode presence ---------------------------------------------------
  for (const {group, name, address} of knownAddresses) {
    results.push(
      await attempt(
        {
          id: `code.${name}`,
          group,
          label: `${name} has code`,
          address,
          expected: 'extcodesize > 0',
          howChecked: `eth_getCode(${short(address)})`,
          source: group === 'ens' ? 'ensdomains/contracts-v2 (pinned)' : 'Uniswap/contracts (pinned)',
          remediation: `${name} is not deployed on this network. Check the address and the network in deployments/11155111.json.`,
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
        'Wrong router version. v2.1.2 (0x7E4f…43f3) cannot do permissioned swaps — check the UniversalRouterV22 address in the deployments file.',
    },
    {
      id: 'uni.hooks.factory',
      label: 'PermissionedHooks → PERMISSIONS_ADAPTER_FACTORY',
      address: d.uniswap.PermissionedHooks,
      remediation: 'The hook is bound to a different factory and will not recognise our adapter. Ask at the Uniswap booth.',
    },
    {
      id: 'uni.posm.factory',
      label: 'PermissionedPositionManager → PERMISSIONS_ADAPTER_FACTORY',
      address: d.uniswap.PermissionedPositionManager,
      remediation: 'The position manager is bound to a different factory; the LP flow breaks in Phase 2.',
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
          remediation: 'Bound to a different PoolManager — we would open the pool on the wrong core.',
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
      label: 'PermissionedHooks address flags',
      address: d.uniswap.PermissionedHooks,
      expected: `0x${EXPECTED_HOOK_MASK.toString(16)} (beforeInitialize|beforeAddLiquidity|beforeSwap|afterSwap)`,
      actual: `0x${mask.toString(16)}`,
      status: mask === EXPECTED_HOOK_MASK ? 'pass' : 'fail',
      howChecked: 'uint160(hook) & Hooks.ALL_HOOK_MASK (no chain call needed)',
      source: 'Uniswap/contracts PermissionedHooksDeployer.sol + v4-core Hooks.sol:26',
      remediation:
        mask === EXPECTED_HOOK_MASK
          ? undefined
          : 'This address does not encode the expected hook permissions — wrong address, or a different hook.',
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
          'The ENS Sepolia stack may have been redeployed. Ask at the ENS booth: "Has the Sepolia ENSv2 stack been redeployed since the 15 Sep deployment, and is there a pinned hackathon deployment?" Then update deployments/11155111.json.',
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
        label: 'Universal Resolver proxy → managed proxy',
        address: d.ens.UniversalResolverProxy,
        expected: d.ens.ManagedUniversalResolverProxy,
        howChecked: `eth_call implementation() @ ${short(d.ens.UniversalResolverProxy)}`,
        source: `ensdomains/contracts-v2 @ ${d.sources.ens.commit}`,
        remediation: 'The fixed proxy points somewhere else — the ENS stack may have been redeployed.',
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
        label: 'Managed proxy → UniversalResolverV2',
        address: d.ens.ManagedUniversalResolverProxy,
        expected: d.ens.UniversalResolverV2,
        howChecked: `eth_call implementation() @ ${short(d.ens.ManagedUniversalResolverProxy)}`,
        source: `ensdomains/contracts-v2 @ ${d.sources.ens.commit}`,
        remediation:
          'The resolver version changed — our pinned ABI may be stale. Ask the ENS booth which version is current.',
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
        label: 'RootRegistry "eth" subregistry → ETHRegistry',
        address: d.ens.RootRegistry,
        expected: d.ens.ETHRegistry,
        howChecked: `eth_call getSubregistry("eth") @ ${short(d.ens.RootRegistry)}`,
        source: `ensdomains/contracts-v2 @ ${d.sources.ens.commit}`,
        remediation: 'The .eth TLD points at a different registry — we would register tnvda.eth in the wrong place.',
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
        remediation: 'The registrar writes to a different registry — the Phase 3 tnvda.eth registration would land in the wrong place.',
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

  // Before Phase 3 the question is whether the name is still free; afterwards it is whether the
  // name we took still points where we think it does.
  if (!d.hanko.TnvdaRegistry) {
    results.push(
      await attempt(
        {
          id: 'ens.tnvda.available',
          group: 'ens',
          label: 'tnvda.eth still available (for Phase 3)',
          address: d.ens.ETHRegistrar,
          expected: 'available',
          howChecked: `eth_call isAvailable("tnvda") @ ${short(d.ens.ETHRegistrar)}`,
          source: `ensdomains/contracts-v2 @ ${d.sources.ens.commit}`,
          remediation:
            'Someone else registered it. Pick another label for Phase 3 and update CLAUDE.md and PHASES.md.',
        },
        async () => {
          const available = (await client.readContract({
            address: getAddress(d.ens.ETHRegistrar),
            abi: ensEthRegistrarAbi,
            functionName: 'isAvailable',
            args: ['tnvda'],
          })) as boolean;
          return {actual: available ? 'available' : 'taken', ok: available};
        },
      ),
    );
  } else {
    results.push(
      await attempt(
        {
          id: 'ens.tnvda.subregistry',
          group: 'ens',
          label: 'tnvda.eth points at our registry',
          address: d.ens.ETHRegistry,
          expected: d.hanko.TnvdaRegistry,
          howChecked: `eth_call getSubregistry("tnvda") @ ${short(d.ens.ETHRegistry)}`,
          source: 'deployments/11155111.json',
          remediation:
            'The name no longer resolves to our registry, so every permission lookup returns nothing. Re-run the Phase 3 setup.',
        },
        async () => {
          const got = (await client.readContract({
            address: getAddress(d.ens.ETHRegistry),
            abi: ensRegistryAbi,
            functionName: 'getSubregistry',
            args: ['tnvda'],
          })) as string;
          return {actual: got, ok: eq(got, d.hanko.TnvdaRegistry)};
        },
      ),
    );
  }

  results.push(
    await attempt(
      {
        id: 'ens.usdc',
        group: 'ens',
        label: 'MockUSDC readable (used to pay ENS rent)',
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
    const floor = actor.minEth ?? minBalanceEth;
    results.push(
      await attempt(
        {
          id: `acct.${actor.name}`,
          group: 'accounts',
          label: `${actor.name} balance`,
          address: actor.address,
          expected: `≥ ${floor} ETH`,
          howChecked: `eth_getBalance(${short(actor.address)})`,
          source: '.env (address derived from the private key; the key itself is never logged)',
          remediation: `Fund the ${actor.name} wallet with Sepolia ETH (faucet, or a transfer from the deployer).`,
        },
        async () => {
          const wei = await client.getBalance({address: getAddress(actor.address)});
          const eth = Number(formatEther(wei));
          return {actual: `${eth.toFixed(4)} ETH`, ok: eth >= floor};
        },
      ),
    );
  }

  // ---- which allowlist is live --------------------------------------------
  const adapterAddress = d.hanko.PermissionsAdapter;
  const tokenAddress = d.hanko.MockStockToken;

  if (adapterAddress && tokenAddress) {
    results.push(
      await attempt(
        {
          id: 'hanko.checkerAgreement',
          group: 'hanko',
          label: 'Pool and token read the same allowlist',
          address: adapterAddress,
          expected: 'adapter.allowListChecker() == tNVDA.checker()',
          howChecked: 'eth_call allowListChecker() and checker()',
          source: 'PermissionsAdapter / MockStockToken',
          remediation:
            'They have drifted apart. A wallet the pool refuses could still take delivery of the underlying by a direct transfer, which is the loophole the project claims to close. Run SwitchChecker, which moves both.',
        },
        async () => {
          const [poolChecker, tokenChecker] = await Promise.all([
            client.readContract({
              address: getAddress(adapterAddress),
              abi: [
                {
                  type: 'function',
                  name: 'allowListChecker',
                  inputs: [],
                  outputs: [{type: 'address'}],
                  stateMutability: 'view',
                },
              ] as const,
              functionName: 'allowListChecker',
            }),
            client.readContract({
              address: getAddress(tokenAddress),
              abi: [
                {
                  type: 'function',
                  name: 'checker',
                  inputs: [],
                  outputs: [{type: 'address'}],
                  stateMutability: 'view',
                },
              ] as const,
              functionName: 'checker',
            }),
          ]);

          const which = eq(poolChecker, d.hanko.EnsAllowlistChecker)
            ? 'ENS'
            : eq(poolChecker, d.hanko.SimpleAllowlistChecker)
              ? 'mapping'
              : 'unrecognised';

          return {
            actual: `both read ${poolChecker} (${which})`,
            ok: eq(poolChecker, tokenChecker),
          };
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
      expected: 'deployed in Phase 1 onwards',
      actual: address ? (address as string) : 'not deployed yet',
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
    return 'invalid URL';
  }
}
