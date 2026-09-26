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
/**
 * Who you can be, named by who they are rather than by what they hold.
 *
 * An earlier version called the fourth one "Not cleared", which stopped being true the moment the
 * walkthrough cleared them — and left no way back, because the label no longer matched the screen.
 * Identity is fixed; whether they hold a seal is read from chain and shown beside the name.
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
    label: 'Investor',
    blurb: 'Trades for herself, and can delegate to an agent of her own.',
  },
  {
    id: 'bot',
    actor: 'Bot',
    label: "Investor's bot",
    blurb: 'A trading agent. Swap only, and only while she is cleared.',
  },
  {
    id: 'stranger',
    actor: 'Stranger',
    label: 'A visitor',
    blurb: 'Funded and willing. Starts out with no seal at all.',
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
