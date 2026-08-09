const express = require('express');
const router = express.Router();
const labController = require('../controllers/labController');
const { authenticateUser, authorizePermissions } = require('../middleware/auth');

router.use(authenticateUser);

// Permission-driven access — controlled per-user via Users & Access checkboxes.
router.get('/dashboard', authorizePermissions('VIEW_LAB'), labController.getLabDashboard);
router.get('/types', labController.getLabTypes);
router.get('/ip-medicines', authorizePermissions('VIEW_LAB'), labController.getIPMedicinesByTime);

router.route('/')
  .get(authorizePermissions('VIEW_LAB'), labController.getLabTests)
  .post(authorizePermissions('CREATE_LAB_ORDER'), labController.createLabTest);

router.put('/:id/add-tests', authorizePermissions('CREATE_LAB_ORDER'), labController.addTestsToLabOrder);
router.route('/:id')
  .get(labController.getLabTest);

router.put('/:id/status', authorizePermissions('UPDATE_LAB_ORDER'), labController.updateLabStatus);
router.put('/:id/results', authorizePermissions('UPDATE_LAB_REPORT'), labController.enterResults);
router.get('/:id/print', labController.printLabReport);

module.exports = router;
