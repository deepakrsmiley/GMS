import { hasRole, normalizeRole, isSuperAdmin } from '../utils/roles';
import { hasPermission } from './permissions';
import { isHospitalModuleEnabledForUser, ROUTE_TO_MODULE } from './hospitalModules';
import { isGmsConsoleUser } from '../utils/homePath';

/**
 * Role-based navigation for the 6 main enterprise roles + Super Admin.
 * Each item also carries a `permission` code. When a user has a custom
 * `permissions` array assigned by Super Admin, that code is what actually
 * gates visibility/access — the `roles` array is only the fallback default.
 */
export const NAV_ITEMS = [
  { id: 'how-to-use',       to: '/how-to-use',              label: 'How to Use',         icon: 'BookOpen',        permission: 'VIEW_DASHBOARD',        group: 'start', roles: ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Pharmacist', 'Lab Technician', 'Nurse', 'Accountant', 'Biomedical Engineer'] },
  { id: 'dashboard',        to: '/dashboard',               label: 'Dashboard',          icon: 'LayoutDashboard', permission: 'VIEW_DASHBOARD',        group: 'start', roles: ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Pharmacist', 'Lab Technician', 'Nurse', 'Accountant', 'Biomedical Engineer'] },
  { id: 'patients',         to: '/patients',                label: 'Patient Registration',icon: 'Users',          permission: 'VIEW_PATIENT',           module: 'patients', group: 'start', roles: ['Super Admin', 'Admin', 'Receptionist'] },
  { id: 'op-reg',           to: '/op-registration',         label: 'OP Registration',    icon: 'Activity',        permission: 'CREATE_OP_QUEUE',        module: 'op', group: 'op', roles: ['Super Admin', 'Admin', 'Receptionist'] },
  { id: 'doctor-queue',     to: '/op-queue',                label: 'Doctor Queue',       icon: 'Stethoscope',     permission: 'VIEW_OP_QUEUE',          module: 'op', group: 'op', roles: ['Super Admin', 'Doctor', 'Receptionist'] },
  { id: 'appointments',     to: '/appointments',            label: 'Appointments',       icon: 'Calendar',        permission: 'VIEW_APPOINTMENT',       module: 'appointments', group: 'op', roles: ['Super Admin', 'Admin', 'Receptionist'] },
  { id: 'queue-display',    to: '/queue-display',           label: 'TV Queue Display',   icon: 'MonitorPlay',     permission: 'VIEW_OP_QUEUE',          module: 'op', group: 'op', roles: ['Super Admin', 'Admin', 'Receptionist'] },
  { id: 'ip-patients',      to: '/ip-admissions',           label: 'IP Admissions',      icon: 'Building2',       permission: 'VIEW_IP_ADMISSION',      module: 'ip', group: 'ip', roles: ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Pharmacist'] },
  { id: 'nurse-station',    to: '/nurse-station',           label: 'Nurse Station',      icon: 'HeartPulse',      permission: 'VIEW_NURSE_STATION',      module: 'ip', group: 'ip', roles: ['Super Admin', 'Admin', 'Doctor', 'Nurse'] },
  { id: 'billing',          to: '/billing',                 label: 'Billing',            icon: 'Receipt',         permission: 'VIEW_BILLING',           module: 'billing', group: 'money', roles: ['Super Admin', 'Admin', 'Pharmacist', 'Accountant', 'Receptionist'] },
  { id: 'prescriptions',    to: '/pharmacy?tab=prescriptions', label: 'Prescriptions',  icon: 'ClipboardList',   permission: 'VIEW_PRESCRIPTION',      module: 'pharmacy', group: 'clinical', roles: ['Super Admin', 'Doctor', 'Pharmacist', 'Receptionist'] },
  { id: 'pharmacy',         to: '/pharmacy?tab=prescriptions', label: 'Pharmacy',        icon: 'Pill',            permission: 'VIEW_PHARMACY',          module: 'pharmacy', group: 'clinical', roles: ['Super Admin', 'Admin', 'Pharmacist'] },
  { id: 'pharmacy-reports', to: '/pharmacy-reports',        label: 'Pharmacy Reports',   icon: 'FileBarChart2',   permission: 'VIEW_PHARMACY',          module: 'pharmacy', group: 'clinical', roles: ['Super Admin', 'Admin', 'Pharmacist'] },
  { id: 'lab-orders',       to: '/lab',                     label: 'Lab Orders',         icon: 'FlaskConical',    permission: 'VIEW_LAB',               module: 'lab', group: 'clinical', roles: ['Super Admin', 'Admin', 'Doctor', 'Lab Technician', 'Nurse', 'Receptionist', 'Pharmacist'] },
  { id: 'lab-reports',      to: '/lab?tab=reports',         label: 'Lab Reports',        icon: 'FileBarChart',    permission: 'VIEW_LAB',               module: 'lab', group: 'clinical', roles: ['Super Admin', 'Admin', 'Lab Technician'] },
  { id: 'biomedical',       to: '/biomedical',              label: 'Biomedical',         icon: 'Wrench',          permission: 'VIEW_BEMS',              module: 'biomedical', group: 'admin', roles: ['Super Admin', 'Admin', 'Biomedical Engineer'] },
  { id: 'masters',          to: '/masters',                 label: 'Masters',            icon: 'Database',        permission: 'MANAGE_MASTERS',         group: 'admin', roles: ['Super Admin', 'Admin'] },
  { id: 'asset-complaints', to: '/asset-complaints',        label: 'Complaints',         icon: 'Activity',        permission: 'VIEW_ASSET_COMPLAINTS',  module: 'biomedical', group: 'other', roles: ['Super Admin', 'Admin', 'Doctor', 'Nurse', 'Pharmacist', 'Lab Technician', 'Receptionist', 'Biomedical Engineer'] },
  { id: 'change-requests',  to: '/change-requests',         label: 'Change Requests',    icon: 'ClipboardCheck',  permission: 'VIEW_CHANGE_REQUESTS',   module: 'changeRequests', group: 'other', roles: ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Pharmacist', 'Lab Technician', 'Nurse', 'Accountant', 'Biomedical Engineer'] },
  { id: 'reports',          to: '/reports',                 label: 'Audit Reports',      icon: 'BarChart3',       permission: 'VIEW_REPORTS',           module: 'reports', group: 'admin', roles: ['Super Admin', 'Admin'] },
];

/** GMS Global Super Admin console (shown even when no hospital is selected). */
export const GMS_NAV_ITEMS = [
  { id: 'gms-admin', to: '/gms', label: 'GMS Dashboard', icon: 'ShieldCheck' },
  { id: 'gms-hospitals', to: '/gms/hospitals', label: 'Hospitals', icon: 'Building2' },
  { id: 'gms-reports', to: '/reports', label: 'System Reports', icon: 'BarChart3' },
];

/** Route-level access for App.jsx ProtectedRoute (role-based fallback) */
export const ROUTE_ACCESS = {
  dashboard:         ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Pharmacist', 'Lab Technician', 'Nurse', 'Accountant', 'Biomedical Engineer'],
  'how-to-use':      ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Pharmacist', 'Lab Technician', 'Nurse', 'Accountant', 'Biomedical Engineer'],
  patients:          ['Super Admin', 'Admin', 'Receptionist'],
  'op-registration': ['Super Admin', 'Admin', 'Receptionist'],
  'op-queue':        ['Super Admin', 'Admin', 'Doctor', 'Receptionist'],
  consultation:      ['Super Admin', 'Doctor', 'Receptionist'],
  'ip-admissions':   ['Super Admin', 'Admin', 'Receptionist', 'Doctor', 'Pharmacist', 'Nurse'],
  'nurse-station':   ['Super Admin', 'Admin', 'Doctor', 'Nurse'],
  billing:           ['Super Admin', 'Admin', 'Pharmacist', 'Accountant', 'Receptionist'],
  'pharmacy-billing':['Super Admin', 'Admin', 'Pharmacist'],
  'pharmacy-reports':['Super Admin', 'Admin', 'Pharmacist'],
  pharmacy:          ['Super Admin', 'Admin', 'Doctor', 'Pharmacist', 'Receptionist'],
  lab:               ['Super Admin', 'Admin', 'Doctor', 'Lab Technician', 'Nurse', 'Receptionist', 'Pharmacist'],
  biomedical:        ['Super Admin', 'Admin', 'Biomedical Engineer'],
  masters:           ['Super Admin', 'Admin'],
  beds:              ['Super Admin', 'Admin'],
  departments:       ['Super Admin', 'Admin'],
  assets:            ['Super Admin', 'Admin', 'Biomedical Engineer'],
  'asset-complaints':['Super Admin', 'Admin', 'Doctor', 'Nurse', 'Pharmacist', 'Lab Technician', 'Receptionist', 'Biomedical Engineer'],
  'change-requests': ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Pharmacist', 'Lab Technician', 'Nurse', 'Accountant', 'Biomedical Engineer'],
  appointments:      ['Super Admin', 'Admin', 'Receptionist'],
  staff:             ['Super Admin', 'Admin'],
  reports:           ['Super Admin', 'Admin'],
  settings:          ['Super Admin', 'Admin'],
  'queue-display':   ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Pharmacist', 'Lab Technician', 'Nurse'],
  gms:               ['Super Admin'],
};

/** Route segment -> permission code (used when a user has custom permissions assigned) */
export const ROUTE_PERMISSIONS = {
  dashboard: 'VIEW_DASHBOARD',
  patients: 'VIEW_PATIENT',
  'op-registration': 'CREATE_OP_QUEUE',
  'op-queue': 'VIEW_OP_QUEUE',
  consultation: 'CREATE_CONSULTATION',
  'ip-admissions': 'VIEW_IP_ADMISSION',
  'nurse-station': 'VIEW_NURSE_STATION',
  billing: 'VIEW_BILLING',
  'pharmacy-billing': 'VIEW_BILLING',
  'pharmacy-reports': 'VIEW_PHARMACY',
  pharmacy: 'VIEW_PHARMACY',
  lab: 'VIEW_LAB',
  biomedical: 'VIEW_BEMS',
  masters: 'MANAGE_MASTERS',
  beds: 'MANAGE_BEDS',
  departments: 'MANAGE_DEPARTMENTS',
  assets: 'VIEW_ASSETS',
  'asset-complaints': 'VIEW_ASSET_COMPLAINTS',
  'change-requests': 'VIEW_CHANGE_REQUESTS',
  appointments: 'VIEW_APPOINTMENT',
  staff: 'MANAGE_STAFF',
  reports: 'VIEW_REPORTS',
  settings: 'MANAGE_SETTINGS',
  'queue-display': 'VIEW_OP_QUEUE',
  'expiry-report': 'VIEW_EXPIRY_REPORT',
};

const MASTER_ACCESS_PERMISSIONS = [
  'MANAGE_MASTERS',
  'MANAGE_DEPARTMENTS',
  'MANAGE_BEDS',
  'VIEW_ASSETS',
  'MANAGE_ASSETS',
  'VIEW_BEMS',
  'MANAGE_BEMS',
  'MANAGE_STAFF',
  'MANAGE_SETTINGS',
  'VIEW_PHARMACY',
  'MANAGE_PHARMACY',
  'CREATE_MEDICINE',
  'EDIT_MEDICINE',
  'ADD_PHARMACY_STOCK',
  'ADJUST_PHARMACY_STOCK',
  'DELETE_MEDICINE',
  'MANAGE_SUPPLIERS',
  'VIEW_LAB',
];

const hasMastersAccess = (user) => {
  if (!user) return false;
  if (normalizeRole(user.role) === 'Super Admin') return true;
  return MASTER_ACCESS_PERMISSIONS.some((code) => hasPermission(user, code));
};

/**
 * Checks whether a user can access a given route path.
 * Accepts either a full `user` object ({ role, permissions }) or, for
 * backward compatibility, a plain role string.
 */
const PHARMACY_ROUTE_PERMS = [
  'VIEW_PHARMACY',
  'MANAGE_PHARMACY',
  'CREATE_MEDICINE',
  'EDIT_MEDICINE',
  'ADD_PHARMACY_STOCK',
  'ADJUST_PHARMACY_STOCK',
  'DELETE_MEDICINE',
  'DISPENSE_PRESCRIPTION',
  'VIEW_EXPIRY_REPORT',
];

export const canAccessRoute = (userOrRole, path) => {
  const user = typeof userOrRole === 'string' ? { role: userOrRole } : (userOrRole || {});
  const segment = path.split('/').filter(Boolean)[0] || 'dashboard';
  const hospitalModule = ROUTE_TO_MODULE[segment];
  if (hospitalModule && !isHospitalModuleEnabledForUser(user, hospitalModule)) return false;

  if (segment === 'gms') return isGmsConsoleUser(user);
  if (normalizeRole(user.role) === 'Super Admin') return true;

  if (segment === 'masters') return hasMastersAccess(user);

  if (segment === 'pharmacy' || segment === 'expiry-report' || segment === 'pharmacy-reports' || segment === 'pharmacy-billing') {
    return PHARMACY_ROUTE_PERMS.some((code) => hasPermission(user, code)) || hasPermission(user, 'VIEW_BILLING');
  }

  const permCode = ROUTE_PERMISSIONS[segment];
  if (permCode) return hasPermission(user, permCode);

  const allowed = ROUTE_ACCESS[segment];
  if (!allowed) return true;
  return hasRole(user.role, allowed);
};

/** Filters the nav for a full user object, respecting custom per-user permissions when present. */
export const filterGmsNavForUser = (user) => {
  if (!isGmsConsoleUser(user)) return [];
  return GMS_NAV_ITEMS.filter((item) => item.id !== 'gms-reports');
};

export const filterNavForUser = (user) => {
  if (!user) return [];
  if (isGmsConsoleUser(user)) return [];
  const byPermission = normalizeRole(user.role) === 'Super Admin'
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => {
      if (item.id === 'how-to-use') return true;
      if (item.id === 'masters') return hasMastersAccess(user);
      if (item.id === 'pharmacy' || item.id === 'pharmacy-reports' || item.id === 'expiry-report') {
        return PHARMACY_ROUTE_PERMS.some((code) => hasPermission(user, code)) || hasPermission(user, 'VIEW_BILLING');
      }
      return hasPermission(user, item.permission);
    });

  return byPermission.filter((item) => isHospitalModuleEnabledForUser(user, item.module));
};

export const NAV_GROUP_ORDER = ['start', 'op', 'ip', 'clinical', 'money', 'admin', 'other'];
export const NAV_GROUP_LABELS = {
  start: 'Start here',
  op: 'Outpatient',
  ip: 'Inpatient',
  clinical: 'Pharmacy & Lab',
  money: 'Billing',
  admin: 'Setup',
  other: 'More',
};

export const groupNavItems = (items) =>
  NAV_GROUP_ORDER
    .map((id) => ({
      id,
      label: NAV_GROUP_LABELS[id],
      items: items.filter((item) => (item.group || 'other') === id),
    }))
    .filter((g) => g.items.length > 0);

/** Legacy role-only filter, kept for any existing callers / for computing role defaults. */
export const filterNavForRole = (userRole) =>
  NAV_ITEMS.filter((item) => hasRole(userRole, item.roles));