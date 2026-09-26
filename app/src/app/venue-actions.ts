'use server';

import {revalidatePath} from 'next/cache';
import {type Address} from 'viem';
import {d} from '@hanko/verify';
import {getActors} from '@/lib/actors';
import {adapterAbi, getClient, hankoAddress} from '@/lib/hanko';
import {adapterAdminAbi, registryAdminAbi} from '@/lib/operator';
import type {OperatorResult} from '@/lib/operator-result';
import {getActorWallet} from '@/lib/swap';
import {getStock, getStocks} from '@/lib/venue';

/**
 * Every write the venue and its members can make, in one place.
 *
 * Two parties, deliberately kept apart. The venue clears people and halts symbols; it cannot put
 * an agent inside a member's registry. The member delegates to their own agents; they cannot clear
 * anyone. Neither can do the other's half, and that separation is the product.
 */

/** Long enough that nothing lapses mid-demo, short enough to be a real expiry. */
const MEMBER_TTL_SECONDS = 30n * 24n * 60n * 60n;

/** ENSv2 RegistryRolesLib. Only the one role an investor needs to re-point their own registry. */
const ROLE_SET_SUBREGISTRY = 1n << 20n;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

function labelFor(address: Address): string {
  return address.toLowerCase();
}

function actorAddress(name: string): Address | null {
  return getActors().find((a) => a.name === name)?.address ?? null;
}

async function send(
  call: () => Promise<Address>,
): Promise<{hash: Address} | {error: string}> {
  const client = getClient();
  if (!client) return {error: 'No RPC configured.'};
  try {
    const hash = await call();
    const receipt = await client.waitForTransactionReceipt({hash});
    if (receipt.status !== 'success') return {error: 'Transaction reverted.'};
    return {hash};
  } catch (err) {
    return {error: err instanceof Error ? err.message.split('\n')[0] : String(err)};
  }
}

/**
 * Several writes from one wallet, submitted back to back instead of one confirmation at a time.
 *
 * Waiting for each receipt before sending the next turns a nine-transaction reset into four
 * minutes of staring at a button, because every wait costs a Sepolia block. The nonce is read once
 * and incremented locally, so the transactions still land in order; only the waiting is shared.
 *
 * Safe only for calls that do not depend on each other's state, since gas is estimated up front.
 */
async function sendBatch(
  wallet: NonNullable<ReturnType<typeof getActorWallet>>,
  calls: {address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[]}[],
): Promise<{hashes: Address[]} | {error: string}> {
  const client = getClient();
  if (!client) return {error: 'No RPC configured.'};
  if (calls.length === 0) return {hashes: []};

  try {
    let nonce = await client.getTransactionCount({
      address: wallet.account.address,
      blockTag: 'pending',
    });

    const hashes: Address[] = [];
    for (const call of calls) {
      hashes.push(
        await wallet.writeContract({
          address: call.address,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous call list
          abi: call.abi as any,
          functionName: call.functionName,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous call list
          args: call.args as any,
          nonce: nonce++,
          chain: wallet.chain,
          account: wallet.account,
        }),
      );
    }

    const receipts = await Promise.all(hashes.map((hash) => client.waitForTransactionReceipt({hash})));
    if (receipts.some((r) => r.status !== 'success')) return {error: 'A transaction reverted.'};
    return {hashes};
  } catch (err) {
    return {error: err instanceof Error ? err.message.split('\n')[0] : String(err)};
  }
}

function registries() {
  return {
    swap: hankoAddress('SwapRegistry'),
    lp: hankoAddress('LpRegistry'),
    agents: hankoAddress('AgentIndex'),
  };
}

function refresh() {
  revalidatePath('/', 'layout');
}

/* ---- the venue's half ------------------------------------------------- */

/**
 * Clears a member: one ENS name per permission, each registered with no transfer role.
 *
 * Role bitmap 0 is the point. The holder owns the name and nothing else — they cannot sell it,
 * lend it, or renew it. Clearance that can be traded is not clearance.
 */
