'use server';

import {cookies} from 'next/headers';
import {revalidatePath} from 'next/cache';
import {isRoleId, ROLE_COOKIE} from '@/lib/role';

/**
 * Switches who the visitor is acting as.
 *
 * Kept in a cookie rather than a query string so the choice survives navigation: the point of the
 * switcher is that the *same* screen answers differently depending on who is asking.
 */
export async function setRole(id: string): Promise<void> {
  if (!isRoleId(id)) return;

  const store = await cookies();
  store.set(ROLE_COOKIE, id, {path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30});
  revalidatePath('/', 'layout');
}
