const permissions = {
  'Super Admin': ['*'],
  'Admin': [
    'VIEW_DASHBOARD',
    'VIEW_PATIENT',
    'CREATE_PATIENT',
    'UPDATE_PATIENT',
    'VIEW_APPOINTMENT',
    'VIEW_BILLING',
    'VIEW_PHARMACY',
    'VIEW_LAB',
    'VIEW_IP_ADMISSION',
    'VIEW_REPORTS',
    'VIEW_ASSETS',
    'MANAGE_ASSETS',
    'VIEW_ASSET_COMPLAINTS',
    'MANAGE_ASSET_COMPLAINTS',
    'MANAGE_DEPARTMENTS',
  ],
  'Doctor': [
    'VIEW_DASHBOARD',
    'VIEW_PATIENT',
    'CREATE_CONSULTATION',
    'CREATE_PRESCRIPTION',
    'VIEW_PRESCRIPTION',
    'VIEW_OP_QUEUE',
    'VIEW_LAB',
    'CREATE_LAB_ORDER',
    'VIEW_IP_ADMISSION',
    'CREATE_DISCHARGE_SUMMARY',
    'CREATE_SERVICE_USAGE',
  ],
  'Receptionist': [
    'VIEW_DASHBOARD',
    'CREATE_PATIENT',
    'VIEW_PATIENT',
    'UPDATE_PATIENT',
    'CREATE_APPOINTMENT',
    'VIEW_APPOINTMENT',
    'VIEW_OP_QUEUE',
    'CREATE_OP_QUEUE',
    'VIEW_IP_ADMISSION',
    'CREATE_IP_ADMISSION',
    'PROCESS_DISCHARGE',
    'CREATE_CONSULTATION',
    'CREATE_PRESCRIPTION',
    'VIEW_PRESCRIPTION',
  ],
  'Pharmacist': [
    'VIEW_DASHBOARD',
    'VIEW_PRESCRIPTION',
    'DISPENSE_PRESCRIPTION',
    'VIEW_PHARMACY',
    'MANAGE_PHARMACY',
    'VIEW_BILLING',
    'CREATE_BILLING',
    'PAY_BILL',
  ],
  'Lab Technician': [
    'VIEW_DASHBOARD',
    'VIEW_LAB',
    'UPDATE_LAB_REPORT',
    'PRINT_LAB_REPORT',
  ],
  'Accountant': [
    'VIEW_DASHBOARD',
    'VIEW_BILLING',
    'CREATE_BILLING',
    'UPDATE_BILLING',
    'PAY_BILL',
  ],
  'Nurse': [
    'VIEW_DASHBOARD',
    'VIEW_PATIENT',
    'VIEW_IP_ADMISSION',
    'CREATE_NURSING_NOTE',
    'CREATE_SERVICE_USAGE',
  ],
  'Patient': [
    'VIEW_DASHBOARD',
    'VIEW_OWN_APPOINTMENTS',
    'VIEW_OWN_PRESCRIPTIONS',
    'VIEW_OWN_LAB_REPORTS',
    'VIEW_OWN_BILLS',
  ],
};

/**
 * Full catalog of every permission code that exists in the system, grouped
 * by feature module purely for display purposes in the Super Admin UI.
 * Keep this in sync with frontend/src/constants/permissions.js.
 */
const PERMISSION_GROUPS = {
  Dashboard: ['VIEW_DASHBOARD'],
  Patients: ['VIEW_PATIENT', 'CREATE_PATIENT', 'UPDATE_PATIENT'],
  'OP / Appointments': ['VIEW_OP_QUEUE', 'CREATE_OP_QUEUE', 'VIEW_APPOINTMENT', 'CREATE_APPOINTMENT'],
  Consultation: ['CREATE_CONSULTATION', 'CREATE_PRESCRIPTION', 'VIEW_PRESCRIPTION', 'DISPENSE_PRESCRIPTION'],
  'IP Admission': [
    'VIEW_IP_ADMISSION',
    'CREATE_IP_ADMISSION',
    'PROCESS_DISCHARGE',
    'CREATE_DISCHARGE_SUMMARY',
    'CREATE_NURSING_NOTE',
    'CREATE_SERVICE_USAGE',
  ],
  Billing: ['VIEW_BILLING', 'CREATE_BILLING', 'UPDATE_BILLING', 'PAY_BILL'],
  Pharmacy: ['VIEW_PHARMACY', 'MANAGE_PHARMACY'],
  Lab: ['VIEW_LAB', 'CREATE_LAB_ORDER', 'UPDATE_LAB_REPORT', 'PRINT_LAB_REPORT'],
  'Beds & Wards': ['VIEW_BEDS', 'MANAGE_BEDS'],
  Departments: ['MANAGE_DEPARTMENTS'],
  Assets: ['VIEW_ASSETS', 'MANAGE_ASSETS', 'VIEW_ASSET_COMPLAINTS', 'MANAGE_ASSET_COMPLAINTS'],
  Staff: ['VIEW_STAFF', 'MANAGE_STAFF'],
  'Reports & Settings': ['VIEW_REPORTS', 'MANAGE_SETTINGS'],
  'Patient Self-Service': [
    'VIEW_OWN_APPOINTMENTS',
    'VIEW_OWN_PRESCRIPTIONS',
    'VIEW_OWN_LAB_REPORTS',
    'VIEW_OWN_BILLS',
  ],
};

const ALL_PERMISSIONS = Object.values(PERMISSION_GROUPS).flat();

/** Keep only recognized permission codes (or the '*' wildcard) coming from a request body. */
const sanitizePermissions = (input) => {
  if (!Array.isArray(input)) return undefined;
  const cleaned = input.filter((p) => p === '*' || ALL_PERMISSIONS.includes(p));
  return [...new Set(cleaned)];
};

module.exports = permissions;
module.exports.PERMISSION_GROUPS = PERMISSION_GROUPS;
module.exports.ALL_PERMISSIONS = ALL_PERMISSIONS;
module.exports.sanitizePermissions = sanitizePermissions;