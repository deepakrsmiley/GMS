const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Appointment = require('../models/Appointment');
const { generateAppointmentSlipPDF } = require('../utils/pdfGenerator');

exports.printAppointmentSlip = asyncHandler(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id)
    .populate('patient', 'patientId name age gender phone')
    .populate('doctor', 'name specialization')
    .populate('department', 'name');
  if (!appointment) return next(new ErrorResponse('Appointment not found', 404));
  await generateAppointmentSlipPDF(appointment, res);
});