export async function grantAccess(
  actorName: string,
  permissions: {swap: boolean; liquidity: boolean} = {swap: true, liquidity: true},
): Promise<OperatorResult> {
  const wallet = getActorWallet('Issuer');
  const client = getClient();
  const account = actorAddress(actorName);
  const {swap, lp} = registries();

  if (!wallet || !client || !account || !swap || !lp) {
    return {status: 'error', headline: 'Not configured'};
  }

  const label = labelFor(account);
  const expiry = BigInt(Math.floor(Date.now() / 1000)) + MEMBER_TTL_SECONDS;
  const wanted = [
    ...(permissions.swap ? [{registry: swap, what: 'swap'}] : []),
    ...(permissions.liquidity ? [{registry: lp, what: 'liquidity'}] : []),
  ];

  const granted: string[] = [];
  const calls: {address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[]}[] = [];

  for (const {registry, what} of wanted) {
    const owner = await client.readContract({
      address: registry,
      abi: registryAdminAbi,
      functionName: 'findOwner',
      args: [label],
    });
    if (owner.toLowerCase() === account.toLowerCase()) continue;

    calls.push({
      address: registry,
      abi: registryAdminAbi,
      functionName: 'register',
      args: [label, account, ZERO_ADDRESS, ZERO_ADDRESS, 0n, expiry],
    });
    granted.push(what);
  }

  const batch = await sendBatch(wallet, calls);
  if ('error' in batch) return {status: 'error', headline: 'Could not clear', detail: batch.error};
  const lastHash = batch.hashes.at(-1);

  refresh();

  if (granted.length === 0) {
    return {status: 'ok', headline: `${actorName} was already cleared`, detail: 'Nothing to grant.'};
  }
  return {
    status: 'ok',
    headline: `${actorName} cleared for ${granted.join(' and ')}`,
    detail: `Registered under ${granted.map((g) => (g === 'swap' ? 'swap' : 'lp')).join('.hanko.eth and ')}.hanko.eth, with no transfer role and a 30-day expiry.`,
    txHash: lastHash,
  };
}

/** Withdraws a member's seals. Anyone acting for them loses access in the same transaction. */
export async function revokeAccess(actorName: string): Promise<OperatorResult> {
  const wallet = getActorWallet('Issuer');
  const client = getClient();
  const account = actorAddress(actorName);
  const {swap, lp} = registries();

  if (!wallet || !client || !account || !swap || !lp) {
    return {status: 'error', headline: 'Not configured'};
  }

  const label = labelFor(account);
  const calls: {address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[]}[] = [];

  for (const registry of [swap, lp]) {
    const owner = await client.readContract({
      address: registry,
      abi: registryAdminAbi,
      functionName: 'findOwner',
      args: [label],
    });
    if (owner.toLowerCase() !== account.toLowerCase()) continue;

    const tokenId = await client.readContract({
      address: registry,
      abi: registryAdminAbi,
      functionName: 'findTokenId',
      args: [label],
    });
    calls.push({address: registry, abi: registryAdminAbi, functionName: 'unregister', args: [tokenId]});
  }

  const batch = await sendBatch(wallet, calls);
  if ('error' in batch) return {status: 'error', headline: 'Could not revoke', detail: batch.error};
  const cleared = calls.length;
  const lastHash = batch.hashes.at(-1);

  refresh();

  if (cleared === 0) {
    return {status: 'ok', headline: `${actorName} holds no seals`, detail: 'Nothing to revoke.'};
  }
  return {
    status: 'ok',
    headline: `${actorName}'s access revoked`,
    detail: `${cleared} name${cleared > 1 ? 's' : ''} withdrawn. Any agent acting for ${actorName} stopped in the same transaction — ENS no longer resolves through the lapsed name, so there is no second list to clean up.`,
    txHash: lastHash,
  };
}

/**
 * Halts or resumes one symbol.
 *
 * This is the condition the order is most specific about: a venue "must stop trading in a
 * tokenized NMS stock concurrently with any stoppage of trading in the underlying". It is per
 * symbol and it applies to everyone, cleared or not — which is exactly what the adapter's own
 * switch does.
 */
export async function setTrading(symbol: string, enabled: boolean): Promise<OperatorResult> {
  const wallet = getActorWallet('Issuer');
  const client = getClient();
  const stock = getStock(symbol);
  if (!wallet || !client || !stock) return {status: 'error', headline: 'Not configured'};

  // Sending a transaction to set a switch to the value it already holds costs a confirmation and
  // proves nothing. The reset button runs this for every symbol, so the check pays for itself.
  const current = await client
    .readContract({address: stock.adapter, abi: adapterAbi, functionName: 'swappingEnabled'})
    .catch(() => null);
  if (current === enabled) {
    return {
      status: 'ok',
      headline: enabled ? `${stock.symbol} was already trading` : `${stock.symbol} was already halted`,
    };
  }

  const result = await send(() =>
    wallet.writeContract({
      address: stock.adapter,
      abi: adapterAdminAbi,
      functionName: 'updateSwappingEnabled',
      args: [enabled],
      chain: wallet.chain,
      account: wallet.account,
    }),
  );
  if ('error' in result) return {status: 'error', headline: 'Could not change trading', detail: result.error};

  refresh();
  return {
    status: 'ok',
    headline: enabled ? `Trading resumed in ${stock.symbol}` : `Trading halted in ${stock.symbol}`,
    detail: enabled
      ? 'Cleared members can trade this symbol again. Other symbols were untouched.'
      : 'Nobody can trade this symbol, cleared or not. The venue’s other symbols keep trading — a halt is a property of the asset, not of the people.',
    txHash: result.hash,
  };
}

