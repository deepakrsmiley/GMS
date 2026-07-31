const express = require('express');
const router = express.Router();
const {
  openShift,
  getMyOpenShift,
  getShiftReport,
  getAllShifts,
  closeShift,
} = require('../controllers/shiftcontroller'); 
const { authenticateUser, authorizeRoles } = require('../middleware/auth');

router.use(authenticateUser);

const SHIFT_ROLES = ['Super Admin', 'Admin', 'Receptionist', 'Pharmacist', 'Accountant', 'Lab Technician'];

router.post('/open', authorizeRoles(...SHIFT_ROLES), openShift);
router.get('/my-open', authorizeRoles(...SHIFT_ROLES), getMyOpenShift);
router.get('/', authorizeRoles(...SHIFT_ROLES), getAllShifts);
router.get('/:id/report', authorizeRoles(...SHIFT_ROLES), getShiftReport);
router.put('/:id/close', authorizeRoles(...SHIFT_ROLES), closeShift);

module.exports = router;