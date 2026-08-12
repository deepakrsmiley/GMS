const express = require('express');
const router = express.Router();
const {
  getPatients,
  getPatient,
  createPatient,
  updatePatient,
  searchPatients,
  getPatientStats
} = require('../controllers/patientController');
const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Patient = require('../models/Patient');

router.use(authenticateUser);

// Permission-driven guards (see backend/config/permissions.js -> 'Patients'
// group). Super Admin always passes; everyone else is checked against their
// real permission set (role default, or a per-user override set by Super
// Admin on Staff -> Users & Access -> Feature permissions).
const VIEW_PATIENT = authorizeAnyPermission('VIEW_PATIENT');
const CREATE_PATIENT = authorizeAnyPermission('CREATE_PATIENT');
const UPDATE_PATIENT = authorizeAnyPermission('UPDATE_PATIENT');

router.get('/search', VIEW_PATIENT, searchPatients);
router.get('/stats', VIEW_PATIENT, getPatientStats);

router.route('/')
  .get(VIEW_PATIENT, advancedResults(Patient, [{ path: 'registeredBy', select: 'name' }]), getPatients)
  .post(CREATE_PATIENT, createPatient);

router.route('/:id')
  .get(getPatient) // Single patient fetch check is handled inside the controller for Patient role ownership
  .put(UPDATE_PATIENT, updatePatient);

module.exports = router;