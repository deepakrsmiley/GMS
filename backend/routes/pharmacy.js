const express = require('express');
const router = express.Router();
const {
  getMedicines,
  getMedicine,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  addStock,
  adjustStock,  // NEW
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
  sendInventoryNotification,
  exportReport,
  createDirectSale,
  getDirectSales,
  getDirectSaleById,
} = require('../controllers/pharmacyController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Medicine = require('../models/Medicine');

router.use(authenticateUser);

const PHARMA_ROLES = ['Super Admin', 'Admin', 'Pharmacist'];
const PHARMA_SEARCH = ['Super Admin', 'Admin', 'Doctor', 'Nurse', 'Pharmacist'];

router.get('/search', authorizeRoles(...PHARMA_SEARCH), searchMedicines);
router.get('/dashboard', authorizeRoles(...PHARMA_ROLES), getPharmacyDashboard);
router.get('/low-stock', authorizeRoles(...PHARMA_ROLES), getLowStockMedicines);
router.get('/out-of-stock', authorizeRoles(...PHARMA_ROLES), getOutOfStockMedicines);
router.get('/expiring', authorizeRoles(...PHARMA_ROLES), getExpiringMedicines);
router.get('/expired', authorizeRoles(...PHARMA_ROLES), getExpiredMedicines);
router.get('/activity', authorizeRoles(...PHARMA_ROLES), getInventoryActivity);
router.get('/reports/:type', authorizeRoles(...PHARMA_ROLES), exportReport);
router.post('/notify', authorizeRoles(...PHARMA_ROLES), sendInventoryNotification);

router.route('/')
  .get(authorizeRoles(...PHARMA_ROLES), advancedResults(Medicine, 'supplier'), getMedicines)
  .post(authorizeRoles(...PHARMA_ROLES), createMedicine);

router.get('/prescriptions/:id/print', authorizeRoles('Super Admin', 'Admin', 'Doctor', 'Pharmacist', 'Patient'), printPrescription);
router.post('/prescriptions/:id/dispense', authorizeRoles(...PHARMA_ROLES), dispensePrescription);

router.route('/:id')
  .get(authorizeRoles(...PHARMA_ROLES), getMedicine)
  .put(authorizeRoles(...PHARMA_ROLES), updateMedicine)
  .delete(authorizeRoles('Super Admin', 'Admin'), deleteMedicine);

router.post('/:id/stock', authorizeRoles(...PHARMA_ROLES), addStock);
// NEW: ENDPOINT FOR REDUCING/INCREASING STOCK
router.post('/:id/adjust-stock', authorizeRoles(...PHARMA_ROLES), adjustStock);
// END NEW
router.post('/:id/batches/:batchId/dispose', authorizeRoles(...PHARMA_ROLES), disposeExpiredBatch);

// Direct Sale routes
router.route("/sales")
  .get(authorizeRoles(...PHARMA_ROLES), getDirectSales)
  .post(authorizeRoles(...PHARMA_ROLES), createDirectSale);

router.get('/sales/:id', authorizeRoles(...PHARMA_ROLES), getDirectSaleById);

module.exports = router;