const express = require('express');
const router = express.Router();
const labController = require('../controllers/labController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const LabTest = require('../models/LabTest');

router.use(authenticateUser);

router.get('/dashboard', authorizeRoles('Super Admin', 'Admin', 'Lab Technician'), labController.getLabDashboard);
router.get('/types', labController.getLabTypes);
router.get('/ip-medicines', authorizeRoles('Super Admin', 'Admin', 'Lab Technician', 'Nurse', 'Doctor'), labController.getIPMedicinesByTime);

router.route('/')
  .get(
    authorizeRoles('Super Admin', 'Admin', 'Doctor', 'Nurse', 'Lab Technician'),
    advancedResults(LabTest, [
      { path: 'patient', select: 'patientId name age gender' },
      { path: 'doctor', select: 'name' },
    ]),
    labController.getLabTests
  )
  .post(authorizeRoles('Super Admin', 'Admin', 'Doctor', 'Nurse', 'Lab Technician'), labController.createLabTest);

router.route('/:id')
  .get(labController.getLabTest);

router.put('/:id/status', authorizeRoles('Super Admin', 'Admin', 'Lab Technician'), labController.updateLabStatus);
router.put('/:id/results', authorizeRoles('Super Admin', 'Admin', 'Lab Technician'), labController.enterResults);
router.get('/:id/print', labController.printLabReport);

module.exports = router;