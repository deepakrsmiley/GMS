import { normalizeRole } from '../utils/roles';

/**
 * Full catalog of every permission code in the system, grouped by feature
 * module. This drives the "Manage Permissions" checklist Super Admin sees
 * on the Staff page, and must stay in sync with backend/config/permissions.js.
 */
export const PERMISSION_GROUPS = [
  {
    module: 'Dashboard',
    permissions: [{ code: 'VIEW_DASHBOARD', label: 'View Dashboard' }],
  },
  {
    module: 'Patients',
    permissions: [
      { code: 'VIEW_PATIENT', label: 'View Patients' },
      { code: 'CREATE_PATIENT', label: 'Register Patient' },
      { code: 'UPDATE_PATIENT', label: 'Edit Patient' },
    ],
  },
  {
    module: 'OP / Appointments',
    permissions: [
      { code: 'VIEW_OP_QUEUE', label: 'View OP Queue' },
      { code: 'CREATE_OP_QUEUE', label: 'Add to OP Queue' },
      { code: 'VIEW_APPOINTMENT', label: 'View Appointments' },
      { code: 'CREATE_APPOINTMENT', label: 'Create Appointment' },
    ],
  },
  {
    module: 'Consultation',
    permissions: [
      { code: 'CREATE_CONSULTATION', label: 'Start Consultation' },
      { code: 'CREATE_PRESCRIPTION', label: 'Create Prescription' },
      { code: 'VIEW_PRESCRIPTION', label: 'View Prescriptions' },
      { code: 'DISPENSE_PRESCRIPTION', label: 'Dispense Prescription' },
    ],
  },
  {
    module: 'IP Admission',
    permissions: [
      { code: 'VIEW_IP_ADMISSION', label: 'View IP Admissions' },
      { code: 'CREATE_IP_ADMISSION', label: 'Admit Patient' },
      { code: 'PROCESS_DISCHARGE', label: 'Process Discharge' },
      { code: 'CREATE_DISCHARGE_SUMMARY', label: 'Discharge Summary' },
      { code: 'CREATE_NURSING_NOTE', label: 'Add Nursing Notes' },
    ],
  },
  {
    module: 'Billing',
    permissions: [
      { code: 'VIEW_BILLING', label: 'View Billing' },
      { code: 'CREATE_BILLING', label: 'Create Bill' },
      { code: 'UPDATE_BILLING', label: 'Edit Bill' },
      { code: 'PAY_BILL', label: 'Collect Payment' },
    ],
  },
  {
    module: 'Pharmacy',
    permissions: [
      { code: 'VIEW_PHARMACY', label: 'View Pharmacy' },
      { code: 'MANAGE_PHARMACY', label: 'Manage Inventory' },
    ],
  },
  {
    module: 'Lab',
    permissions: [
      { code: 'VIEW_LAB', label: 'View Lab' },
      { code: 'CREATE_LAB_ORDER', label: 'Create Lab Order' },
      { code: 'UPDATE_LAB_REPORT', label: 'Update Lab Report' },
      { code: 'PRINT_LAB_REPORT', label: 'Print Lab Report' },
    ],
  },
  {
    module: 'Beds & Wards',
    permissions: [
      { code: 'VIEW_BEDS', label: 'View Beds' },
      { code: 'MANAGE_BEDS', label: 'Manage Beds' },
    ],
  },
  {
    module: 'Departments',
    permissions: [{ code: 'MANAGE_DEPARTMENTS', label: 'Manage Departments' }],
  },
  {
    module: 'Assets',
    permissions: [
      { code: 'VIEW_ASSETS', label: 'View Assets' },
      { code: 'MANAGE_ASSETS', label: 'Manage Assets' },
      { code: 'VIEW_ASSET_COMPLAINTS', label: 'View Complaints' },
      { code: 'MANAGE_ASSET_COMPLAINTS', label: 'Manage Complaints' },
    ],
  },
  {
    module: 'Staff',
    permissions: [
      { code: 'VIEW_STAFF', label: 'View Staff' },
      { code: 'MANAGE_STAFF', label: 'Manage Staff & Permissions' },
    ],
  },
  {
    module: 'Reports & Settings',
    permissions: [
      { code: 'VIEW_REPORTS', label: 'View Reports' },
      { code: 'MANAGE_SETTINGS', label: 'Manage Settings' },
    ],
  },
  {
    module: 'Patient Self-Service',
    permissions: [
      { code: 'VIEW_OWN_APPOINTMENTS', label: 'View Own Appointments' },
      { code: 'VIEW_OWN_PRESCRIPTIONS', label: 'View Own Prescriptions' },
      { code: 'VIEW_OWN_LAB_REPORTS', label: 'View Own Lab Reports' },
      { code: 'VIEW_OWN_BILLS', label: 'View Own Bills' },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.code));

/** Default permission set for each role — used to pre-fill the checklist and as a fallback. */
export const ROLE_PERMISSIONS = {
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
    'MANAGE_ASSETS',
    'VIEW_ASSETS',
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
    'VIEW_ASSET_COMPLAINTS',
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
    'VIEW_BILLING',
    'CREATE_BILLING',
    'PAY_BILL',
    'CREATE_CONSULTATION',
    'CREATE_PRESCRIPTION',
    'VIEW_PRESCRIPTION',
    'VIEW_ASSET_COMPLAINTS',
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
    'VIEW_ASSET_COMPLAINTS',
  ],
  'Lab Technician': [
    'VIEW_DASHBOARD',
    'VIEW_LAB',
    'UPDATE_LAB_REPORT',
    'PRINT_LAB_REPORT',
    'VIEW_ASSET_COMPLAINTS',
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
    'VIEW_ASSET_COMPLAINTS',
  ],
  'Patient': [
    'VIEW_DASHBOARD',
    'VIEW_OWN_APPOINTMENTS',
    'VIEW_OWN_PRESCRIPTIONS',
    'VIEW_OWN_LAB_REPORTS',
    'VIEW_OWN_BILLS',
  ],
};

/** Returns the default permission codes for a role (used to pre-fill the checklist for a new user). */
export const getDefaultPermissionsForRole = (role) => {
  if (normalizeRole(role) === 'Super Admin') return ['*'];
  return [...(ROLE_PERMISSIONS[role] || [])];
};

/**
 * Checks whether a user can access a given permission code.
 * `user` should be `{ role, permissions }`. If the user has a custom
 * `permissions` array assigned (by Super Admin), that array is the source
 * of truth. Otherwise it falls back to the role's default permission set.
 */
export const hasPermission = (user, code) => {
  if (!user) return false;
  const role = normalizeRole(user.role);
  if (role === 'Super Admin') return true;

  const custom = Array.isArray(user.permissions) && user.permissions.length > 0 ? user.permissions : null;
  const perms = custom || ROLE_PERMISSIONS[role] || [];

  return perms.includes('*') || perms.includes(code);
};

export default ROLE_PERMISSIONS;
