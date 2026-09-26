import 'server-only';

import {cookies} from 'next/headers';
import {getActors, type Actor} from './actors';

/**
 * Who the visitor is acting as.
 *
 * The whole product is one question — may this address trade? — so the most honest way to show it
 * is to let the visitor be a different address and watch the same screens answer differently.
 * The choice lives in a cookie so every server component can read it without threading a prop.
 */
export const ROLES = [
  {
    id: 'operator',
    actor: 'Issuer',
    label: 'Venue operator',
    blurb: 'Runs the venue. Clears members, halts a symbol, owns the ENS root.',
  },
  {
    id: 'alice',
    actor: 'Alice',
    label: 'Cleared investor',
    blurb: 'Holds swap and liquidity seals. Can delegate to an agent of her own.',
  },
  {
    id: 'bot',
    actor: 'Bot',
    label: "Investor's agent",
    blurb: 'A trading bot acting for the investor. Swap only, and only while she is cleared.',
  },
  {
    id: 'stranger',
    actor: 'Stranger',
    label: 'Not cleared',
    blurb: 'Funded and willing. The pool refuses every attempt.',
  },
] as const;

export type RoleId = (typeof ROLES)[number]['id'];

export const ROLE_COOKIE = 'hanko_role';
export const DEFAULT_ROLE: RoleId = 'alice';

export function isRoleId(value: string | undefined): value is RoleId {
  return ROLES.some((r) => r.id === value);
}

export interface Viewer {
  id: RoleId;
  label: string;
  blurb: string;
  actor: string;
  address: `0x${string}` | null;
}

/** The current viewer, resolved from the cookie and the actor keys. */
export async function getViewer(): Promise<Viewer> {
  const store = await cookies();
  const raw = store.get(ROLE_COOKIE)?.value;
  const id = isRoleId(raw) ? raw : DEFAULT_ROLE;
  const role = ROLES.find((r) => r.id === id)!;
  const actor: Actor | undefined = getActors().find((a) => a.name === role.actor);

  return {
    id,
    label: role.label,
    blurb: role.blurb,
    actor: role.actor,
    address: actor?.address ?? null,
  };
}

export function actorForRole(id: RoleId): string {
  return ROLES.find((r) => r.id === id)!.actor;
}
