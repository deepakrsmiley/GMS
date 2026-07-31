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
const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Bill = require('../models/Bill');

router.use(authenticateUser);

const BILLING_VIEW = ['Super Admin', 'Admin', 'Receptionist', 'Pharmacist', 'Accountant'];
const BILLING_MANAGE = ['Super Admin', 'Admin', 'Receptionist', 'Pharmacist', 'Accountant'];

router.get('/stats', authorizeRoles('Super Admin', 'Admin', 'Accountant', 'Pharmacist'), getBillingStats);
router.get('/revenue-report', authorizeRoles('Super Admin', 'Admin', 'Accountant', 'Pharmacist'), getRevenueReport);
router.get('/pending-discharge', authorizeRoles(...BILLING_MANAGE), getPendingDischarge);
router.get('/patient/:patientId/charges', authorizeRoles(...BILLING_MANAGE), getPatientCharges);

// ── Pharmacy Shift / Period Reports ──────────────────────────────────────────
const REPORT_ROLES = ['Super Admin', 'Admin', 'Accountant', 'Pharmacist'];
router.get('/report/shift',   authorizeRoles(...REPORT_ROLES), getShiftReport);
router.get('/report/daily',   authorizeRoles(...REPORT_ROLES), getDailyReport);
router.get('/report/weekly',  authorizeRoles(...REPORT_ROLES), getWeeklyReport);
router.get('/report/monthly', authorizeRoles(...REPORT_ROLES), getMonthlyReport);
router.get('/report/staff',   authorizeRoles(...REPORT_ROLES), getStaffReport);

router.route('/')
  .get(authorizeRoles(...BILLING_VIEW), advancedResults(Bill, [
    { path: 'patient', select: 'patientId name phone' },
    { path: 'doctor', select: 'name' },
    { path: 'department', select: 'name' },
  ]), getBills)
  .post(authorizeRoles(...BILLING_MANAGE), createBill);

router.route('/:id')
  .get(getBill)
  .put(authorizeRoles(...BILLING_MANAGE), updateBill);

router.post('/:id/payment', authorizeRoles(...BILLING_MANAGE), recordPayment);
router.post('/:id/cancel', authorizeRoles('Super Admin', 'Admin', 'Accountant', 'Pharmacist'), cancelBill);
router.get('/:id/print', printInvoice);
router.get('/:id/thermal', printThermal);

module.exports = router;