/* ---- the member's half -------------------------------------------------- */

/**
 * The investor grants their bot a name inside their own registry.
 *
 * Two halves that cannot be merged: the venue records a pointer in the agent index so the checker
 * can find the principal from the agent's address alone, and the investor makes the actual grant.
 * The pointer without the grant is worth nothing.
 */
export async function delegate(): Promise<OperatorResult> {
  const client = getClient();
  const issuer = getActorWallet('Issuer');
  const alice = getActorWallet('Alice');
  const principal = actorAddress('Alice');
  const agent = actorAddress('Bot');
  const {swap, agents} = registries();
  const recorded = hankoAddress('AliceRegistry');

  if (!client || !issuer || !alice || !principal || !agent || !swap || !agents || !recorded) {
    return {status: 'error', headline: 'Not configured'};
  }

  const principalLabel = labelFor(principal);
  const agentLabel = labelFor(agent);

  const stillCleared = await client.readContract({
    address: swap,
    abi: registryAdminAbi,
    functionName: 'findOwner',
    args: [principalLabel],
  });
  if (stillCleared.toLowerCase() !== principal.toLowerCase()) {
    return {
      status: 'error',
      headline: 'The principal is not cleared',
      detail: 'An agent hangs under its principal’s name. Clear the investor first.',
    };
  }

  const expiry = await client.readContract({
    address: swap,
    abi: registryAdminAbi,
    functionName: 'findExpiry',
    args: [principalLabel],
  });
  const tokenId = await client.readContract({
    address: swap,
    abi: registryAdminAbi,
    functionName: 'findTokenId',
    args: [principalLabel],
  });

  // A revoke and re-grant creates a *new* entry with no subregistry, so the investor's registry
  // has to be re-attached rather than redeployed. Without this the whole chain silently resolves
  // to nothing the first time access is restored.
  const attached = await client.readContract({
    address: swap,
    abi: registryAdminAbi,
    functionName: 'getSubregistry',
    args: [principalLabel],
  });

  if (attached.toLowerCase() !== recorded.toLowerCase()) {
    const grant = await send(() =>
      issuer.writeContract({
        address: swap,
        abi: registryAdminAbi,
        functionName: 'grantRoles',
        args: [tokenId, ROLE_SET_SUBREGISTRY, principal],
        chain: issuer.chain,
        account: issuer.account,
      }),
    );
    if ('error' in grant) return {status: 'error', headline: 'Could not re-attach the registry', detail: grant.error};

    const point = await send(() =>
      issuer.writeContract({
        address: swap,
        abi: registryAdminAbi,
        functionName: 'setSubregistry',
        args: [tokenId, recorded],
        chain: issuer.chain,
        account: issuer.account,
      }),
    );
    if ('error' in point) return {status: 'error', headline: 'Could not re-attach the registry', detail: point.error};
  }

  // The index entry: the pointer lives in the resolver field, not the subregistry field, so ENS
  // indexers keep placing the investor's registry under her own name rather than under the index.
  const indexed = await client.readContract({
    address: agents,
    abi: registryAdminAbi,
    functionName: 'findOwner',
    args: [agentLabel],
  });

  if (indexed.toLowerCase() !== agent.toLowerCase()) {
    const register = await send(() =>
      issuer.writeContract({
        address: agents,
        abi: registryAdminAbi,
        functionName: 'register',
        args: [agentLabel, agent, ZERO_ADDRESS, recorded, 0n, expiry],
        chain: issuer.chain,
        account: issuer.account,
      }),
    );
    if ('error' in register) return {status: 'error', headline: 'Could not index the agent', detail: register.error};
  }

  // The grant itself, signed by the investor. The venue cannot make this call.
  const holds = await client.readContract({
    address: recorded,
    abi: registryAdminAbi,
    functionName: 'findOwner',
    args: [agentLabel],
  });

  if (holds.toLowerCase() === agent.toLowerCase()) {
    refresh();
    return {status: 'ok', headline: 'The agent already holds a name', detail: 'Nothing to do.'};
  }

  const granted = await send(() =>
    alice.writeContract({
      address: recorded,
      abi: registryAdminAbi,
      functionName: 'register',
      args: [agentLabel, agent, ZERO_ADDRESS, ZERO_ADDRESS, 0n, expiry],
      chain: alice.chain,
      account: alice.account,
    }),
  );
  if ('error' in granted) return {status: 'error', headline: 'Could not delegate', detail: granted.error};

  refresh();
  return {
    status: 'ok',
    headline: 'The investor delegated trading to her bot',
    detail: 'The bot now holds a name inside her registry, so it may swap and may not provide liquidity. The venue was not asked.',
    txHash: granted.hash,
  };
}

