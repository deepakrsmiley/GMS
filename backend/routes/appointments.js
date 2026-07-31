const express = require('express');
const router = express.Router();
const {
  getAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  confirmAppointment,
  printAppointmentSlip,
  getTodayStats,
} = require('../controllers/appointmentController');
const { protect, authorizeRoles } = require('../middleware/auth');

router.use(protect);

const VIEW = ['Super Admin', 'Admin', 'Receptionist', 'Doctor'];
const MANAGE = ['Super Admin', 'Admin', 'Receptionist'];

router.get('/stats/today', authorizeRoles(...VIEW), getTodayStats);
router.route('/')
  .get(authorizeRoles(...VIEW), getAppointments)
  .post(authorizeRoles(...MANAGE), createAppointment);

router.get('/:id/print', authorizeRoles(...VIEW), printAppointmentSlip);
router.put('/:id/cancel', authorizeRoles(...MANAGE), cancelAppointment);
router.put('/:id/confirm', authorizeRoles(...MANAGE, 'Doctor'), confirmAppointment);

router.route('/:id')
  .get(authorizeRoles(...VIEW), getAppointment)
  .put(authorizeRoles(...MANAGE), updateAppointment);

module.exports = router;
