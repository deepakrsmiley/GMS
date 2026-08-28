import { normalizeRole } from '../utils/roles';
import { isHospitalModuleEnabledForUser } from './hospitalModules';

export const WORKFLOWS = {
  setup: {
    id: 'setup',
    title: 'Hospital setup (once)',
    steps: [
      { id: 'branding', label: 'Branding', hint: 'Name, GSTIN, logo', to: '/masters/branding' },
      { id: 'departments', label: 'Departments', hint: 'Clinical units', to: '/masters/departments' },
      { id: 'staff', label: 'Staff', hint: 'People and roles', to: '/masters/staff' },
      { id: 'beds', label: 'Rooms & beds', hint: 'All 60 beds', to: '/masters/beds' },
      { id: 'services', label: 'Services', hint: 'O2, nursing rates', to: '/masters/services' },
      { id: 'lab', label: 'Lab tests', hint: 'Test list + price', to: '/masters/lab-tests' },
      { id: 'pharmacy', label: 'Pharmacy stock', hint: 'Medicines + batches', to: '/masters/medicines' },
    ],
  },
  patient: {
    id: 'patient',
    title: 'Every patient',
    steps: [
      { id: 'search', label: 'Search UHID', hint: 'Name / phone / UHID', to: '/patients' },
      { id: 'register', label: 'Register only if new', hint: 'One UHID forever', to: '/patients' },
      { id: 'choose', label: 'OP or IP', hint: 'Token or a free bed', to: '/op-queue' },
    ],
  },
  appointments: {
    id: 'appointments',
    title: 'Appointments',
    steps: [
      { id: 'book', label: 'Book slot', hint: 'Date + doctor', to: '/appointments' },
      { id: 'arrive', label: 'On the day', hint: 'Convert to OP token', to: '/op-queue' },
    ],
  },
  op: {
    id: 'op',
    title: 'Outpatient',
    steps: [
      { id: 'register', label: 'OP token', hint: 'Reception', to: '/op-queue' },
      { id: 'wait', label: 'Waiting', hint: 'TV queue', to: '/queue-display' },
      { id: 'consult', label: 'Consultation', hint: 'Doctor', to: '/op-queue' },
      { id: 'rx', label: 'Rx / lab / services', hint: 'During consult', to: '/op-queue' },
      { id: 'pharmacy', label: 'Pharmacy', hint: 'Dispense', to: '/pharmacy?tab=prescriptions' },
      { id: 'lab', label: 'Lab', hint: 'Sample → result', to: '/lab' },
      { id: 'bill', label: 'Bill last', hint: 'Collect + print', to: '/billing' },
    ],
  },
  consult: {
    id: 'consult',
    title: 'Doctor consultation',
    steps: [
      { id: 'start', label: 'Start', hint: 'Call next token', to: '/op-queue' },
      { id: 'notes', label: 'Notes', hint: 'Diagnosis + Rx', to: null },
      { id: 'orders', label: 'Lab / admit', hint: 'If needed', to: null },
      { id: 'done', label: 'Complete', hint: 'Patient goes to pharmacy or billing', to: '/billing' },
    ],
  },
  ip: {
    id: 'ip',
    title: 'Inpatient',
    steps: [
      { id: 'admit', label: 'Admit + bed', hint: 'Free bed required', to: '/ip-admissions' },
      { id: 'nurse', label: 'Nurse station', hint: 'Vitals, handover', to: '/nurse-station' },
      { id: 'care', label: 'Stay', hint: 'Meds, O2, lab', to: '/ip-admissions' },
      { id: 'summary', label: 'Discharge summary', hint: 'Doctor writes', to: '/ip-admissions?tab=discharge' },
      { id: 'bill', label: 'IP bill + pay', hint: 'Before leaving', to: '/billing' },
      { id: 'discharge', label: 'Discharge', hint: 'Bed becomes free', to: '/ip-admissions' },
    ],
  },
  nurse: {
    id: 'nurse',
    title: 'Nurse station',
    steps: [
      { id: 'board', label: 'Ward board', hint: 'Today’s IPs', to: '/nurse-station' },
      { id: 'vitals', label: 'Vitals', hint: 'Each shift', to: '/nurse-station' },
      { id: 'meds', label: 'Medicines', hint: 'Log as given', to: '/nurse-station' },
      { id: 'handover', label: 'Handover', hint: 'End of shift', to: '/nurse-station' },
    ],
  },
  pharmacy: {
    id: 'pharmacy',
    title: 'Pharmacy',
    steps: [
      { id: 'queue', label: 'Pending Rx', hint: 'From doctor', to: '/pharmacy?tab=prescriptions' },
      { id: 'dispense', label: 'Dispense', hint: 'Stock goes down', to: '/pharmacy?tab=prescriptions' },
      { id: 'bill', label: 'Bill if needed', hint: 'Counter sale / OP bill', to: '/billing' },
    ],
  },
  lab: {
    id: 'lab',
    title: 'Laboratory',
    steps: [
      { id: 'order', label: 'Order', hint: 'Doctor or lab desk', to: '/lab' },
      { id: 'collect', label: 'Sample', hint: 'Collect', to: '/lab' },
      { id: 'result', label: 'Results', hint: 'Enter + print', to: '/lab?tab=reports' },
    ],
  },
  billing: {
    id: 'billing',
    title: 'Billing',
    steps: [
      { id: 'pick', label: 'Find patient', hint: 'UHID', to: '/billing' },
      { id: 'charges', label: 'Unbilled charges', hint: 'Consult, meds, lab, room', to: '/billing' },
      { id: 'pay', label: 'Collect', hint: 'Cash / UPI / card', to: '/billing' },
      { id: 'print', label: 'Print', hint: 'A4 or thermal', to: '/billing' },
    ],
  },
};

