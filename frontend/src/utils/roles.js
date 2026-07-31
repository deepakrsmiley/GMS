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

export const normalizeRole = (role) => {
  if (!role) return '';
  const key = String(role).trim().toLowerCase();
  return ROLE_ALIASES[key] || String(role).trim();
};

export const hasRole = (userRole, allowedRoles) =>
  allowedRoles.some((role) => normalizeRole(userRole) === normalizeRole(role));

export const STAFF_ROLES = ['Admin', 'Receptionist', 'Doctor', 'Nurse', 'Pharmacist', 'Lab Technician'];
