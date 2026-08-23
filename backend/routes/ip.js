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
const { protect, authorizeAnyPermission } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const IPAdmission = require('../models/IPAdmission');

router.use(protect);

// Permission-driven guards (see backend/config/permissions.js -> 'IP Admission'
// group). Super Admin always passes. Everyone else is checked against their
// real permission set, so Super Admin's per-user "Feature permissions"
// checklist on Staff -> Users & Access actually takes effect here.
const VIEW_IP = authorizeAnyPermission('VIEW_IP_ADMISSION', 'VIEW_NURSE_STATION');
const CREATE_IP = authorizeAnyPermission('CREATE_IP_ADMISSION');
const UPDATE_IP = authorizeAnyPermission('UPDATE_IP_ADMISSION');
const NURSE_STATION = authorizeAnyPermission('VIEW_NURSE_STATION');
const NURSING_NOTE = authorizeAnyPermission('CREATE_NURSING_NOTE', 'VIEW_NURSE_STATION');
const VITALS = authorizeAnyPermission('RECORD_VITALS', 'VIEW_NURSE_STATION');
const SHIFT_HANDOVER = authorizeAnyPermission('SHIFT_HANDOVER', 'VIEW_NURSE_STATION');
const DOCTOR_ORDERS = authorizeAnyPermission('MANAGE_DOCTOR_ORDERS', 'VIEW_NURSE_STATION');
const DOCTOR_ROUND = authorizeAnyPermission('CREATE_DOCTOR_ROUND');
const SERVICE_USAGE = authorizeAnyPermission('CREATE_SERVICE_USAGE', 'VIEW_NURSE_STATION');
const IP_MEDICATION = authorizeAnyPermission('MANAGE_IP_MEDICATION', 'VIEW_NURSE_STATION');
const DISCHARGE_SUMMARY = authorizeAnyPermission('CREATE_DISCHARGE_SUMMARY', 'PROCESS_DISCHARGE');
const DISCHARGE = authorizeAnyPermission('PROCESS_DISCHARGE');

router.route('/').get(
  VIEW_IP,
  advancedResults(IPAdmission, [
    { path: 'patient', select: 'patientId name age gender' },
    { path: 'doctor', select: 'name' },
    { path: 'department', select: 'name' },
    { path: 'bed', select: 'bedNumber type' },
    { path: 'ward', select: 'name' },
  ]),
  getAdmissions,
).post(CREATE_IP, createAdmission);

// Must be before /:id so "nurse-station" is not treated as an id
router.get('/nurse-station', NURSE_STATION, getNurseStationBoard);

router.get('/:id/discharge-print', VIEW_IP, printDischargeSummary);
router.route('/:id').get(VIEW_IP, getAdmission);
router.post('/:id/nursing-note', NURSING_NOTE, addNursingNote);
router.post('/:id/vitals', VITALS, addVitalRecord);
router.post('/:id/shift-handover', SHIFT_HANDOVER, addShiftHandover);
router.post('/:id/doctor-order', DOCTOR_ORDERS, addDoctorOrder);
router.put('/:id/doctor-order/:orderId', DOCTOR_ORDERS, updateDoctorOrder);
router.post('/:id/doctor-round', DOCTOR_ROUND, addDoctorRound);
router.post('/:id/service-usage', SERVICE_USAGE, addServiceUsage);
router.put('/:id/service-usage/:usageId', SERVICE_USAGE, updateServiceUsage);
router.delete('/:id/service-usage/:usageId', SERVICE_USAGE, deleteServiceUsage);
router.post('/:id/medication', IP_MEDICATION, addMedication);
router.delete('/:id/medication/:medId', IP_MEDICATION, deleteMedication);
router.put('/:id/discharge-summary', DISCHARGE_SUMMARY, saveDischargeSummary);
router.put('/:id/discharge', DISCHARGE, dischargePatient);
router.put('/:id/transfer-bed', authorizeAnyPermission('UPDATE_IP_ADMISSION', 'MANAGE_BEDS'), transferBed);

module.exports = router;