const express = require('express');
const { authorizeAnyPermission } = require('../middleware/auth');
const {
  getMeta,
  createPurchase,
  listPurchases,
  getPurchase,
  updatePurchase,
  cancelPurchase,
  previewReturn,
  createReturn,
  listReturns,
  getReturn,
  cancelReturn,
  getLedger,
  getValuation,
  getReports,
  getDashboardCards,
} = require('../controllers/purchaseController');

const router = express.Router();

const VIEW = authorizeAnyPermission(
  'VIEW_PHARMACY',
  'MANAGE_PHARMACY',
  'ADD_PHARMACY_STOCK',
  'ADJUST_PHARMACY_STOCK',
);
const RECORD = authorizeAnyPermission('ADD_PHARMACY_STOCK', 'MANAGE_PHARMACY');

router.get('/meta', VIEW, getMeta);
router.get('/dashboard-cards', VIEW, getDashboardCards);
router.get('/ledger', VIEW, getLedger);
router.get('/valuation', VIEW, getValuation);
router.get('/reports', VIEW, getReports);

router.get('/returns', VIEW, listReturns);
router.post('/returns/preview', RECORD, previewReturn);
router.post('/returns', RECORD, createReturn);
router.get('/returns/:id', VIEW, getReturn);
router.post('/returns/:id/cancel', RECORD, cancelReturn);

router.route('/')
  .get(VIEW, listPurchases)
  .post(RECORD, createPurchase);

router.get('/:id', VIEW, getPurchase);
router.patch('/:id', RECORD, updatePurchase);
router.post('/:id/cancel', RECORD, cancelPurchase);

module.exports = router;
