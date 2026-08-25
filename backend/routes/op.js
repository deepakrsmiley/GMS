const express = require('express');
const router = express.Router();
const {
  getOPRegistrations, getOPRegistration, getTodaysQueue, getDoctorQueue, getPatientMedicalHistory,
  createOPRegistration, updateOPStatus, saveConsultation, getDepartmentStats, getPendingPharmacy,
  addServiceUsage, updateServiceUsage, deleteServiceUsage,
} = require('../controllers/opController');
const { protect, authorizePermissions, authorizeAnyPermission } = require('../middleware/auth');
const { requireHospitalModule } = require('../middleware/hospitalModule');
const advancedResults = require('../middleware/advancedResults');
const OPRegistration = require('../models/OPRegistration');

router.use(protect);
router.use(requireHospitalModule('op'));

// Permission-driven access — controlled per-user via Users & Access checkboxes.
router.get('/queue', authorizeAnyPermission('VIEW_OP_QUEUE', 'VIEW_QUEUE_DISPLAY'), getTodaysQueue);
router.get('/doctor-queue', authorizeAnyPermission('VIEW_OP_QUEUE', 'CREATE_CONSULTATION'), getDoctorQueue);
router.get('/patient/:patientId/history', authorizeAnyPermission('VIEW_OP_QUEUE', 'VIEW_PATIENT_PROFILE', 'CREATE_CONSULTATION'), getPatientMedicalHistory);
router.get('/department-stats', authorizeAnyPermission('VIEW_OP_QUEUE', 'VIEW_DASHBOARD'), getDepartmentStats);
router.get('/pharmacy-pending', authorizeAnyPermission('VIEW_PHARMACY', 'VIEW_OP_QUEUE'), getPendingPharmacy);
router.route('/').get(authorizePermissions('VIEW_OP_QUEUE'), advancedResults(OPRegistration, [
  { path: 'patient', select: 'patientId name age gender phone' },
  { path: 'doctor', select: 'name specialization' },
  { path: 'department', select: 'name' },
]), getOPRegistrations).post(authorizePermissions('CREATE_OP_QUEUE'), createOPRegistration);
router.get('/:id', authorizeAnyPermission('VIEW_OP_QUEUE', 'VIEW_PHARMACY', 'CREATE_CONSULTATION'), getOPRegistration);
// Pharmacy marks the visit "pharmacy_completed" after dispensing, so
// DISPENSE_PRESCRIPTION is also accepted here.
router.put('/:id/status', authorizeAnyPermission('UPDATE_OP_QUEUE', 'DISPENSE_PRESCRIPTION'), updateOPStatus);
router.put('/:id/consultation', authorizeAnyPermission('CREATE_CONSULTATION', 'UPDATE_CONSULTATION'), saveConsultation);

router.post('/:id/service-usage', authorizePermissions('CREATE_SERVICE_USAGE'), addServiceUsage);
router.put('/:id/service-usage/:usageId', authorizePermissions('CREATE_SERVICE_USAGE'), updateServiceUsage);
router.delete('/:id/service-usage/:usageId', authorizePermissions('CREATE_SERVICE_USAGE'), deleteServiceUsage);

module.exports = router;