export const ROLE_PLAYBOOKS = {
  'Receptionist': {
    title: 'Reception — your day',
    steps: [
      { label: 'Search UHID first', to: '/patients', detail: 'Never create a second file for the same person.' },
      { label: 'Book appointment or OP token', to: '/op-queue', detail: 'Walk-in → OP Registration. Booked → Appointments then token.' },
      { label: 'Admit only with a free bed', to: '/ip-admissions', detail: 'Emergency: still create UHID, then IP with type Emergency.' },
      { label: 'Discharge after bill is paid', to: '/ip-admissions', detail: 'Cashier settles Billing → Pending Discharge first.' },
    ],
  },
  'Doctor': {
    title: 'Doctor — your day',
    steps: [
      { label: 'Open Doctor Queue', to: '/op-queue', detail: 'Call the next waiting token. Start consultation.' },
      { label: 'Write notes, Rx, lab', to: '/op-queue', detail: 'Prescription and lab orders happen in the consult.' },
      { label: 'IP rounds on Nurse Station / IP file', to: '/nurse-station', detail: 'Orders, rounds, discharge summary.' },
      { label: 'Do not collect cash', to: '/billing', detail: 'Billing prints the invoice after your work is logged.' },
    ],
  },
  'Nurse': {
    title: 'Nurse — your day',
    steps: [
      { label: 'Open Nurse Station', to: '/nurse-station', detail: 'Ward board is your home screen.' },
      { label: 'Vitals every shift', to: '/nurse-station', detail: 'Log on the admission, not on paper only.' },
      { label: 'Medicines and O2 as given', to: '/nurse-station', detail: 'What you log becomes the IP bill.' },
      { label: 'Handover before you leave', to: '/nurse-station', detail: 'Morning / afternoon / night.' },
    ],
  },
  'Pharmacist': {
    title: 'Pharmacy — your day',
    steps: [
      { label: 'Pending prescriptions', to: '/pharmacy?tab=prescriptions', detail: 'Dispense from the doctor’s Rx.' },
      { label: 'Stock and expiry', to: '/pharmacy-reports', detail: 'Do not skip batch and expiry.' },
      { label: 'Billing when asked', to: '/billing', detail: 'OP/IP medicine lines are pulled from what you dispensed.' },
    ],
  },
  'Lab Technician': {
    title: 'Lab — your day',
    steps: [
      { label: 'Open Lab Orders', to: '/lab', detail: 'Sample collected → processing → results.' },
      { label: 'Enter results and print', to: '/lab?tab=reports', detail: 'Doctor sees the report after you complete it.' },
    ],
  },
  'Accountant': {
    title: 'Billing — your day',
    steps: [
      { label: 'OP bills after consult', to: '/billing', detail: 'Load unbilled charges. Do not invent line items.' },
      { label: 'IP: Pending Discharge', to: '/billing', detail: 'Collect room + meds + services, then reception discharges.' },
      { label: 'Print invoice', to: '/billing', detail: 'A4 for files, thermal for pharmacy/OP.' },
    ],
  },
  'Admin': {
    title: 'Admin — your day',
    steps: [
      { label: 'Masters stay correct', to: '/masters', detail: 'Beds, rates, staff, GST logo.' },
      { label: 'Staff logins', to: '/masters/staff', detail: 'One person, one role. Never share Super Admin.' },
      { label: 'Reports at day close', to: '/reports', detail: 'Collections, occupancy, pharmacy.' },
    ],
  },
  'Super Admin': {
    title: 'Super Admin — your day',
    steps: [
      { label: 'Select this hospital', to: '/dashboard', detail: 'Work inside the hospital, not on empty GMS.' },
      { label: 'How to Use for staff', to: '/how-to-use', detail: 'Train reception and nurses on this page.' },
      { label: 'Masters + users', to: '/masters/staff', detail: 'Do not give anyone * permissions.' },
    ],
  },
  'Biomedical Engineer': {
    title: 'Biomedical — your day',
    steps: [
      { label: 'Assets and BEMS', to: '/biomedical', detail: 'PM, calibration, work orders.' },
      { label: 'Complaints from wards', to: '/asset-complaints', detail: 'Do not open patient clinical files.' },
    ],
  },
};

export const getRolePlaybook = (user) => {
  const role = normalizeRole(user?.role);
  return ROLE_PLAYBOOKS[role] || ROLE_PLAYBOOKS.Admin;
};

export const playbookStepsForUser = (user) => {
  const book = getRolePlaybook(user);
  return (book.steps || []).filter((s) => {
    if (!s.to) return true;
    const path = s.to.split('?')[0];
    const segment = path.split('/').filter(Boolean)[0];
    const moduleMap = {
      patients: 'patients',
      'op-queue': 'op',
      'queue-display': 'op',
      appointments: 'appointments',
      'ip-admissions': 'ip',
      'nurse-station': 'ip',
      billing: 'billing',
      pharmacy: 'pharmacy',
      'pharmacy-reports': 'pharmacy',
      lab: 'lab',
      biomedical: 'biomedical',
      'asset-complaints': 'biomedical',
      reports: 'reports',
      masters: null,
      dashboard: null,
      'how-to-use': null,
    };
    const mod = moduleMap[segment];
    if (mod && !isHospitalModuleEnabledForUser(user, mod)) return false;
    return true;
  });
};

export const canSeeHowToUse = (user) => Boolean(user);
