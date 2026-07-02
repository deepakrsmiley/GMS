const express = require('express');
const router = express.Router();
const { getAdmissions, getAdmission, createAdmission, addNursingNote, addDoctorRound, saveDischargeSummary, dischargePatient, printDischargeSummary, transferBed, addServiceUsage, updateServiceUsage, deleteServiceUsage } = require('../controllers/ipController');
const { protect, authorizeRoles } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const IPAdmission = require('../models/IPAdmission');

router.use(protect);

const IP_VIEW = ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Nurse'];
const IP_ADMIT = ['Super Admin', 'Receptionist'];
const IP_DISCHARGE_SUMMARY = ['Super Admin', 'Doctor'];
const IP_DISCHARGE = ['Super Admin', 'Receptionist', 'Doctor'];

router.route('/').get(
  authorizeRoles(...IP_VIEW),
  advancedResults(IPAdmission, [
    { path: 'patient', select: 'patientId name age gender' },
    { path: 'doctor', select: 'name' },
    { path: 'department', select: 'name' },
    { path: 'bed', select: 'bedNumber type' },
    { path: 'ward', select: 'name' },
  ]),
  getAdmissions,
).post(authorizeRoles(...IP_ADMIT), createAdmission);

router.get('/:id/discharge-print', authorizeRoles(...IP_VIEW), printDischargeSummary);
router.route('/:id').get(authorizeRoles(...IP_VIEW), getAdmission);
router.post('/:id/nursing-note', authorizeRoles('Super Admin', 'Nurse'), addNursingNote);
router.post('/:id/doctor-round', authorizeRoles('Super Admin', 'Doctor'), addDoctorRound);
router.post('/:id/service-usage', authorizeRoles('Super Admin', 'Nurse', 'Doctor'), addServiceUsage);
router.put('/:id/service-usage/:usageId', authorizeRoles('Super Admin', 'Nurse', 'Doctor'), updateServiceUsage);
router.delete('/:id/service-usage/:usageId', authorizeRoles('Super Admin'), deleteServiceUsage);
router.put('/:id/discharge-summary', authorizeRoles(...IP_DISCHARGE_SUMMARY), saveDischargeSummary);
router.put('/:id/discharge', authorizeRoles(...IP_DISCHARGE), dischargePatient);
router.put('/:id/transfer-bed', authorizeRoles('Super Admin', 'Admin'), transferBed);

module.exports = router;
