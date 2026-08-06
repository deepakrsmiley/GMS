const express = require('express');
const router = express.Router();
const labController = require('../controllers/labController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');

router.use(authenticateUser);

const LAB_VIEW = ['Super Admin', 'Admin', 'Doctor', 'Nurse', 'Lab Technician', 'Receptionist'];
const LAB_CREATE = ['Super Admin', 'Admin', 'Doctor', 'Nurse', 'Lab Technician', 'Receptionist'];
const LAB_PROCESS = ['Super Admin', 'Admin', 'Lab Technician'];

router.get('/dashboard', authorizeRoles('Super Admin', 'Admin', 'Lab Technician'), labController.getLabDashboard);
router.get('/types', labController.getLabTypes);
router.get('/ip-medicines', authorizeRoles(...LAB_VIEW), labController.getIPMedicinesByTime);

router.route('/')
  .get(authorizeRoles(...LAB_VIEW), labController.getLabTests)
  .post(authorizeRoles(...LAB_CREATE), labController.createLabTest);

router.put('/:id/add-tests', authorizeRoles(...LAB_CREATE), labController.addTestsToLabOrder);
router.route('/:id')
  .get(labController.getLabTest);

router.put('/:id/status', authorizeRoles(...LAB_PROCESS), labController.updateLabStatus);
router.put('/:id/results', authorizeRoles(...LAB_PROCESS), labController.enterResults);
router.get('/:id/print', labController.printLabReport);

module.exports = router;
