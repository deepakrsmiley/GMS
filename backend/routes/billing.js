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
const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Bill = require('../models/Bill');

router.use(authenticateUser);

// Permission-driven guards. Super Admin always passes (bypassed inside the
// middleware). Every other user's access now comes from their *actual*
// permission set — the role default, or the per-user override Super Admin
// sets on Staff -> Users & Access -> Feature permissions. Ticking/unticking a
// box there now has a real effect on these routes (it used to be cosmetic
// because these routes were gated by a hardcoded role list instead).
const VIEW_BILLING = authorizeAnyPermission('VIEW_BILLING', 'CREATE_BILLING', 'UPDATE_BILLING', 'PAY_BILL');
const CREATE_BILLING = authorizeAnyPermission('CREATE_BILLING');
const UPDATE_BILLING = authorizeAnyPermission('UPDATE_BILLING');
const PAY_BILL = authorizeAnyPermission('PAY_BILL');
const CANCEL_BILL = authorizeAnyPermission('CANCEL_BILL');
const VIEW_BILLING_REPORTS = authorizeAnyPermission('VIEW_BILLING_REPORTS', 'VIEW_BILLING');
const VIEW_PENDING_DISCHARGE = authorizeAnyPermission('VIEW_PENDING_DISCHARGE', 'VIEW_BILLING');

router.get('/stats', VIEW_BILLING_REPORTS, getBillingStats);
router.get('/revenue-report', VIEW_BILLING_REPORTS, getRevenueReport);
router.get('/pending-discharge', VIEW_PENDING_DISCHARGE, getPendingDischarge);
// Loading a patient's unbilled charges is step one of creating a bill, so
// anyone who can view OR create billing should be able to load them.
router.get('/patient/:patientId/charges', authorizeAnyPermission('VIEW_BILLING', 'CREATE_BILLING'), getPatientCharges);

// -- Pharmacy Shift / Period Reports -----------------------------------------
router.get('/report/shift', VIEW_BILLING_REPORTS, getShiftReport);
router.get('/report/daily', VIEW_BILLING_REPORTS, getDailyReport);
router.get('/report/weekly', VIEW_BILLING_REPORTS, getWeeklyReport);
router.get('/report/monthly', VIEW_BILLING_REPORTS, getMonthlyReport);
router.get('/report/staff', VIEW_BILLING_REPORTS, getStaffReport);

router.route('/')
  .get(VIEW_BILLING, advancedResults(Bill, [
    { path: 'patient', select: 'patientId name phone' },
    { path: 'doctor', select: 'name' },
    { path: 'department', select: 'name' },
  ]), getBills)
  .post(CREATE_BILLING, createBill);

router.route('/:id')
  .get(getBill)
  .put(UPDATE_BILLING, updateBill);

router.post('/:id/payment', PAY_BILL, recordPayment);
router.post('/:id/cancel', CANCEL_BILL, cancelBill);
router.get('/:id/print', printInvoice);
router.get('/:id/thermal', printThermal);

module.exports = router;