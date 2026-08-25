const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const { generateAppointmentSlipPDF } = require('../utils/pdfGenerator');

const POPULATE = [
  { path: 'patient', select: 'patientId name age gender phone address' },
  { path: 'doctor', select: 'name specialization' },
  { path: 'department', select: 'name' },
  { path: 'bookedBy', select: 'name' },
];

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

/** GET /api/appointments — list with filters */
exports.getAppointments = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.doctor) filter.doctor = req.query.doctor;
  if (req.query.department) filter.department = req.query.department;
  if (req.query.patient) filter.patient = req.query.patient;
  if (req.query.type) filter.type = req.query.type;

  if (req.query.date) {
    const day = new Date(req.query.date);
    filter.appointmentDate = { $gte: startOfDay(day), $lte: endOfDay(day) };
  } else if (req.query.from || req.query.to) {
    filter.appointmentDate = {};
    if (req.query.from) filter.appointmentDate.$gte = startOfDay(req.query.from);
    if (req.query.to) filter.appointmentDate.$lte = endOfDay(req.query.to);
  }

  // Doctors see only their appointments unless Super Admin/Admin/Receptionist
  if (req.user.role === 'Doctor' && !req.query.doctor) {
    filter.doctor = req.user._id;
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
  const skip = (page - 1) * limit;

  const [total, data] = await Promise.all([
    Appointment.countDocuments(filter),
    Appointment.find(filter)
      .populate(POPULATE)
      .sort({ appointmentDate: 1, appointmentTime: 1 })
      .skip(skip)
      .limit(limit),
  ]);

  res.status(200).json({
    success: true,
    count: data.length,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data,
  });
});

/** GET /api/appointments/:id */
exports.getAppointment = asyncHandler(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id).populate(POPULATE);
  if (!appointment) return next(new ErrorResponse('Appointment not found', 404));
  res.status(200).json({ success: true, data: appointment });
});

/** POST /api/appointments — book */
exports.createAppointment = asyncHandler(async (req, res, next) => {
  const { patient, doctor, department, appointmentDate, appointmentTime, type, reason, notes } = req.body;

  if (!patient || !doctor || !appointmentDate) {
    return next(new ErrorResponse('Patient, doctor and appointment date are required', 400));
  }

  const { userOrgFilter } = require('../middleware/tenant');
  const doctorUser = await User.findOne({ _id: doctor, ...userOrgFilter(req) }).select('department name');
  if (!doctorUser) return next(new ErrorResponse('Doctor not found', 404));

  const dayStart = startOfDay(appointmentDate);
  const dayEnd = endOfDay(appointmentDate);

  // Prevent double-booking same doctor + date + time (active appointments only)
  if (appointmentTime) {
    const clash = await Appointment.findOne({
      doctor,
      appointmentTime: String(appointmentTime).trim(),
      appointmentDate: { $gte: dayStart, $lte: dayEnd },
      status: { $nin: ['cancelled', 'no_show', 'completed'] },
    });
    if (clash) {
      return next(new ErrorResponse('This doctor already has an appointment at that time', 400));
    }
  }

  const appointment = await Appointment.create({
    patient,
    doctor,
    department: department || doctorUser.department,
    appointmentDate: dayStart,
    appointmentTime: appointmentTime ? String(appointmentTime).trim() : undefined,
    type: type || 'new',
    status: 'scheduled',
    reason,
    notes,
    bookedBy: req.user._id,
  });

  const populated = await Appointment.findById(appointment._id).populate(POPULATE);

  try {
    const { notifyRoles, notifyUser } = require('../utils/notify');
    const when = appointment.appointmentDate
      ? new Date(appointment.appointmentDate).toLocaleDateString('en-IN')
      : 'scheduled date';
    await notifyRoles(req, {
      roles: ['Receptionist', 'Admin', 'Super Admin'],
      title: 'New appointment',
      message: `${populated.patient?.name || 'Patient'} with Dr. ${populated.doctor?.name || ''} on ${when}${appointment.appointmentTime ? ` ${appointment.appointmentTime}` : ''}`.trim(),
      type: 'appointment',
      link: '/appointments',
      relatedId: appointment._id,
      relatedModel: 'Appointment',
      excludeUserId: req.user._id,
    });
    if (populated.doctor?._id) {
      await notifyUser(req, {
        userId: populated.doctor._id,
        title: 'New appointment booked',
        message: `${populated.patient?.name || 'Patient'} on ${when}${appointment.appointmentTime ? ` at ${appointment.appointmentTime}` : ''}`,
        type: 'appointment',
        link: '/appointments',
        relatedId: appointment._id,
        relatedModel: 'Appointment',
      });
    }
  } catch (_) { /* ignore */ }

  res.status(201).json({ success: true, data: populated });
});

