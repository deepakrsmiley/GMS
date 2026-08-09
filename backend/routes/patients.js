const express = require('express');
const router = express.Router();
const { 
  getPatients, 
  getPatient, 
  createPatient, 
  updatePatient, 
  deletePatient,
  searchPatients, 
  getPatientStats 
} = require('../controllers/patientController');
const { authenticateUser, authorizePermissions } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Patient = require('../models/Patient');

router.use(authenticateUser);

// Permission-driven access — Super Admin controls these per-user via the
// Users & Access "Feature permissions" checkboxes (Patients group).
router.get('/search', authorizePermissions('VIEW_PATIENT'), searchPatients);
router.get('/stats', authorizePermissions('VIEW_PATIENT'), getPatientStats);

router.route('/')
  .get(authorizePermissions('VIEW_PATIENT'), advancedResults(Patient, [{ path: 'registeredBy', select: 'name' }]), getPatients)
  .post(authorizePermissions('CREATE_PATIENT'), createPatient);

router.route('/:id')
  .get(getPatient) // Single patient fetch check is handled inside the controller for Patient role ownership
  .put(authorizePermissions('UPDATE_PATIENT'), updatePatient)
  .delete(authorizePermissions('DELETE_PATIENT'), deletePatient);

module.exports = router;
