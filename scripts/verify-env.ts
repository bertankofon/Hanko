#!/usr/bin/env tsx
/**
 * Phase 0 verification CLI.
 *
 *   pnpm verify                 # against SEPOLIA_RPC_URL
 *   pnpm verify -- --rpc http://127.0.0.1:8545   # against an anvil fork
 *
 * Exits 1 if any check fails. `unknown` results are reported but do not fail the
 * run — they are things we could not prove, and they are never counted as green.
 */

import {writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {config as loadEnv} from 'dotenv';
import {privateKeyToAccount} from 'viem/accounts';
import {runChecks, type CheckResult, type CheckStatus} from './lib/checks.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
loadEnv({path: resolve(repoRoot, '.env'), quiet: true});

const rpcArgIndex = process.argv.indexOf('--rpc');
const rpcUrl =
  (rpcArgIndex !== -1 ? process.argv[rpcArgIndex + 1] : undefined) ??
  process.env.SEPOLIA_RPC_URL ??
  '';

if (!rpcUrl) {
  console.error('SEPOLIA_RPC_URL tanımlı değil ve --rpc verilmedi. .env dosyasını doldur.');
  process.exit(1);
}

/** Derives an address from a private key without ever printing the key. */
function deriveAddress(envName: string): string | null {
  const raw = process.env[envName];
  if (!raw) return null;
  try {
    const key = (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`;
    return privateKeyToAccount(key).address;
  } catch {
    console.warn(`  uyarı: ${envName} geçerli bir private key değil, atlanıyor`);
    return null;
  }
}

const actorEnv: {name: string; env: string}[] = [
  {name: 'Deployer / issuer', env: 'DEPLOYER_PRIVATE_KEY'},
  {name: 'Attester', env: 'ATTESTER_PRIVATE_KEY'},
  {name: 'Alice', env: 'ACTOR_ALICE_PK'},
  {name: 'Stranger', env: 'ACTOR_STRANGER_PK'},
  {name: 'Bot', env: 'ACTOR_BOT_PK'},
];

const actors = actorEnv
  .map(({name, env}) => {
    const address = deriveAddress(env);
    return address ? {name, address} : null;
  })
  .filter((a): a is {name: string; address: string} => a !== null);

const requiredEnv = [
  'SEPOLIA_RPC_URL',
  'ETHERSCAN_API_KEY',
  'DEPLOYER_PRIVATE_KEY',
  'ATTESTER_PRIVATE_KEY',
  'ACTOR_ALICE_PK',
  'ACTOR_STRANGER_PK',
  'ACTOR_BOT_PK',
].map((name) => ({name, present: Boolean(process.env[name])}));

const ICON: Record<CheckStatus, string> = {
  pass: '\u001b[32m●\u001b[0m',
  fail: '\u001b[31m●\u001b[0m',
  unknown: '\u001b[33m●\u001b[0m',
  pending: '\u001b[90m○\u001b[0m',
};
const GROUP_TITLE: Record<string, string> = {
  env: 'Ortam',
  uniswap: 'Uniswap v4 Permissioned',
  ens: 'ENSv2',
  accounts: 'Hesaplar',
  hanko: 'Hanko kontratları',
};

function printGroup(name: string, rows: CheckResult[]) {
  if (rows.length === 0) return;
  console.log(`\n\u001b[1m${GROUP_TITLE[name] ?? name}\u001b[0m`);
  for (const r of rows) {
    console.log(`  ${ICON[r.status]} ${r.label}`);
    console.log(`      beklenen: ${r.expected}`);
    console.log(`      okunan:   ${r.actual}`);
    if (r.status !== 'pass' && r.remediation) console.log(`      → ${r.remediation}`);
  }
}

const report = await runChecks({rpcUrl, actors, requiredEnv});

console.log(`\nHanko — deployment doğrulama`);
console.log(`RPC: ${report.rpcUrl} · chainId ${report.chainId} · blok #${report.blockNumber}`);

for (const group of ['env', 'uniswap', 'ens', 'accounts', 'hanko']) {
  printGroup(
    group,
    report.results.filter((r) => r.group === group),
  );
}

const {pass, fail, unknown, pending} = report.summary;
console.log(`\n${pass} geçti · ${fail} kaldı · ${unknown} belirsiz · ${pending} bekliyor\n`);

const outPath = resolve(repoRoot, 'deployments', `verification-${report.chainId ?? 'unknown'}.json`);
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Rapor: ${outPath}`);

process.exit(fail > 0 ? 1 : 0);
