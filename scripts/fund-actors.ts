#!/usr/bin/env tsx
/**
 * Tops up the attester and the demo actors from the deployer wallet.
 *
 *   pnpm --filter @hanko/verify fund            # dry run, prints the plan
 *   pnpm --filter @hanko/verify fund -- --send  # actually sends
 *
 * Idempotent: each wallet is topped up to its target, so a second run after a
 * phase has burned gas sends only the difference. Wallets already at target are
 * skipped. Private keys are read from .env and never printed.
 */

import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {config as loadEnv} from 'dotenv';
import {createWalletClient, createPublicClient, http, formatEther, parseEther} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {sepolia} from 'viem/chains';
import {ACTOR_FUNDING_TARGETS} from './lib/checks';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({path: resolve(here, '..', '.env'), quiet: true});

/** Leave this much with the deployer no matter what; Phase 2 deploys are the expensive ones. */
const DEPLOYER_FLOOR = parseEther('0.15');

const send = process.argv.includes('--send');
const rpcUrl = process.env.SEPOLIA_RPC_URL;
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;

if (!rpcUrl || !deployerKey) {
  console.error('SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY must both be set in .env.');
  process.exit(1);
}

const normalise = (k: string) => (k.startsWith('0x') ? k : `0x${k}`) as `0x${string}`;

const deployer = privateKeyToAccount(normalise(deployerKey));
const publicClient = createPublicClient({chain: sepolia, transport: http(rpcUrl)});
const walletClient = createWalletClient({account: deployer, chain: sepolia, transport: http(rpcUrl)});

const deployerBalance = await publicClient.getBalance({address: deployer.address});
console.log(`Deployer ${deployer.address} — ${formatEther(deployerBalance)} ETH\n`);

let totalNeeded = 0n;
const plan: {name: string; to: `0x${string}`; value: bigint}[] = [];

for (const target of ACTOR_FUNDING_TARGETS) {
  const key = process.env[target.env];
  if (!key) {
    console.log(`  ${target.name.padEnd(9)} — ${target.env} not set, skipping`);
    continue;
  }
  const address = privateKeyToAccount(normalise(key)).address;
  const balance = await publicClient.getBalance({address});
  const goal = parseEther(target.eth);
  const missing = balance >= goal ? 0n : goal - balance;

  console.log(
    `  ${target.name.padEnd(9)} ${address} — has ${formatEther(balance)}, target ${target.eth}` +
      (missing === 0n ? ' → ok' : ` → send ${formatEther(missing)}`),
  );

  if (missing > 0n) {
    plan.push({name: target.name, to: address, value: missing});
    totalNeeded += missing;
  }
}

if (plan.length === 0) {
  console.log('\nEvery wallet is already funded.');
  process.exit(0);
}

console.log(`\nTotal to send: ${formatEther(totalNeeded)} ETH`);

if (deployerBalance - totalNeeded < DEPLOYER_FLOOR) {
  console.error(
    `\nThis would leave the deployer under ${formatEther(DEPLOYER_FLOOR)} ETH, which is not enough ` +
      'for the Phase 2 pool setup. Lower the targets or fund the deployer first.',
  );
  process.exit(1);
}

if (!send) {
  console.log('\nDry run. Re-run with --send to broadcast.');
  process.exit(0);
}

for (const {name, to, value} of plan) {
  const hash = await walletClient.sendTransaction({to, value});
  console.log(`  ${name.padEnd(9)} ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({hash});
  console.log(`  ${''.padEnd(9)} ${receipt.status} in block ${receipt.blockNumber}`);
}

console.log('\nDone. Run `pnpm verify` to see the balances on the System tab.');
