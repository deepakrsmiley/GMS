const express = require('express');
const router = express.Router();
const { 
  getBills, 
  getBill, 
  createBill, 
  updateBill, 
  cancelBill, 
  recordPayment, 
  printInvoice, 
  printThermal, 
  getBillingStats, 
  getRevenueReport,
  getPatientCharges,
  getPendingDischarge,
  getShiftReport,
  getDailyReport,
  getWeeklyReport,
  getMonthlyReport,
  getStaffReport,
} = require('../controllers/billingController');
const { authenticateUser, authorizePermissions } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Bill = require('../models/Bill');

router.use(authenticateUser);

// Permission-driven access — controlled per-user via Users & Access checkboxes.
router.get('/stats', authorizePermissions('VIEW_BILLING_REPORTS'), getBillingStats);
router.get('/revenue-report', authorizePermissions('VIEW_BILLING_REPORTS'), getRevenueReport);
router.get('/pending-discharge', authorizePermissions('VIEW_PENDING_DISCHARGE'), getPendingDischarge);
router.get('/patient/:patientId/charges', authorizePermissions('CREATE_BILLING'), getPatientCharges);

// ── Pharmacy Shift / Period Reports ──────────────────────────────────────────
router.get('/report/shift',   authorizePermissions('VIEW_BILLING_REPORTS'), getShiftReport);
router.get('/report/daily',   authorizePermissions('VIEW_BILLING_REPORTS'), getDailyReport);
router.get('/report/weekly',  authorizePermissions('VIEW_BILLING_REPORTS'), getWeeklyReport);
router.get('/report/monthly', authorizePermissions('VIEW_BILLING_REPORTS'), getMonthlyReport);
router.get('/report/staff',   authorizePermissions('VIEW_BILLING_REPORTS'), getStaffReport);

router.route('/')
  .get(authorizePermissions('VIEW_BILLING'), advancedResults(Bill, [
    { path: 'patient', select: 'patientId name phone' },
    { path: 'doctor', select: 'name' },
    { path: 'department', select: 'name' },
  ]), getBills)
  .post(authorizePermissions('CREATE_BILLING'), createBill);

router.route('/:id')
  .get(getBill)
  .put(authorizePermissions('UPDATE_BILLING'), updateBill);

router.post('/:id/payment', authorizePermissions('PAY_BILL'), recordPayment);
router.post('/:id/cancel', authorizePermissions('CANCEL_BILL'), cancelBill);
router.get('/:id/print', printInvoice);
router.get('/:id/thermal', printThermal);

module.exports = router;