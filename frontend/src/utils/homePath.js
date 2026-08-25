import { isSuperAdmin } from './roles';
import { isClientOrg } from './hospitalA';

/** GMS platform console only — not while working inside a client hospital. */
export const isGmsConsoleUser = (user) =>
  isSuperAdmin(user) && !isClientOrg(user?.organization);

export const homePathForUser = (user) => (isGmsConsoleUser(user) ? '/gms' : '/dashboard');

