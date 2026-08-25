const HOSPITAL_A_CODE = 'HOSP001';
const HOSPITAL_A_NAME_RX = /sanjeevi/i;

const toId = (value) => {
  if (!value) return '';
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

const pickHospitalA = (orgs = []) => {
  const list = Array.isArray(orgs) ? orgs.filter(Boolean) : [];
  if (!list.length) return null;
  const byCode = list.find((org) => String(org.code || '').toUpperCase() === HOSPITAL_A_CODE);
  if (byCode) return byCode;
  const byName = list.find((org) => HOSPITAL_A_NAME_RX.test(String(org.name || '')));
  if (byName) return byName;
  return [...list].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))[0] || null;
};

const isHospitalA = (org, orgs = []) => {
  if (!org) return false;
  const code = String(org.code || '').toUpperCase();
  if (code === HOSPITAL_A_CODE) return true;
  if (HOSPITAL_A_NAME_RX.test(String(org.name || ''))) return true;
  const hospitalA = pickHospitalA(orgs);
  return !!(hospitalA && toId(org._id || org) === toId(hospitalA._id));
};

const organizationSnapshot = (org) => {
  if (!org) return null;
  const { sanitizeEnabledModules } = require('../config/hospitalModules');
  return {
    _id: org._id,
    name: org.name,
    code: org.code,
    status: org.status,
    logo: org.logo || '',
    enabledModules: sanitizeEnabledModules(org.enabledModules),
  };
};

module.exports = {
  HOSPITAL_A_CODE,
  HOSPITAL_A_NAME_RX,
  pickHospitalA,
  isHospitalA,
  organizationSnapshot,
  toId,
};
