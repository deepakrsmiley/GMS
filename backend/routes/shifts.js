const express = require('express');
const router = express.Router();
const {
  openShift,
  getMyOpenShift,
  getShiftReport,
  getAllShifts,
  closeShift,
} = require('../controllers/shiftcontroller'); 
const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');

router.use(authenticateUser);

const SHIFT = authorizeAnyPermission(
  'VIEW_BILLING',
  'CREATE_BILLING',
  'PAY_BILL',
  'VIEW_PHARMACY',
  'DISPENSE_PRESCRIPTION',
  'VIEW_LAB',
);

router.post('/open', SHIFT, openShift);
router.get('/my-open', SHIFT, getMyOpenShift);
router.get('/', SHIFT, getAllShifts);
router.get('/:id/report', SHIFT, getShiftReport);
router.put('/:id/close', SHIFT, closeShift);

module.exports = router;
