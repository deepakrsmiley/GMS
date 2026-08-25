export const HOSPITAL_MODULES = [
  { id: 'patients', label: 'Patient Registration', description: 'UHID and patient master' },
  { id: 'op', label: 'Outpatient (OP)', description: 'OP registration, doctor queue, TV display' },
  { id: 'appointments', label: 'Appointments', description: 'Appointment booking' },
  { id: 'ip', label: 'Inpatient (IP)', description: 'Admissions, nurse station, rooms & beds' },
  { id: 'billing', label: 'Billing', description: 'Invoices and collections' },
  { id: 'pharmacy', label: 'Pharmacy', description: 'Stock, prescriptions, pharmacy reports' },
  { id: 'lab', label: 'Laboratory', description: 'Lab orders, reports, test master' },
  { id: 'biomedical', label: 'Biomedical & Assets', description: 'BEMS, assets, complaints' },
  { id: 'reports', label: 'Audit Reports', description: 'Hospital audit reports' },
  { id: 'changeRequests', label: 'Change Requests', description: 'Edit / approval workflow' },
];

export const ALL_MODULE_IDS = HOSPITAL_MODULES.map((m) => m.id);

export const ROUTE_TO_MODULE = {
  patients: 'patients',
  'op-queue': 'op',
  consultation: 'op',
  'queue-display': 'op',
  appointments: 'appointments',
  'ip-admissions': 'ip',
  'nurse-station': 'ip',
  beds: 'ip',
  billing: 'billing',
  'pharmacy-billing': 'billing',
  pharmacy: 'pharmacy',
  'pharmacy-reports': 'pharmacy',
  'expiry-report': 'pharmacy',
  lab: 'lab',
  biomedical: 'biomedical',
  assets: 'biomedical',
  'asset-complaints': 'biomedical',
  reports: 'reports',
  'change-requests': 'changeRequests',
};

export const resolveEnabledModules = (organization) => {
  const list = organization?.enabledModules;
  if (!Array.isArray(list)) return ALL_MODULE_IDS;
  return list;
};

export const isHospitalModuleEnabled = (organization, moduleId) => {
  if (!moduleId) return true;
  return resolveEnabledModules(organization).includes(moduleId);
};

export const isHospitalModuleEnabledForUser = (user, moduleId) =>
  isHospitalModuleEnabled(user?.organization, moduleId);
