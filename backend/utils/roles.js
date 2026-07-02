const ROLE_ALIASES = {
  super_admin: 'Super Admin',
  'super admin': 'Super Admin',
  admin: 'Admin',
  doctor: 'Doctor',
  receptionist: 'Receptionist',
  pharmacist: 'Pharmacist',
  lab_technician: 'Lab Technician',
  'lab technician': 'Lab Technician',
  accountant: 'Accountant',
  nurse: 'Nurse',
  patient: 'Patient',
};

const CANONICAL_ROLES = [
  'Super Admin',
  'Admin',
  'Doctor',
  'Receptionist',
  'Pharmacist',
  'Lab Technician',
  'Accountant',
  'Nurse',
  'Patient',
];

const normalizeRole = (role) => {
  if (!role) return '';
  const key = String(role).trim().toLowerCase();
  return ROLE_ALIASES[key] || String(role).trim();
};

const rolesMatch = (userRole, allowedRole) =>
  normalizeRole(userRole) === normalizeRole(allowedRole);

const isSuperAdmin = (role) => normalizeRole(role) === 'Super Admin';

module.exports = {
  ROLE_ALIASES,
  CANONICAL_ROLES,
  normalizeRole,
  rolesMatch,
  isSuperAdmin,
};
