const express = require('express');
const router = express.Router();
const { printAppointmentSlip } = require('../controllers/appointmentController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/:id/print', printAppointmentSlip);

module.exports = router;
