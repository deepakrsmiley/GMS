const express = require('express');
const router = express.Router();
const {
  getOPRegistrations, getOPRegistration, getTodaysQueue, getDoctorQueue, getPatientMedicalHistory,
  createOPRegistration, updateOPStatus, saveConsultation, getDepartmentStats, getPendingPharmacy,
} = require('../controllers/opController');
const { protect } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const OPRegistration = require('../models/OPRegistration');

router.use(protect);
router.get('/queue', getTodaysQueue);
router.get('/doctor-queue', getDoctorQueue);
router.get('/patient/:patientId/history', getPatientMedicalHistory);
router.get('/department-stats', getDepartmentStats);
router.get('/pharmacy-pending', getPendingPharmacy);
router.route('/').get(advancedResults(OPRegistration, [
  { path: 'patient', select: 'patientId name age gender phone' },
  { path: 'doctor', select: 'name specialization' },
  { path: 'department', select: 'name' },
]), getOPRegistrations).post(createOPRegistration);
router.get('/:id', getOPRegistration);
router.put('/:id/status', updateOPStatus);
router.put('/:id/consultation', saveConsultation);

module.exports = router;