/** PUT /api/appointments/:id — update / reschedule */
exports.updateAppointment = asyncHandler(async (req, res, next) => {
  let appointment = await Appointment.findById(req.params.id);
  if (!appointment) return next(new ErrorResponse('Appointment not found', 404));
  if (appointment.status === 'cancelled') {
    return next(new ErrorResponse('Cannot update a cancelled appointment', 400));
  }

  const allowed = ['doctor', 'department', 'appointmentDate', 'appointmentTime', 'type', 'status', 'reason', 'notes'];
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) {
      if (field === 'appointmentDate') {
        appointment.appointmentDate = startOfDay(req.body.appointmentDate);
      } else {
        appointment[field] = req.body[field];
      }
    }
  });

  await appointment.save();
  appointment = await Appointment.findById(appointment._id).populate(POPULATE);
  res.status(200).json({ success: true, data: appointment });
});

/** PUT /api/appointments/:id/cancel */
exports.cancelAppointment = asyncHandler(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return next(new ErrorResponse('Appointment not found', 404));
  if (appointment.status === 'cancelled') {
    return next(new ErrorResponse('Appointment is already cancelled', 400));
  }

  appointment.status = 'cancelled';
  appointment.cancelledBy = req.user._id;
  appointment.cancelReason = req.body.cancelReason || req.body.reason || '';
  await appointment.save();

  const populated = await Appointment.findById(appointment._id).populate(POPULATE);
  res.status(200).json({ success: true, data: populated });
});

/** PUT /api/appointments/:id/confirm */
exports.confirmAppointment = asyncHandler(async (req, res, next) => {
  const appointment = await Appointment.findByIdAndUpdate(
    req.params.id,
    { status: 'confirmed' },
    { new: true },
  ).populate(POPULATE);
  if (!appointment) return next(new ErrorResponse('Appointment not found', 404));
  res.status(200).json({ success: true, data: appointment });
});

/** GET /api/appointments/:id/print */
exports.printAppointmentSlip = asyncHandler(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id)
    .populate('patient', 'patientId name age gender phone')
    .populate('doctor', 'name specialization')
    .populate('department', 'name');
  if (!appointment) return next(new ErrorResponse('Appointment not found', 404));
  await generateAppointmentSlipPDF(appointment, res);
});

/** GET /api/appointments/stats/today */
exports.getTodayStats = asyncHandler(async (req, res) => {
  const today = new Date();
  const filter = {
    appointmentDate: { $gte: startOfDay(today), $lte: endOfDay(today) },
  };
  if (req.user.role === 'Doctor') filter.doctor = req.user._id;

  const rows = await Appointment.find(filter).select('status');
  const stats = {
    total: rows.length,
    scheduled: rows.filter((r) => r.status === 'scheduled').length,
    confirmed: rows.filter((r) => r.status === 'confirmed').length,
    completed: rows.filter((r) => r.status === 'completed').length,
    cancelled: rows.filter((r) => r.status === 'cancelled').length,
    no_show: rows.filter((r) => r.status === 'no_show').length,
  };
  res.status(200).json({ success: true, data: stats });
});
