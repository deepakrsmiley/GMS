import { hasRole } from '../utils/roles';

/**
 * Role-based navigation for the 6 main enterprise roles + Super Admin.
 */
export const NAV_ITEMS = [
  { id: 'dashboard',        to: '/dashboard',               label: 'Dashboard',          icon: 'LayoutDashboard', roles: ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Pharmacist', 'Lab Technician'] },
  { id: 'patients',         to: '/patients',                label: 'Patient Registration',icon: 'Users',          roles: ['Super Admin', 'Admin', 'Receptionist'] },
  { id: 'op-reg',           to: '/op-queue',                label: 'OP Registration',    icon: 'Activity',        roles: ['Super Admin', 'Admin', 'Receptionist'] },
  { id: 'doctor-queue',     to: '/op-queue',                label: 'Doctor Queue',       icon: 'Stethoscope',     roles: ['Super Admin', 'Doctor', 'Receptionist'] },
  { id: 'appointments',     to: '/appointments',            label: 'Appointments',       icon: 'Calendar',        roles: ['Super Admin', 'Admin', 'Receptionist'] },
  { id: 'admission',        to: '/ip-admissions',           label: 'Admission',          icon: 'Building2',       roles: ['Super Admin', 'Admin', 'Receptionist'] },
  { id: 'ip-patients',      to: '/ip-admissions',           label: 'IP Patients',        icon: 'Building2',       roles: ['Super Admin', 'Doctor'] },
  { id: 'discharge',        to: '/ip-admissions?tab=discharge', label: 'Discharge Summary', icon: 'FileText',    roles: ['Super Admin', 'Doctor', 'Receptionist'] },
  { id: 'billing',          to: '/billing',                 label: 'Billing',            icon: 'Receipt',         roles: ['Super Admin', 'Admin', 'Pharmacist'] },
  { id: 'prescriptions',    to: '/pharmacy?tab=prescriptions', label: 'Prescriptions',  icon: 'ClipboardList',   roles: ['Super Admin', 'Doctor', 'Pharmacist', 'Receptionist'] },
  { id: 'pharmacy',         to: '/pharmacy?tab=inventory',  label: 'Pharmacy',           icon: 'Pill',            roles: ['Super Admin', 'Admin', 'Pharmacist'] },

  // ── NEW: Pharmacy Billing Reports ──────────────────────────────────────────
  { id: 'pharmacy-billing', to: '/pharmacy-billing',        label: 'Pharmacy Reports',   icon: 'FileBarChart2',   roles: ['Super Admin', 'Admin', 'Pharmacist'] },

  { id: 'lab-orders',       to: '/lab',                     label: 'Lab Orders',         icon: 'FlaskConical',    roles: ['Super Admin', 'Admin', 'Doctor', 'Lab Technician'] },
  { id: 'lab-reports',      to: '/lab?tab=reports',         label: 'Lab Reports',        icon: 'FileBarChart',    roles: ['Super Admin', 'Admin', 'Lab Technician'] },
  { id: 'beds',             to: '/beds',                    label: 'Bed Management',     icon: 'Bed',             roles: ['Super Admin'] },
  { id: 'departments',      to: '/departments',             label: 'Departments',        icon: 'Building2',       roles: ['Super Admin', 'Admin'] },
  { id: 'assets',           to: '/assets',                  label: 'Assets',             icon: 'Package',         roles: ['Super Admin', 'Admin'] },
  { id: 'asset-complaints', to: '/asset-complaints',        label: 'Complaints',         icon: 'Activity',        roles: ['Super Admin', 'Admin', 'Doctor', 'Nurse', 'Pharmacist', 'Lab Technician', 'Receptionist'] },
  { id: 'staff',            to: '/staff',                   label: 'User Management',    icon: 'UserCog',         roles: ['Super Admin'] },
  { id: 'reports',          to: '/reports',                 label: 'Reports',            icon: 'BarChart3',       roles: ['Super Admin', 'Admin'] },
  { id: 'settings',         to: '/settings',               label: 'Settings',           icon: 'Settings',        roles: ['Super Admin'] },
];

/** Route-level access for App.jsx ProtectedRoute */
export const ROUTE_ACCESS = {
  dashboard:         ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Pharmacist', 'Lab Technician'],
  patients:          ['Super Admin', 'Admin', 'Receptionist'],
  'op-queue':        ['Super Admin', 'Admin', 'Doctor', 'Receptionist'],
  consultation:      ['Super Admin', 'Doctor', 'Receptionist'],
  'ip-admissions':   ['Super Admin', 'Admin', 'Receptionist', 'Doctor'],
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
};

export const canAccessRoute = (userRole, path) => {
  const segment = path.split('/').filter(Boolean)[0] || 'dashboard';
  const allowed = ROUTE_ACCESS[segment];
  if (!allowed) return true;
  return hasRole(userRole, allowed);
};

export const filterNavForRole = (userRole) =>
  NAV_ITEMS.filter((item) => hasRole(userRole, item.roles));