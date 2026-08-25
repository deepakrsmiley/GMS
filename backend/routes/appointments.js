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
const { protect, authorizePermissions } = require('../middleware/auth');
const { requireHospitalModule } = require('../middleware/hospitalModule');

router.use(protect);
router.use(requireHospitalModule('appointments'));

// Permission-driven access — controlled per-user via Users & Access checkboxes.
router.get('/stats/today', authorizePermissions('VIEW_APPOINTMENT'), getTodayStats);
router.route('/')
  .get(authorizePermissions('VIEW_APPOINTMENT'), getAppointments)
  .post(authorizePermissions('CREATE_APPOINTMENT'), createAppointment);

router.get('/:id/print', authorizePermissions('VIEW_APPOINTMENT'), printAppointmentSlip);
router.put('/:id/cancel', authorizePermissions('CANCEL_APPOINTMENT'), cancelAppointment);
router.put('/:id/confirm', authorizePermissions('UPDATE_APPOINTMENT'), confirmAppointment);

router.route('/:id')
  .get(authorizePermissions('VIEW_APPOINTMENT'), getAppointment)
  .put(authorizePermissions('UPDATE_APPOINTMENT'), updateAppointment);

module.exports = router;
