const express = require('express');
const router = express.Router();
const labController = require('../controllers/labController');
const { authenticateUser, authorizePermissions, authorizeAnyPermission } = require('../middleware/auth');
const { requireHospitalModule } = require('../middleware/hospitalModule');

router.use(authenticateUser);
router.use(requireHospitalModule('lab'));

// Permission-driven access — controlled per-user via Users & Access checkboxes.
router.get('/dashboard', authorizeAnyPermission('VIEW_LAB', 'VIEW_NURSE_STATION'), labController.getLabDashboard);
router.get('/types', authorizeAnyPermission('VIEW_LAB', 'CREATE_LAB_ORDER', 'VIEW_NURSE_STATION'), labController.getLabTypes);
router.get('/ip-medicines', authorizeAnyPermission('VIEW_LAB', 'VIEW_NURSE_STATION'), labController.getIPMedicinesByTime);
router.get('/bills', authorizeAnyPermission('VIEW_LAB', 'VIEW_NURSE_STATION', 'VIEW_BILLING', 'CREATE_BILLING'), labController.getLabBills);

router.route('/')
  .get(authorizeAnyPermission('VIEW_LAB', 'VIEW_NURSE_STATION'), labController.getLabTests)
  .post(authorizeAnyPermission('CREATE_LAB_ORDER', 'VIEW_NURSE_STATION'), labController.createLabTest);

router.put('/:id/add-tests', authorizePermissions('CREATE_LAB_ORDER'), labController.addTestsToLabOrder);
router.route('/:id')
  .get(authorizeAnyPermission('VIEW_LAB', 'VIEW_NURSE_STATION', 'CREATE_LAB_ORDER'), labController.getLabTest);

router.put('/:id/status', authorizePermissions('UPDATE_LAB_ORDER'), labController.updateLabStatus);
router.put('/:id/results', authorizePermissions('UPDATE_LAB_REPORT'), labController.enterResults);
router.post('/:id/bill', authorizeAnyPermission('CREATE_BILLING', 'UPDATE_BILLING'), labController.createLabBill);
router.get('/:id/print', labController.printLabReport);

module.exports = router;
