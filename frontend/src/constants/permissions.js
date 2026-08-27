import { normalizeRole } from '../utils/roles';

/**
 * Full catalog of every permission code in the system, grouped by feature
 * module. This drives the "Feature permissions" checklist Super Admin sees
 * on Staff → Users & Access. Keep in sync with backend/config/permissions.js.
 */
export const PERMISSION_GROUPS = [
  {
    module: 'Dashboard',
    permissions: [
      { code: 'VIEW_DASHBOARD', label: 'View Dashboard' },
    ],
  },
  {
    module: 'Patients',
    permissions: [
      { code: 'VIEW_PATIENT', label: 'View patients' },
      { code: 'CREATE_PATIENT', label: 'Register / create patient' },
      { code: 'UPDATE_PATIENT', label: 'Edit / update patient' },
      { code: 'DELETE_PATIENT', label: 'Delete patient' },
      { code: 'VIEW_PATIENT_PROFILE', label: 'View patient clinical profile' },
      { code: 'UPDATE_PATIENT_PROFILE', label: 'Edit patient clinical profile' },
    ],
  },
  {
    module: 'OP / Appointments',
    permissions: [
      { code: 'VIEW_OP_QUEUE', label: 'View OP / doctor queue' },
      { code: 'CREATE_OP_QUEUE', label: 'OP registration / add to queue' },
      { code: 'UPDATE_OP_QUEUE', label: 'Update OP visit / status' },
      { code: 'VIEW_APPOINTMENT', label: 'View appointments' },
      { code: 'CREATE_APPOINTMENT', label: 'Create appointment' },
      { code: 'UPDATE_APPOINTMENT', label: 'Edit appointment' },
      { code: 'CANCEL_APPOINTMENT', label: 'Cancel appointment' },
      { code: 'VIEW_QUEUE_DISPLAY', label: 'TV queue display' },
    ],
  },
  {
    module: 'Consultation',
    permissions: [
      { code: 'CREATE_CONSULTATION', label: 'Start / save consultation' },
      { code: 'UPDATE_CONSULTATION', label: 'Edit consultation notes' },
      { code: 'CREATE_PRESCRIPTION', label: 'Create prescription' },
      { code: 'VIEW_PRESCRIPTION', label: 'View prescriptions' },
      { code: 'DISPENSE_PRESCRIPTION', label: 'Dispense / counter sale' },
      { code: 'CREATE_SERVICE_USAGE', label: 'Log OP/IP procedures & machines' },
    ],
  },
  {
    module: 'IP Admission',
    permissions: [
      { code: 'VIEW_IP_ADMISSION', label: 'View IP admissions' },
      { code: 'CREATE_IP_ADMISSION', label: 'Admit patient (IP)' },
      { code: 'UPDATE_IP_ADMISSION', label: 'Edit IP admission' },
      { code: 'PROCESS_DISCHARGE', label: 'Process discharge' },
      { code: 'CREATE_DISCHARGE_SUMMARY', label: 'Discharge summary' },
      { code: 'CREATE_NURSING_NOTE', label: 'Add nursing notes' },
      { code: 'CREATE_DOCTOR_ROUND', label: 'Add doctor rounds' },
      { code: 'MANAGE_IP_MEDICATION', label: 'IP medications' },
      { code: 'VIEW_NURSE_STATION', label: 'Nurse Station (board, vitals, medicines, notes, lab)' },
      { code: 'RECORD_VITALS', label: 'Record patient vitals' },
      { code: 'SHIFT_HANDOVER', label: 'Shift handover notes' },
      { code: 'MANAGE_DOCTOR_ORDERS', label: 'Doctor orders / treatment sheet' },
    ],
  },
  {
    module: 'Billing',
    permissions: [
      { code: 'VIEW_BILLING', label: 'View billing / invoices' },
      { code: 'CREATE_BILLING', label: 'Create bill' },
      { code: 'UPDATE_BILLING', label: 'Edit / update bill' },
      { code: 'PAY_BILL', label: 'Collect payment' },
      { code: 'CANCEL_BILL', label: 'Cancel bill' },
      { code: 'VIEW_BILLING_REPORTS', label: 'Billing / pharmacy reports' },
      { code: 'VIEW_PENDING_DISCHARGE', label: 'Pending discharge billing' },
    ],
  },
  {
    module: 'Pharmacy',
    permissions: [
      { code: 'VIEW_PHARMACY', label: 'View pharmacy' },
      { code: 'MANAGE_PHARMACY', label: 'Full inventory control (ticks all edit / stock options below)' },
      { code: 'CREATE_MEDICINE', label: 'Add medicine' },
      { code: 'EDIT_MEDICINE', label: 'Edit medicine (direct — lock to force change request)' },
      { code: 'ADD_PHARMACY_STOCK', label: 'Add stock / batch' },
      { code: 'ADJUST_PHARMACY_STOCK', label: 'Adjust stock' },
      { code: 'EDIT_PHARMACY_BATCH', label: 'Edit batch (expiry, price, qty)' },
      { code: 'DELETE_MEDICINE', label: 'Delete medicine' },
      { code: 'MANAGE_SUPPLIERS', label: 'Manage suppliers' },
      { code: 'VIEW_EXPIRY_REPORT', label: 'Medicine expiry report' },
    ],
  },
  {
    module: 'Lab',
    permissions: [
      { code: 'VIEW_LAB', label: 'View lab orders / reports' },
      { code: 'CREATE_LAB_ORDER', label: 'Create lab order' },
      { code: 'UPDATE_LAB_ORDER', label: 'Update lab order status' },
      { code: 'UPDATE_LAB_REPORT', label: 'Enter / update lab results' },
      { code: 'PRINT_LAB_REPORT', label: 'Print lab report' },
      { code: 'MANAGE_LAB_TESTS', label: 'Manage lab test master / prices' },
    ],
  },
  {
    module: 'Beds, Rooms & Wards',
    permissions: [
      { code: 'VIEW_BEDS', label: 'View beds' },
      { code: 'MANAGE_BEDS', label: 'Full beds manage (all below)' },
      { code: 'CREATE_BED', label: 'Add bed' },
      { code: 'UPDATE_BED', label: 'Edit bed' },
      { code: 'DELETE_BED', label: 'Delete bed' },
      { code: 'UPDATE_BED_STATUS', label: 'Change bed status' },
      { code: 'MANAGE_ROOMS', label: 'Manage rooms' },
      { code: 'MANAGE_WARDS', label: 'Manage wards' },
    ],
  },
  {
    module: 'Departments',
    permissions: [
      { code: 'VIEW_DEPARTMENTS', label: 'View departments' },
      { code: 'MANAGE_DEPARTMENTS', label: 'Create / edit / delete departments' },
    ],
  },
  {
    module: 'Assets & Complaints',
    permissions: [
      { code: 'VIEW_ASSETS', label: 'View assets' },
      { code: 'MANAGE_ASSETS', label: 'Full assets manage (all below)' },
      { code: 'CREATE_ASSET', label: 'Add asset' },
      { code: 'UPDATE_ASSET', label: 'Edit asset' },
      { code: 'DELETE_ASSET', label: 'Decommission / delete asset' },
      { code: 'VIEW_ASSET_COMPLAINTS', label: 'View complaints' },
      { code: 'CREATE_ASSET_COMPLAINT', label: 'Raise complaint' },
      { code: 'UPDATE_ASSET_COMPLAINT', label: 'Update complaint status' },
      { code: 'MANAGE_ASSET_COMPLAINTS', label: 'Full complaints manage' },
    ],
  },
  {
    module: 'Biomedical Engineering',
    permissions: [
      { code: 'VIEW_BEMS', label: 'View biomedical module' },
      { code: 'MANAGE_BEMS', label: 'Manage PM, calibration, work orders, spares, AMC' },
      { code: 'VIEW_BEMS_REPORTS', label: 'Biomedical reports' },
    ],
  },
  {
    module: 'Staff & Access',
    permissions: [
      { code: 'VIEW_STAFF', label: 'View staff list' },
      { code: 'CREATE_STAFF', label: 'Create staff user' },
      { code: 'UPDATE_STAFF', label: 'Edit staff user' },
      { code: 'DELETE_STAFF', label: 'Delete / deactivate staff' },
      { code: 'MANAGE_STAFF', label: 'Full staff & permissions manage' },
    ],
  },
  {
    module: 'Reports & Activity',
    permissions: [
      { code: 'VIEW_REPORTS', label: 'View audit / management reports' },
      { code: 'VIEW_ACTIVITY', label: 'View activity feed' },
      { code: 'EXPORT_REPORTS', label: 'Export reports' },
    ],
  },
  {
    module: 'Change Requests',
    permissions: [
      { code: 'CREATE_CHANGE_REQUEST', label: 'Raise change / edit request' },
      { code: 'VIEW_CHANGE_REQUESTS', label: 'View own change requests' },
      { code: 'REVIEW_CHANGE_REQUESTS', label: 'Approve / reject change requests' },
    ],
  },
  {
    module: 'Settings & Masters',
    permissions: [
      { code: 'MANAGE_MASTERS', label: 'Access Masters hub' },
      { code: 'MANAGE_SETTINGS', label: 'Manage hospital settings' },
      { code: 'MANAGE_BRANDING', label: 'Hospital branding' },
      { code: 'MANAGE_SERVICES', label: 'Services & rate master' },
    ],
  },
  {
    module: 'Chat & Notifications',
    permissions: [
      { code: 'VIEW_CHAT', label: 'Hospital chat' },
      { code: 'VIEW_NOTIFICATIONS', label: 'Notifications inbox' },
    ],
  },
  {
    module: 'Patient Self-Service',
    permissions: [
      { code: 'VIEW_OWN_APPOINTMENTS', label: 'View own appointments' },
      { code: 'VIEW_OWN_PRESCRIPTIONS', label: 'View own prescriptions' },
      { code: 'VIEW_OWN_LAB_REPORTS', label: 'View own lab reports' },
      { code: 'VIEW_OWN_BILLS', label: 'View own bills' },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.code));

/** Default permission set for each role — used to pre-fill the checklist and as a fallback. */
export const ROLE_PERMISSIONS = {
  'Super Admin': ['*'],
  'Admin': [
    'VIEW_DASHBOARD',
    'VIEW_PATIENT', 'CREATE_PATIENT', 'UPDATE_PATIENT', 'VIEW_PATIENT_PROFILE', 'UPDATE_PATIENT_PROFILE',
    'VIEW_OP_QUEUE', 'CREATE_OP_QUEUE', 'UPDATE_OP_QUEUE',
    'VIEW_APPOINTMENT', 'CREATE_APPOINTMENT', 'UPDATE_APPOINTMENT', 'CANCEL_APPOINTMENT', 'VIEW_QUEUE_DISPLAY',
    'CREATE_CONSULTATION', 'VIEW_PRESCRIPTION', 'CREATE_SERVICE_USAGE',
    'VIEW_IP_ADMISSION', 'CREATE_IP_ADMISSION', 'UPDATE_IP_ADMISSION', 'PROCESS_DISCHARGE',
    'VIEW_NURSE_STATION', 'RECORD_VITALS', 'SHIFT_HANDOVER', 'MANAGE_DOCTOR_ORDERS',
    'VIEW_BILLING', 'CREATE_BILLING', 'UPDATE_BILLING', 'PAY_BILL', 'CANCEL_BILL', 'VIEW_BILLING_REPORTS', 'VIEW_PENDING_DISCHARGE',
    'VIEW_PHARMACY', 'MANAGE_PHARMACY', 'CREATE_MEDICINE', 'EDIT_MEDICINE', 'ADD_PHARMACY_STOCK',
    'ADJUST_PHARMACY_STOCK', 'EDIT_PHARMACY_BATCH', 'DELETE_MEDICINE', 'MANAGE_SUPPLIERS', 'VIEW_EXPIRY_REPORT', 'DISPENSE_PRESCRIPTION',
    'VIEW_LAB', 'CREATE_LAB_ORDER', 'UPDATE_LAB_ORDER', 'UPDATE_LAB_REPORT', 'PRINT_LAB_REPORT', 'MANAGE_LAB_TESTS',
    'VIEW_BEDS', 'MANAGE_BEDS', 'CREATE_BED', 'UPDATE_BED', 'DELETE_BED', 'UPDATE_BED_STATUS', 'MANAGE_ROOMS', 'MANAGE_WARDS',
    'VIEW_DEPARTMENTS', 'MANAGE_DEPARTMENTS',
    'VIEW_ASSETS', 'MANAGE_ASSETS', 'CREATE_ASSET', 'UPDATE_ASSET', 'DELETE_ASSET',
    'VIEW_ASSET_COMPLAINTS', 'CREATE_ASSET_COMPLAINT', 'UPDATE_ASSET_COMPLAINT', 'MANAGE_ASSET_COMPLAINTS',
    'VIEW_BEMS', 'MANAGE_BEMS', 'VIEW_BEMS_REPORTS',
    'VIEW_STAFF', 'CREATE_STAFF', 'UPDATE_STAFF', 'MANAGE_STAFF',
    'VIEW_REPORTS', 'VIEW_ACTIVITY', 'EXPORT_REPORTS',
    'MANAGE_MASTERS', 'MANAGE_SETTINGS', 'MANAGE_BRANDING', 'MANAGE_SERVICES',
    'CREATE_CHANGE_REQUEST', 'VIEW_CHANGE_REQUESTS', 'REVIEW_CHANGE_REQUESTS',
    'VIEW_CHAT', 'VIEW_NOTIFICATIONS',
  ],
  'Doctor': [
    'VIEW_DASHBOARD',
    'VIEW_PATIENT', 'VIEW_PATIENT_PROFILE', 'UPDATE_PATIENT_PROFILE',
    'VIEW_OP_QUEUE', 'CREATE_CONSULTATION', 'UPDATE_CONSULTATION',
    'CREATE_PRESCRIPTION', 'VIEW_PRESCRIPTION', 'CREATE_SERVICE_USAGE',
    'VIEW_LAB', 'CREATE_LAB_ORDER',
    'VIEW_IP_ADMISSION', 'UPDATE_IP_ADMISSION', 'CREATE_DISCHARGE_SUMMARY', 'CREATE_DOCTOR_ROUND', 'MANAGE_IP_MEDICATION',
    'VIEW_NURSE_STATION', 'MANAGE_DOCTOR_ORDERS',
    'VIEW_ASSET_COMPLAINTS', 'CREATE_ASSET_COMPLAINT',
    'CREATE_CHANGE_REQUEST', 'VIEW_CHANGE_REQUESTS',
    'VIEW_CHAT', 'VIEW_NOTIFICATIONS',
  ],
  'Receptionist': [
    'VIEW_DASHBOARD',
    'VIEW_PATIENT', 'CREATE_PATIENT', 'UPDATE_PATIENT', 'VIEW_PATIENT_PROFILE',
    'VIEW_OP_QUEUE', 'CREATE_OP_QUEUE', 'UPDATE_OP_QUEUE', 'VIEW_QUEUE_DISPLAY',
    'VIEW_APPOINTMENT', 'CREATE_APPOINTMENT', 'UPDATE_APPOINTMENT', 'CANCEL_APPOINTMENT',
    'CREATE_CONSULTATION', 'CREATE_PRESCRIPTION', 'VIEW_PRESCRIPTION', 'CREATE_SERVICE_USAGE',
    'VIEW_IP_ADMISSION', 'CREATE_IP_ADMISSION', 'PROCESS_DISCHARGE',
    'VIEW_BILLING', 'CREATE_BILLING', 'UPDATE_BILLING', 'PAY_BILL', 'VIEW_PENDING_DISCHARGE',
    'VIEW_PHARMACY', 'DISPENSE_PRESCRIPTION',
    'VIEW_LAB', 'CREATE_LAB_ORDER',
    'VIEW_ASSET_COMPLAINTS', 'CREATE_ASSET_COMPLAINT',
    'CREATE_CHANGE_REQUEST', 'VIEW_CHANGE_REQUESTS',
    'VIEW_CHAT', 'VIEW_NOTIFICATIONS',
  ],
  'Pharmacist': [
    'VIEW_DASHBOARD',
    'VIEW_PATIENT',
    'VIEW_PRESCRIPTION', 'DISPENSE_PRESCRIPTION',
    'VIEW_PHARMACY', 'MANAGE_PHARMACY', 'CREATE_MEDICINE', 'EDIT_MEDICINE',
    'ADD_PHARMACY_STOCK', 'ADJUST_PHARMACY_STOCK', 'EDIT_PHARMACY_BATCH', 'MANAGE_SUPPLIERS', 'VIEW_EXPIRY_REPORT',
    'VIEW_BILLING', 'CREATE_BILLING', 'UPDATE_BILLING', 'PAY_BILL', 'VIEW_BILLING_REPORTS',
    'VIEW_LAB',
    'VIEW_IP_ADMISSION',
    'VIEW_ASSET_COMPLAINTS', 'CREATE_ASSET_COMPLAINT',
    'CREATE_CHANGE_REQUEST', 'VIEW_CHANGE_REQUESTS',
    'VIEW_CHAT', 'VIEW_NOTIFICATIONS',
  ],
  'Lab Technician': [
    'VIEW_DASHBOARD',
    'VIEW_PATIENT',
    'VIEW_LAB', 'CREATE_LAB_ORDER', 'UPDATE_LAB_ORDER', 'UPDATE_LAB_REPORT', 'PRINT_LAB_REPORT', 'MANAGE_LAB_TESTS',
    'VIEW_ASSET_COMPLAINTS', 'CREATE_ASSET_COMPLAINT',
    'CREATE_CHANGE_REQUEST', 'VIEW_CHANGE_REQUESTS',
    'VIEW_CHAT', 'VIEW_NOTIFICATIONS',
  ],
  'Accountant': [
    'VIEW_DASHBOARD',
    'VIEW_PATIENT',
    'VIEW_BILLING', 'CREATE_BILLING', 'UPDATE_BILLING', 'PAY_BILL', 'CANCEL_BILL',
    'VIEW_BILLING_REPORTS', 'VIEW_PENDING_DISCHARGE', 'VIEW_REPORTS',
    'CREATE_CHANGE_REQUEST', 'VIEW_CHANGE_REQUESTS',
    'VIEW_CHAT', 'VIEW_NOTIFICATIONS',
  ],
  'Nurse': [
    'VIEW_DASHBOARD',
    'VIEW_PATIENT', 'VIEW_PATIENT_PROFILE',
    'VIEW_IP_ADMISSION', 'CREATE_NURSING_NOTE', 'CREATE_SERVICE_USAGE', 'MANAGE_IP_MEDICATION',
    'VIEW_NURSE_STATION', 'RECORD_VITALS', 'SHIFT_HANDOVER', 'MANAGE_DOCTOR_ORDERS',
    'UPDATE_BED_STATUS', 'VIEW_BEDS',
    'VIEW_LAB', 'CREATE_LAB_ORDER',
    'VIEW_ASSET_COMPLAINTS', 'CREATE_ASSET_COMPLAINT',
    'CREATE_CHANGE_REQUEST', 'VIEW_CHANGE_REQUESTS',
    'VIEW_CHAT', 'VIEW_NOTIFICATIONS',
  ],
  'Patient': [
    'VIEW_DASHBOARD',
    'VIEW_OWN_APPOINTMENTS',
    'VIEW_OWN_PRESCRIPTIONS',
    'VIEW_OWN_LAB_REPORTS',
    'VIEW_OWN_BILLS',
  ],
  'Biomedical Engineer': [
    'VIEW_DASHBOARD',
    'VIEW_BEMS', 'MANAGE_BEMS', 'VIEW_BEMS_REPORTS',
    'VIEW_ASSETS', 'MANAGE_ASSETS', 'CREATE_ASSET', 'UPDATE_ASSET', 'DELETE_ASSET',
    'VIEW_ASSET_COMPLAINTS', 'CREATE_ASSET_COMPLAINT', 'UPDATE_ASSET_COMPLAINT', 'MANAGE_ASSET_COMPLAINTS',
    'VIEW_ACTIVITY',
    'CREATE_CHANGE_REQUEST', 'VIEW_CHANGE_REQUESTS',
    'VIEW_CHAT', 'VIEW_NOTIFICATIONS',
  ],
};

/** Returns the default permission codes for a role (used to pre-fill the checklist for a new user). */
export const getDefaultPermissionsForRole = (role) => {
  if (normalizeRole(role) === 'Super Admin') return ['*'];
  return [...(ROLE_PERMISSIONS[role] || [])];
};

/**
 * Granting a module (e.g. Nurse Station) also unlocks the supporting
 * actions that module needs, so Super Admin ticks work without 403s.
 */
export const IMPLIED_PERMISSIONS = {
  VIEW_NURSE_STATION: [
    'VIEW_IP_ADMISSION',
    'VIEW_PATIENT',
    'VIEW_PATIENT_PROFILE',
    'RECORD_VITALS',
    'CREATE_NURSING_NOTE',
    'SHIFT_HANDOVER',
    'MANAGE_IP_MEDICATION',
    'MANAGE_DOCTOR_ORDERS',
    'CREATE_SERVICE_USAGE',
    'CREATE_LAB_ORDER',
    'VIEW_LAB',
    'VIEW_PATIENT',
    'VIEW_BEDS',
  ],
  VIEW_IP_ADMISSION: ['VIEW_PATIENT'],
  VIEW_BILLING: ['VIEW_PATIENT'],
  VIEW_PENDING_DISCHARGE: ['VIEW_BILLING', 'VIEW_PATIENT'],
  VIEW_PHARMACY: ['VIEW_PATIENT'],
  MANAGE_PHARMACY: ['VIEW_PHARMACY', 'VIEW_PATIENT'],
  VIEW_PRESCRIPTION: ['VIEW_PATIENT'],
  DISPENSE_PRESCRIPTION: ['VIEW_PATIENT', 'VIEW_PRESCRIPTION'],
  VIEW_APPOINTMENT: ['VIEW_PATIENT'],
  VIEW_OP_QUEUE: ['VIEW_PATIENT'],
  CREATE_OP_QUEUE: ['VIEW_PATIENT'],
  CREATE_CONSULTATION: ['VIEW_PATIENT'],
  CREATE_LAB_ORDER: ['VIEW_LAB', 'VIEW_PATIENT'],
  MANAGE_IP_MEDICATION: ['VIEW_IP_ADMISSION', 'VIEW_PATIENT'],
  UPDATE_BILLING: ['VIEW_BILLING'],
  CREATE_BILLING: ['VIEW_BILLING'],
  PAY_BILL: ['VIEW_BILLING'],
  MANAGE_STAFF: ['VIEW_STAFF', 'CREATE_STAFF', 'UPDATE_STAFF', 'DELETE_STAFF'],
  MANAGE_LAB_TESTS: ['VIEW_LAB'],
  MANAGE_BRANDING: ['MANAGE_SETTINGS'],
  CREATE_PRESCRIPTION: ['VIEW_PRESCRIPTION', 'VIEW_PATIENT', 'VIEW_PHARMACY'],
};

export const NURSE_STATION_BUNDLE = [
  'VIEW_NURSE_STATION',
  ...IMPLIED_PERMISSIONS.VIEW_NURSE_STATION,
];

export const expandEffectivePermissions = (perms) => {
  if (!Array.isArray(perms) || perms.length === 0) return [];
  if (perms.includes('*')) return ['*'];
  const set = new Set(perms);
  let changed = true;
  while (changed) {
    changed = false;
    for (const code of [...set]) {
      const extra = IMPLIED_PERMISSIONS[code];
      if (!extra) continue;
      extra.forEach((implied) => {
        if (!set.has(implied)) {
          set.add(implied);
          changed = true;
        }
      });
    }
  }
  return [...set];
};

export const looksLikeFullChecklist = (custom, rolePerms = []) =>
  custom.includes('VIEW_DASHBOARD') ||
  custom.length >= Math.max(10, Math.ceil((rolePerms.length || 10) * 0.5));

/**
 * Same merge rules as the backend: short extra grants union with the role;
 * a full Staff checklist (VIEW_DASHBOARD or a large list) is used as-is
 * so Super Admin unchecks stay locked.
 */
export const resolveEffectivePermissions = (role, stored) => {
  const roleKey = normalizeRole(role);
  if (roleKey === 'Super Admin') return ['*'];
  const rolePerms = ROLE_PERMISSIONS[roleKey] || ROLE_PERMISSIONS[role] || [];
  const custom = Array.isArray(stored) ? stored.filter(Boolean) : [];
  if (custom.includes('*')) return ['*'];
  if (!custom.length) return expandEffectivePermissions(rolePerms);

  const merged = looksLikeFullChecklist(custom, rolePerms)
    ? custom
    : [...new Set([...rolePerms, ...custom])];
  return expandEffectivePermissions(merged);
};

/**
 * Checks whether a user can access a given permission code.
 */
export const hasPermission = (user, code) => {
  if (!user) return false;
  const role = normalizeRole(user.role);
  if (role === 'Super Admin') return true;

  const perms = resolveEffectivePermissions(role, user.permissions);
  return perms.includes('*') || perms.includes(code);
};

export const hasAnyPermission = (user, codes = []) =>
  codes.some((code) => hasPermission(user, code));

/**
 * Pharmacy inventory actions controlled by Staff → Feature permissions.
 * Unchecking a specific box (e.g. EDIT_MEDICINE) must lock that action —
 * MANAGE_PHARMACY is only a Staff UI "select all" helper, not a runtime bypass.
 */
export const PHARMACY_FULL_CONTROL_PERMISSIONS = [
  'CREATE_MEDICINE',
  'EDIT_MEDICINE',
  'ADD_PHARMACY_STOCK',
  'ADJUST_PHARMACY_STOCK',
  'EDIT_PHARMACY_BATCH',
  'DELETE_MEDICINE',
  'MANAGE_SUPPLIERS',
  'VIEW_EXPIRY_REPORT',
];

export const hasPharmacyPermission = (user, code) => {
  if (!user) return false;
  return hasPermission(user, code);
};

/** Umbrella helpers for other modules (optional use in pages). */
export const hasBedsPermission = (user, code) =>
  hasPermission(user, 'MANAGE_BEDS') || hasPermission(user, code);

export const hasAssetsPermission = (user, code) =>
  hasPermission(user, 'MANAGE_ASSETS') || hasPermission(user, code);

export const hasStaffPermission = (user, code) =>
  hasPermission(user, 'MANAGE_STAFF') || hasPermission(user, code);

export default ROLE_PERMISSIONS;
