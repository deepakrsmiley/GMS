const express = require('express');
const router = express.Router();
const { 
  createPrescription, 
  getPrescriptions, 
  getPrescription, 
  getPatientPrescriptions, 
  cancelPrescription 
} = require('../controllers/prescriptionController');
const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');

router.use(authenticateUser);

router.route('/')
  .post(authorizeAnyPermission('CREATE_PRESCRIPTION'), createPrescription)
  .get(authorizeAnyPermission(
    'VIEW_PRESCRIPTION',
    'DISPENSE_PRESCRIPTION',
    'VIEW_OWN_PRESCRIPTIONS',
    'VIEW_PHARMACY',
    'CREATE_PRESCRIPTION',
  ), getPrescriptions);

router.route('/:id')
  .get(getPrescription)
  .delete(authorizeAnyPermission('CREATE_PRESCRIPTION', 'UPDATE_CONSULTATION'), cancelPrescription);

router.get('/patient/:patientId', getPatientPrescriptions);

module.exports = router;
