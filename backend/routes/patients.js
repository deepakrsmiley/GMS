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
const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Patient = require('../models/Patient');

router.use(authenticateUser);

const PATIENT_VIEW_ROLES = ['Super Admin', 'Admin', 'Doctor', 'Nurse', 'Receptionist', 'Pharmacist', 'Accountant'];

router.get('/search', authorizeRoles(...PATIENT_VIEW_ROLES), searchPatients);
router.get('/stats', authorizeRoles(...PATIENT_VIEW_ROLES), getPatientStats);

router.route('/')
  .get(authorizeRoles(...PATIENT_VIEW_ROLES), advancedResults(Patient, [{ path: 'registeredBy', select: 'name' }]), getPatients)
  .post(authorizeRoles('Super Admin', 'Admin', 'Receptionist', 'Nurse'), createPatient);

router.route('/:id')
  .get(getPatient) // Single patient fetch check is handled inside the controller for Patient role ownership
  .put(authorizeRoles('Super Admin', 'Admin', 'Receptionist', 'Nurse'), updatePatient);

module.exports = router;
