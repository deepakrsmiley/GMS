import { isSuperAdmin } from './roles';
import { isClientOrg } from './hospitalA';

export const homePathForUser = (user) => {
  if (isSuperAdmin(user) && !isClientOrg(user?.organization)) return '/gms';
  return '/dashboard';
};
