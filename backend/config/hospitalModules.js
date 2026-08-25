const HOSPITAL_MODULES = [
  { id: 'patients', label: 'Patient Registration' },
  { id: 'op', label: 'Outpatient (OP)' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'ip', label: 'Inpatient (IP) & Nurse Station' },
  { id: 'billing', label: 'Billing' },
  { id: 'pharmacy', label: 'Pharmacy' },
  { id: 'lab', label: 'Laboratory' },
  { id: 'biomedical', label: 'Biomedical & Assets' },
  { id: 'reports', label: 'Audit Reports' },
  { id: 'changeRequests', label: 'Change Requests' },
];

const ALL_MODULE_IDS = HOSPITAL_MODULES.map((m) => m.id);

const sanitizeEnabledModules = (input) => {
  if (!Array.isArray(input)) return [...ALL_MODULE_IDS];
  const allowed = new Set(ALL_MODULE_IDS);
  return [...new Set(input.map((id) => String(id)).filter((id) => allowed.has(id)))];
};

/** Missing / non-array = all modules (Hospital A before this setting existed). Empty array = none. */
const isModuleEnabled = (org, moduleId) => {
  if (!moduleId) return true;
  const list = org?.enabledModules;
  if (!Array.isArray(list)) return true;
  return list.includes(moduleId);
};

module.exports = {
  HOSPITAL_MODULES,
  ALL_MODULE_IDS,
  sanitizeEnabledModules,
  isModuleEnabled,
};
