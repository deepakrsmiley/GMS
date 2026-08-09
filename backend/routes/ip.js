const express = require('express');
const router = express.Router();
const {
  getAdmissions,
  getAdmission,
  createAdmission,
  getNurseStationBoard,
  addNursingNote,
  addDoctorRound,
  addVitalRecord,
  addShiftHandover,
  addDoctorOrder,
  updateDoctorOrder,
  saveDischargeSummary,
  dischargePatient,
  printDischargeSummary,
  transferBed,
  addServiceUsage,
  updateServiceUsage,
  deleteServiceUsage,
  addMedication,
  deleteMedication,
} = require('../controllers/ipController');
const { protect, authorizeRoles, authorizePermissions } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const IPAdmission = require('../models/IPAdmission');

router.use(protect);

// Permission-driven access: Super Admin controls these per-user via the
// Users & Access "Feature permissions" checkboxes (IP Admission group).
// Users without a custom permission list fall back to their role defaults.
router.route('/').get(
  authorizePermissions('VIEW_IP_ADMISSION'),
  advancedResults(IPAdmission, [
    { path: 'patient', select: 'patientId name age gender' },
    { path: 'doctor', select: 'name' },
    { path: 'department', select: 'name' },
    { path: 'bed', select: 'bedNumber type' },
    { path: 'ward', select: 'name' },
  ]),
  getAdmissions,
).post(authorizePermissions('CREATE_IP_ADMISSION'), createAdmission);

// Must be before /:id so "nurse-station" is not treated as an id
router.get('/nurse-station', authorizePermissions('VIEW_NURSE_STATION'), getNurseStationBoard);

router.get('/:id/discharge-print', authorizePermissions('VIEW_IP_ADMISSION'), printDischargeSummary);
router.route('/:id').get(authorizePermissions('VIEW_IP_ADMISSION'), getAdmission);
router.post('/:id/nursing-note', authorizePermissions('CREATE_NURSING_NOTE'), addNursingNote);
router.post('/:id/vitals', authorizePermissions('RECORD_VITALS'), addVitalRecord);
router.post('/:id/shift-handover', authorizePermissions('SHIFT_HANDOVER'), addShiftHandover);
router.post('/:id/doctor-order', authorizePermissions('MANAGE_DOCTOR_ORDERS'), addDoctorOrder);
router.put('/:id/doctor-order/:orderId', authorizePermissions('MANAGE_DOCTOR_ORDERS'), updateDoctorOrder);
router.post('/:id/doctor-round', authorizePermissions('CREATE_DOCTOR_ROUND'), addDoctorRound);
router.post('/:id/service-usage', authorizePermissions('CREATE_SERVICE_USAGE'), addServiceUsage);
router.put('/:id/service-usage/:usageId', authorizePermissions('CREATE_SERVICE_USAGE'), updateServiceUsage);
router.delete('/:id/service-usage/:usageId', authorizeRoles('Super Admin'), deleteServiceUsage);
router.post('/:id/medication', authorizePermissions('MANAGE_IP_MEDICATION'), addMedication);
router.delete('/:id/medication/:medId', authorizePermissions('MANAGE_IP_MEDICATION'), deleteMedication);
router.put('/:id/discharge-summary', authorizePermissions('CREATE_DISCHARGE_SUMMARY'), saveDischargeSummary);
router.put('/:id/discharge', authorizePermissions('PROCESS_DISCHARGE'), dischargePatient);
router.put('/:id/transfer-bed', authorizePermissions('UPDATE_IP_ADMISSION'), transferBed);

module.exports = router;