/** The investor takes the delegation back, without the venue doing anything. */
export async function undelegate(): Promise<OperatorResult> {
  const client = getClient();
  const alice = getActorWallet('Alice');
  const agent = actorAddress('Bot');
  const registry = hankoAddress('AliceRegistry');

  if (!client || !alice || !agent || !registry) return {status: 'error', headline: 'Not configured'};

  const agentLabel = labelFor(agent);
  const holds = await client.readContract({
    address: registry,
    abi: registryAdminAbi,
    functionName: 'findOwner',
    args: [agentLabel],
  });
  if (holds.toLowerCase() !== agent.toLowerCase()) {
    return {status: 'ok', headline: 'The agent holds no name', detail: 'Nothing to take back.'};
  }

  const tokenId = await client.readContract({
    address: registry,
    abi: registryAdminAbi,
    functionName: 'findTokenId',
    args: [agentLabel],
  });

  const result = await send(() =>
    alice.writeContract({
      address: registry,
      abi: registryAdminAbi,
      functionName: 'unregister',
      args: [tokenId],
      chain: alice.chain,
      account: alice.account,
    }),
  );
  if ('error' in result) return {status: 'error', headline: 'Could not undelegate', detail: result.error};

  refresh();
  return {
    status: 'ok',
    headline: 'The investor took the delegation back',
    detail: 'The bot stops trading immediately. Her own seals are untouched.',
    txHash: result.hash,
  };
}

/* ---- putting it back ---------------------------------------------------- */

/**
 * Returns the venue to its starting state so the next visitor sees what the last one did.
 *
 * A demo nobody can re-run is a video. This one is a place.
 */
export async function resetVenue(): Promise<OperatorResult> {
  const client = getClient();
  const wallet = getActorWallet('Issuer');
  const alice = actorAddress('Alice');
  const stranger = actorAddress('Stranger');
  const {swap, lp} = registries();

  if (!client || !wallet || !alice || !stranger || !swap || !lp) {
    return {status: 'error', headline: 'Not configured'};
  }

  const expiry = BigInt(Math.floor(Date.now() / 1000)) + MEMBER_TTL_SECONDS;
  const calls: {address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[]}[] = [];

  // Resume anything that was halted.
  for (const stock of getStocks()) {
    const trading = await client
      .readContract({address: stock.adapter, abi: adapterAbi, functionName: 'swappingEnabled'})
      .catch(() => true);
    if (!trading) {
      calls.push({
        address: stock.adapter,
        abi: adapterAdminAbi,
        functionName: 'updateSwappingEnabled',
        args: [true],
      });
    }
  }

  // Put the investor's seals back, and take the stranger's away.
  for (const registry of [swap, lp]) {
    const aliceOwner = await client.readContract({
      address: registry,
      abi: registryAdminAbi,
      functionName: 'findOwner',
      args: [labelFor(alice)],
    });
    if (aliceOwner.toLowerCase() !== alice.toLowerCase()) {
      calls.push({
        address: registry,
        abi: registryAdminAbi,
        functionName: 'register',
        args: [labelFor(alice), alice, ZERO_ADDRESS, ZERO_ADDRESS, 0n, expiry],
      });
    }

    const strangerOwner = await client.readContract({
      address: registry,
      abi: registryAdminAbi,
      functionName: 'findOwner',
      args: [labelFor(stranger)],
    });
    if (strangerOwner.toLowerCase() === stranger.toLowerCase()) {
      const tokenId = await client.readContract({
        address: registry,
        abi: registryAdminAbi,
        functionName: 'findTokenId',
        args: [labelFor(stranger)],
      });
      calls.push({
        address: registry,
        abi: registryAdminAbi,
        functionName: 'unregister',
        args: [tokenId],
      });
    }
  }

  const batch = await sendBatch(wallet, calls);
  if ('error' in batch) return {status: 'error', headline: 'Reset failed', detail: batch.error};

  // Re-made last, because it reads the investor's freshly granted name.
  const delegated = await delegate();
  if (delegated.status === 'error') return delegated;

  refresh();
  return {
    status: 'ok',
    headline: 'The venue is back to its starting state',
    detail: `${calls.length + (delegated.txHash ? 1 : 0)} transaction${calls.length === 0 ? '' : 's'} — trading open on every symbol, the investor cleared, her agent delegated, the stranger left uncleared. Run the walkthrough again from the top.`,
    txHash: batch.hashes.at(-1) ?? delegated.txHash,
  };
}

/** Addresses the pages link to, gathered once. */
export async function venueLinks() {
  return {
    root: d.hanko.VenueRegistry,
    swap: d.hanko.SwapRegistry,
    lp: d.hanko.LpRegistry,
    agents: d.hanko.AgentIndex,
    checker: d.hanko.EnsAllowlistChecker,
  };
}
