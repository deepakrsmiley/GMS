export const permissions = {
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
  ],
  'Patient': [
    'VIEW_DASHBOARD',
    'VIEW_OWN_APPOINTMENTS',
    'VIEW_OWN_PRESCRIPTIONS',
    'VIEW_OWN_LAB_REPORTS',
    'VIEW_OWN_BILLS',
  ],
};

export const hasPermission = (userRole, permission) => {
  const roleKey = userRole;
  const perms = permissions[roleKey] || [];
  return perms.includes('*') || perms.includes(permission);
};

export default permissions;