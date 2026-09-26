import 'server-only';

import {privateKeyToAccount} from 'viem/accounts';

/**
 * The demo cast. Keys live only in .env and are read only on the server; the
 * client never sees more than an address.
 *
 * Phase 7 replaces this with a proper actor switcher that signs from the
 * server; for now it is just who we display and what we expect of them.
 */
export const ACTORS = [
  {name: 'Issuer', env: 'DEPLOYER_PRIVATE_KEY', role: 'Venue operator — owns the token and the checker'},
  {name: 'Alice', env: 'ACTOR_ALICE_PK', role: 'Verified investor — may swap and provide liquidity'},
  {name: 'Stranger', env: 'ACTOR_STRANGER_PK', role: 'Not cleared — every attempt must be refused'},
  {name: 'Bot', env: 'ACTOR_BOT_PK', role: 'Trading agent — gets delegated swap rights in Phase 6'},
] as const;

export interface Actor {
  name: string;
  role: string;
  address: `0x${string}`;
}

/** Derives each actor's address. A key that is missing or malformed is skipped. */
export function getActors(): Actor[] {
  return ACTORS.flatMap(({name, env, role}) => {
    const raw = process.env[env];
    if (!raw) return [];
    try {
      const key = (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`;
      return [{name, role, address: privateKeyToAccount(key).address}];
    } catch {
      return [];
    }
  });
}
