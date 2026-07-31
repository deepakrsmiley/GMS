const express = require('express');
const router = express.Router();
const { 
  createPrescription, 
  getPrescriptions, 
  getPrescription, 
  getPatientPrescriptions, 
  cancelPrescription 
} = require('../controllers/prescriptionController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');

router.use(authenticateUser);

router.route('/')
  .post(authorizeRoles('Super Admin', 'Admin', 'Doctor'), createPrescription)
  .get(authorizeRoles('Super Admin', 'Admin', 'Doctor', 'Pharmacist', 'Patient'), getPrescriptions);

router.route('/:id')
  .get(getPrescription)
  .delete(authorizeRoles('Super Admin', 'Admin', 'Doctor'), cancelPrescription);

router.get('/patient/:patientId', getPatientPrescriptions);

module.exports = router;
