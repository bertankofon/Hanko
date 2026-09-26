'use server';

import {getAddress, type Address} from 'viem';
import {getActors} from '@/lib/actors';
import {getClient, hankoAddress} from '@/lib/hanko';
import {adapterAdminAbi, posmAdminAbi, registryAdminAbi} from '@/lib/operator';
import type {OperatorResult} from '@/lib/operator-result';
import {getActorWallet} from '@/lib/swap';

const POSM = '0x864C37908Aa5e10b100CaCEe1c62E3954d76f5E1' as Address;

/**
 * The venue operator's transactions, signed server-side as the issuer.
 *
 * Every one of these is a power the SEC order expects a venue to hold. They are separate from the
 * investor's own actions on purpose: the operator can halt trading and revoke access, and cannot
 * grant an agent a name inside an investor's registry — that half belongs to the investor.
 */

function issuerWallet() {
  return getActorWallet('Issuer');
}

async function send(
  call: () => Promise<Address>,
  onOk: (hash: Address) => OperatorResult,
): Promise<OperatorResult> {
  const client = getClient();
  if (!client) return {status: 'error', headline: 'Not configured', detail: 'No RPC in .env.'};

  try {
    const hash = await call();
    const receipt = await client.waitForTransactionReceipt({hash});
    if (receipt.status !== 'success') {
      return {status: 'error', headline: 'Transaction reverted', txHash: hash};
    }
    return onOk(hash);
  } catch (err) {
    return {
      status: 'error',
      headline: 'Failed',
      detail: err instanceof Error ? err.message.split('\n')[0] : String(err),
    };
  }
}

/** Stops every swap on the asset at once, cleared traders included. */
export async function setTrading(_prev: OperatorResult, formData: FormData): Promise<OperatorResult> {
  const enabled = formData.get('enabled') === 'true';
  const adapter = hankoAddress('PermissionsAdapter');
  const wallet = issuerWallet();
  if (!adapter || !wallet) return {status: 'error', headline: 'Not configured'};

  return send(
    () =>
      wallet.writeContract({
        address: adapter,
        abi: adapterAdminAbi,
        functionName: 'updateSwappingEnabled',
        args: [enabled],
        chain: wallet.chain,
        account: wallet.account,
      }),
    (hash) => ({
      status: 'ok',
      headline: enabled ? 'Trading resumed' : 'Trading halted',
      detail: enabled
        ? 'Cleared participants can trade again.'
        : 'Every swap on this asset now reverts, including cleared participants — the same switch a halt on the underlying would pull.',
      txHash: hash,
    }),
  );
}

/** Clears both of an investor's names. Their agents lose access with them. */
export async function revokeAccess(_prev: OperatorResult, formData: FormData): Promise<OperatorResult> {
  const actorName = String(formData.get('actor') ?? '');
  const actor = getActors().find((a) => a.name === actorName);
  const wallet = issuerWallet();
  const client = getClient();
  const swapRegistry = hankoAddress('SwapRegistry');
  const lpRegistry = hankoAddress('LpRegistry');
  const checker = hankoAddress('EnsAllowlistChecker');

  if (!actor || !wallet || !client || !swapRegistry || !lpRegistry || !checker) {
    return {status: 'error', headline: 'Not configured'};
  }

  const label = actor.address.toLowerCase();
  let cleared = 0;
  let lastHash: Address | undefined;

  for (const registry of [swapRegistry, lpRegistry]) {
    const owner = await client.readContract({
      address: registry,
      abi: registryAdminAbi,
      functionName: 'findOwner',
      args: [label],
    });
    if (owner.toLowerCase() !== actor.address.toLowerCase()) continue;

    const tokenId = await client.readContract({
      address: registry,
      abi: registryAdminAbi,
      functionName: 'findTokenId',
      args: [label],
    });

    const result = await send(
      () =>
        wallet.writeContract({
          address: registry,
          abi: registryAdminAbi,
          functionName: 'unregister',
          args: [tokenId],
          chain: wallet.chain,
          account: wallet.account,
        }),
      (hash) => ({status: 'ok', headline: '', txHash: hash}),
    );
    if (result.status === 'error') return result;
    cleared += 1;
    lastHash = result.txHash;
  }

  if (cleared === 0) {
    return {status: 'ok', headline: `${actor.name} holds no permissions`, detail: 'Nothing to revoke.'};
  }

  return {
    status: 'ok',
    headline: `${actor.name}'s access revoked`,
    detail: `${cleared} name${cleared > 1 ? 's' : ''} cleared. Any agent acting for ${actor.name} lost access in the same transaction — ENS stops resolving their registry, so there is no second list to update.`,
    txHash: lastHash,
  };
}

/**
 * Force-closes the LP position and returns the assets to the LP.
 *
 * Revocation must not strand capital: a venue that can bar someone but not let them out has
 * created a trap rather than a control.
 */
export async function unwind(_prev: OperatorResult, formData: FormData): Promise<OperatorResult> {
  const tokenId = BigInt(String(formData.get('tokenId') ?? '0'));
  const wallet = issuerWallet();
  const client = getClient();
  if (!wallet || !client) return {status: 'error', headline: 'Not configured'};

  const liquidity = await client.readContract({
    address: POSM,
    abi: posmAdminAbi,
    functionName: 'getPositionLiquidity',
    args: [tokenId],
  });
  if (liquidity === 0n) {
    return {status: 'ok', headline: `Position #${tokenId} is already empty`, detail: 'Nothing to unwind.'};
  }

  return send(
    () =>
      wallet.writeContract({
        address: POSM,
        abi: posmAdminAbi,
        functionName: 'unwindPosition',
        args: [tokenId, 0n, 0n, '0x'],
        chain: wallet.chain,
        account: wallet.account,
      }),
    (hash) => ({
      status: 'ok',
      headline: `Position #${tokenId} unwound`,
      detail: 'The position is closed and both assets were delivered back to the LP.',
      txHash: hash,
    }),
  );
}

export async function readOperatorState() {
  const client = getClient();
  const adapter = hankoAddress('PermissionsAdapter');
  if (!client || !adapter) return null;

  const [swappingEnabled, owner] = await Promise.all([
    client.readContract({address: adapter, abi: adapterAdminAbi, functionName: 'swappingEnabled'}),
    client.readContract({address: adapter, abi: adapterAdminAbi, functionName: 'owner'}),
  ]);

  return {swappingEnabled, owner: getAddress(owner)};
}
