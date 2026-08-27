const { normalizeRole, isSuperAdmin } = require('./roles');
const { resolveEffectivePermissions } = require('../config/permissions');

const PHARMACY_SCOPE_BILL_TYPES = new Set(['pharmacy', 'ip', 'lab']);

const userHasPermission = (user, code) => {
  if (!user) return false;
  if (isSuperAdmin(user.role)) return true;
  const perms = resolveEffectivePermissions(normalizeRole(user.role), user.permissions);
  return perms.includes('*') || perms.includes(code);
};

const isPharmacyScopeBill = (bill) => {
  const type = bill?.billType || 'unified';
  return PHARMACY_SCOPE_BILL_TYPES.has(type);
};

/**
 * Pharmacists with UPDATE_BILLING can manage any bill type (OP consultation,
 * lab, unified, IP, pharmacy) — same rule as the Billing page.
 * Pharmacists who only have CREATE_BILLING stay limited to pharmacy, IP, and lab bills.
 */
const pharmacistBillScopeError = (user, billLike) => {
  if (normalizeRole(user?.role) !== 'Pharmacist') return null;
  if (userHasPermission(user, 'UPDATE_BILLING')) return null;
  if (isPharmacyScopeBill(billLike)) return null;
  return 'Pharmacy users can manage pharmacy and IP pharmacy bills only';
};

module.exports = {
  isPharmacyScopeBill,
  pharmacistBillScopeError,
  userHasPermission,
};
