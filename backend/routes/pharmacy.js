const express = require('express');
const router = express.Router();
const {
  getMedicines,
  getMedicine,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  addStock,
  adjustStock,
  searchMedicines,
  getLowStockMedicines,
  getOutOfStockMedicines,
  getExpiringMedicines,
  getExpiredMedicines,
  getInventoryActivity,
  dispensePrescription,
  printPrescription,
  getPharmacyDashboard,
  disposeExpiredBatch,
  updateBatch,
  sendInventoryNotification,
  exportReport,
  createDirectSale,
  getDirectSales,
  getDirectSaleById,
} = require('../controllers/pharmacyController');
const {
  getExpiryReport,
  getExpiryReportMeta,
  exportExpiryReport,
} = require('../controllers/medicineExpiryController');
const {
  authenticateUser,
  authorizeRoles,
  authorizeAnyPermission,
} = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Medicine = require('../models/Medicine');

router.use(authenticateUser);

const VIEW = authorizeAnyPermission(
  'VIEW_PHARMACY',
  'MANAGE_PHARMACY',
  'CREATE_MEDICINE',
  'EDIT_MEDICINE',
  'ADD_PHARMACY_STOCK',
  'ADJUST_PHARMACY_STOCK',
  'EDIT_PHARMACY_BATCH',
  'DELETE_MEDICINE',
  'DISPENSE_PRESCRIPTION',
);
const DISPENSE = authorizeAnyPermission('DISPENSE_PRESCRIPTION');
const CREATE_MED = authorizeAnyPermission('CREATE_MEDICINE');
const EDIT_MED = authorizeAnyPermission('EDIT_MEDICINE');
const EDIT_BATCH = authorizeAnyPermission('EDIT_PHARMACY_BATCH', 'EDIT_MEDICINE');
const ADD_STOCK = authorizeAnyPermission('ADD_PHARMACY_STOCK');
const ADJUST_STOCK = authorizeAnyPermission('ADJUST_PHARMACY_STOCK');
const DELETE_MED = authorizeAnyPermission('DELETE_MEDICINE');

// Search used by billing / OP / doctors — keep role gate + pharmacy viewers
router.get(
  '/search',
  authorizeRoles('Super Admin', 'Admin', 'Doctor', 'Nurse', 'Pharmacist'),
  searchMedicines,
);

router.get('/dashboard', VIEW, getPharmacyDashboard);
router.get('/low-stock', VIEW, getLowStockMedicines);
router.get('/out-of-stock', VIEW, getOutOfStockMedicines);
router.get('/expiring', VIEW, getExpiringMedicines);
router.get('/expired', VIEW, getExpiredMedicines);
router.get('/activity', VIEW, getInventoryActivity);
router.get('/reports/:type', VIEW, exportReport);
router.post('/notify', authorizeAnyPermission('ADJUST_PHARMACY_STOCK', 'EDIT_MEDICINE'), sendInventoryNotification);

router.get('/expiry-report/meta', VIEW, getExpiryReportMeta);
router.get('/expiry-report/export', VIEW, exportExpiryReport);
router.get('/expiry-report', VIEW, getExpiryReport);

router.route('/')
  .get(VIEW, advancedResults(Medicine, 'supplier'), getMedicines)
  .post(CREATE_MED, createMedicine);

router.get(
  '/prescriptions/:id/print',
  authorizeRoles('Super Admin', 'Admin', 'Doctor', 'Pharmacist', 'Patient'),
  printPrescription,
);
router.post('/prescriptions/:id/dispense', DISPENSE, dispensePrescription);

router.route('/:id')
  .get(VIEW, getMedicine)
  .put(EDIT_MED, updateMedicine)
  .delete(DELETE_MED, deleteMedicine);

router.post('/:id/stock', ADD_STOCK, addStock);
router.post('/:id/adjust-stock', ADJUST_STOCK, adjustStock);
router.put('/:id/batches/:batchId', EDIT_BATCH, updateBatch);
router.post(
  '/:id/batches/:batchId/dispose',
  authorizeAnyPermission('ADJUST_PHARMACY_STOCK'),
  disposeExpiredBatch,
);

router.route('/sales')
  .get(DISPENSE, getDirectSales)
  .post(DISPENSE, createDirectSale);

router.get('/sales/:id', DISPENSE, getDirectSaleById);

module.exports = router;
