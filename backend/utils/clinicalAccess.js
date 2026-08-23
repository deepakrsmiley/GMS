const { normalizeRole, isSuperAdmin } = require('./roles');

/** After discharge: Super Admin / Admin only (or PROCESS_DISCHARGE + MANAGE_STAFF). */
const canEditDischargeAfterDischarge = (user) => {
  if (!user) return false;
  const role = normalizeRole(user.role);
  if (isSuperAdmin(role) || role === 'Admin') return true;
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  if (perms.includes('*')) return true;
  return perms.includes('PROCESS_DISCHARGE') && perms.includes('MANAGE_STAFF');
};

module.exports = { canEditDischargeAfterDischarge };
