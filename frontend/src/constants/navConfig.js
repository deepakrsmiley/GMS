import { hasRole, normalizeRole } from '../utils/roles';

/**
 * Role-based navigation for the 6 main enterprise roles + Super Admin.
 * Each item also carries a `permission` code. When a user has a custom
 * `permissions` array assigned by Super Admin, that code is what actually
 * gates visibility/access — the `roles` array is only the fallback default.
 */
export const NAV_ITEMS = [
  { id: 'dashboard',        to: '/dashboard',               label: 'Dashboard',          icon: 'LayoutDashboard', permission: 'VIEW_DASHBOARD',        roles: ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Pharmacist', 'Lab Technician'] },
  { id: 'patients',         to: '/patients',                label: 'Patient Registration',icon: 'Users',          permission: 'VIEW_PATIENT',           roles: ['Super Admin', 'Admin', 'Receptionist'] },
  { id: 'op-reg',           to: '/op-queue',                label: 'OP Registration',    icon: 'Activity',        permission: 'CREATE_OP_QUEUE',        roles: ['Super Admin', 'Admin', 'Receptionist'] },
  { id: 'doctor-queue',     to: '/op-queue',                label: 'Doctor Queue',       icon: 'Stethoscope',     permission: 'VIEW_OP_QUEUE',          roles: ['Super Admin', 'Doctor', 'Receptionist'] },
  { id: 'appointments',     to: '/appointments',            label: 'Appointments',       icon: 'Calendar',        permission: 'VIEW_APPOINTMENT',       roles: ['Super Admin', 'Admin', 'Receptionist'] },
  { id: 'ip-patients',      to: '/ip-admissions',           label: 'IP Patients',        icon: 'Building2',       permission: 'VIEW_IP_ADMISSION',      roles: ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Pharmacist'] },
  { id: 'billing',          to: '/billing',                 label: 'Billing',            icon: 'Receipt',         permission: 'VIEW_BILLING',           roles: ['Super Admin', 'Admin', 'Pharmacist'] },
  { id: 'prescriptions',    to: '/pharmacy?tab=prescriptions', label: 'Prescriptions',  icon: 'ClipboardList',   permission: 'VIEW_PRESCRIPTION',      roles: ['Super Admin', 'Doctor', 'Pharmacist', 'Receptionist'] },
  { id: 'pharmacy',         to: '/pharmacy?tab=inventory',  label: 'Pharmacy',           icon: 'Pill',            permission: 'VIEW_PHARMACY',          roles: ['Super Admin', 'Admin', 'Pharmacist'] },

  // ── NEW: Pharmacy Billing Reports ──────────────────────────────────────────
  { id: 'pharmacy-billing', to: '/pharmacy-billing',        label: 'Pharmacy Reports',   icon: 'FileBarChart2',   permission: 'VIEW_BILLING',           roles: ['Super Admin', 'Admin', 'Pharmacist'] },

  // ── NEW: Medicine Expiry Report ──────────────────────────────────────────
  { id: 'expiry-report',    to: '/pharmacy/expiry-report',  label: 'Medicine Expiry Report', icon: 'AlertTriangle', permission: 'VIEW_PHARMACY',       roles: ['Super Admin', 'Admin', 'Pharmacist'] },

  { id: 'lab-orders',       to: '/lab',                     label: 'Lab Orders',         icon: 'FlaskConical',    permission: 'VIEW_LAB',               roles: ['Super Admin', 'Admin', 'Doctor', 'Lab Technician'] },
  { id: 'lab-reports',      to: '/lab?tab=reports',         label: 'Lab Reports',        icon: 'FileBarChart',    permission: 'VIEW_LAB',               roles: ['Super Admin', 'Admin', 'Lab Technician'] },
  { id: 'beds',             to: '/beds',                    label: 'Bed Management',     icon: 'Bed',             permission: 'MANAGE_BEDS',            roles: ['Super Admin'] },
  { id: 'departments',      to: '/departments',             label: 'Departments',        icon: 'Building2',       permission: 'MANAGE_DEPARTMENTS',     roles: ['Super Admin', 'Admin'] },
  { id: 'assets',           to: '/assets',                  label: 'Assets',             icon: 'Package',         permission: 'VIEW_ASSETS',            roles: ['Super Admin', 'Admin'] },
  { id: 'asset-complaints', to: '/asset-complaints',        label: 'Complaints',         icon: 'Activity',        permission: 'VIEW_ASSET_COMPLAINTS',  roles: ['Super Admin', 'Admin', 'Doctor', 'Nurse', 'Pharmacist', 'Lab Technician', 'Receptionist'] },
  { id: 'staff',            to: '/staff',                   label: 'User Management',    icon: 'UserCog',         permission: 'MANAGE_STAFF',           roles: ['Super Admin'] },
  { id: 'reports',          to: '/reports',                 label: 'Reports',            icon: 'BarChart3',       permission: 'VIEW_REPORTS',           roles: ['Super Admin', 'Admin'] },
  { id: 'queue-display',    to: '/queue-display',           label: 'TV Queue Display',   icon: 'MonitorPlay',     permission: 'VIEW_OP_QUEUE',          roles: ['Super Admin', 'Admin', 'Receptionist'] },
  { id: 'settings',         to: '/settings',               label: 'Settings',           icon: 'Settings',        permission: 'MANAGE_SETTINGS',        roles: ['Super Admin'] },
];

/** Route-level access for App.jsx ProtectedRoute (role-based fallback) */
export const ROUTE_ACCESS = {
  dashboard:         ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Pharmacist', 'Lab Technician'],
  patients:          ['Super Admin', 'Admin', 'Receptionist'],
  'op-queue':        ['Super Admin', 'Admin', 'Doctor', 'Receptionist'],
  consultation:      ['Super Admin', 'Doctor', 'Receptionist'],
  'ip-admissions':   ['Super Admin', 'Admin', 'Receptionist', 'Doctor', 'Pharmacist'],
  billing:           ['Super Admin', 'Admin', 'Pharmacist'],
  'pharmacy-billing':['Super Admin', 'Admin', 'Pharmacist'],   // ← NEW
  pharmacy:          ['Super Admin', 'Admin', 'Doctor', 'Pharmacist', 'Receptionist'],
  lab:               ['Super Admin', 'Admin', 'Doctor', 'Lab Technician'],
  beds:              ['Super Admin'],
  departments:       ['Super Admin', 'Admin'],
  assets:            ['Super Admin', 'Admin'],
  'asset-complaints':['Super Admin', 'Admin', 'Doctor', 'Nurse', 'Pharmacist', 'Lab Technician', 'Receptionist'],
  appointments:      ['Super Admin', 'Admin', 'Receptionist'],
  staff:             ['Super Admin'],
  reports:           ['Super Admin', 'Admin'],
  settings:          ['Super Admin'],
  'queue-display':   ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Pharmacist', 'Lab Technician', 'Nurse'],
};

/** Route segment -> permission code (used when a user has custom permissions assigned) */
export const ROUTE_PERMISSIONS = {
  dashboard: 'VIEW_DASHBOARD',
  patients: 'VIEW_PATIENT',
  'op-queue': 'VIEW_OP_QUEUE',
  consultation: 'CREATE_CONSULTATION',
  'ip-admissions': 'VIEW_IP_ADMISSION',
  billing: 'VIEW_BILLING',
  'pharmacy-billing': 'VIEW_BILLING',
  pharmacy: 'VIEW_PHARMACY',
  lab: 'VIEW_LAB',
  beds: 'MANAGE_BEDS',
  departments: 'MANAGE_DEPARTMENTS',
  assets: 'VIEW_ASSETS',
  'asset-complaints': 'VIEW_ASSET_COMPLAINTS',
  appointments: 'VIEW_APPOINTMENT',
  staff: 'MANAGE_STAFF',
  reports: 'VIEW_REPORTS',
  settings: 'MANAGE_SETTINGS',
  'queue-display': 'VIEW_OP_QUEUE',
};

/**
 * Checks whether a user can access a given route path.
 * Accepts either a full `user` object ({ role, permissions }) or, for
 * backward compatibility, a plain role string.
 */
export const canAccessRoute = (userOrRole, path) => {
  const user = typeof userOrRole === 'string' ? { role: userOrRole } : (userOrRole || {});
  const segment = path.split('/').filter(Boolean)[0] || 'dashboard';

  if (normalizeRole(user.role) === 'Super Admin') return true;

  const permCode = ROUTE_PERMISSIONS[segment];
  const customPermissions = Array.isArray(user.permissions) && user.permissions.length > 0 ? user.permissions : null;

  // A user with custom permissions assigned is gated purely by those permissions.
  if (customPermissions) {
    if (!permCode) return true;
    return customPermissions.includes('*') || customPermissions.includes(permCode);
  }

  // Otherwise fall back to the original role-based access list.
  const allowed = ROUTE_ACCESS[segment];
  if (!allowed) return true;
  return hasRole(user.role, allowed);
};

/** Filters the nav for a full user object, respecting custom per-user permissions when present. */
export const filterNavForUser = (user) => {
  if (!user) return [];
  if (normalizeRole(user.role) === 'Super Admin') return NAV_ITEMS;

  const customPermissions = Array.isArray(user.permissions) && user.permissions.length > 0 ? user.permissions : null;

  return NAV_ITEMS.filter((item) => {
    if (customPermissions) {
      return customPermissions.includes('*') || customPermissions.includes(item.permission);
    }
    return hasRole(user.role, item.roles);
  });
};

/** Legacy role-only filter, kept for any existing callers / for computing role defaults. */
export const filterNavForRole = (userRole) =>
  NAV_ITEMS.filter((item) => hasRole(userRole, item.roles));