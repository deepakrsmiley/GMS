const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const OPRegistration = require('../models/OPRegistration');
const Patient = require('../models/Patient');
const IPAdmission = require('../models/IPAdmission');
const Prescription = require('../models/Prescription');
const LabTest = require('../models/LabTest');
const Counter = require('../models/Counter');
const { generateTokenNo } = require('../utils/generateId');

const getWaitingMinutes = (op) => {
  const start = op.consultationStart || op.createdAt;
  const end = op.consultationEnd || new Date();
  return Math.max(Math.round((end - new Date(start)) / 60000), 0);
};

exports.getOPRegistrations = asyncHandler(async (req, res) => {
  res.status(200).json(res.advancedResults);
});

exports.getOPRegistration = asyncHandler(async (req, res, next) => {
  const op = await OPRegistration.findById(req.params.id)
    .populate('patient', 'patientId name age gender phone address allergies chronicConditions')
    .populate('doctor', 'name specialization')
    .populate('department', 'name');
  if (!op) return next(new ErrorResponse('Registration not found', 404));
  res.status(200).json({ success: true, data: op });
});

exports.getTodaysQueue = asyncHandler(async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const filter = { tokenDate: { $gte: today, $lt: tomorrow } };
  if (req.query.department) filter.department = req.query.department;
  if (req.query.doctor) filter.doctor = req.query.doctor;
  if (req.user.role === 'Doctor' && !req.query.doctor) filter.doctor = req.user._id;

  const queue = await OPRegistration.find(filter)
    .populate('patient', 'patientId name age gender phone')
    .populate('doctor', 'name specialization')
    .populate('department', 'name')
    .sort('tokenNumber');

  const enriched = queue.map((q) => ({
    ...q.toObject(),
    waitingMinutes: q.status === 'waiting' ? getWaitingMinutes(q) : 0,
  }));

  const stats = {
    waiting: queue.filter((q) => q.status === 'waiting').length,
    in_consultation: queue.filter((q) => q.status === 'in_consultation').length,
    completed: queue.filter((q) => ['completed', 'consultation_completed', 'sent_to_pharmacy', 'pharmacy_completed', 'sent_to_lab'].includes(q.status)).length,
    admitted: queue.filter((q) => q.status === 'admitted').length,
    total: queue.length,
  };

  res.status(200).json({ success: true, data: enriched, stats });
});

exports.getPendingPharmacy = asyncHandler(async (req, res) => {
  const queue = await OPRegistration.find({ status: 'sent_to_pharmacy' })
    .populate('patient', 'patientId name age gender phone allergies chronicConditions')
    .populate('doctor', 'name specialization')
    .populate('department', 'name')
    .sort('consultationEnd tokenNumber');

  res.status(200).json({ success: true, count: queue.length, data: queue });
});

exports.getDoctorQueue = asyncHandler(async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const doctorId = req.query.doctor || req.user._id;

  const queue = await OPRegistration.find({
    tokenDate: { $gte: today, $lt: tomorrow },
    doctor: doctorId,
    status: { $nin: ['cancelled', 'no_show', 'discharged'] },
  })
    .populate('patient', 'patientId name age gender phone')
    .populate('department', 'name')
    .sort('tokenNumber');

  res.status(200).json({
    success: true,
    data: queue.map((q) => ({ ...q.toObject(), waitingMinutes: getWaitingMinutes(q) })),
  });
});

exports.getPatientMedicalHistory = asyncHandler(async (req, res, next) => {
  const patient = await Patient.findById(req.params.patientId);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const [visits, prescriptions, labTests, admissions] = await Promise.all([
    OPRegistration.find({ patient: patient._id })
      .populate('doctor', 'name')
      .populate('department', 'name')
      .sort('-tokenDate')
      .limit(20),
    Prescription.find({ patient: patient._id })
      .populate('doctor', 'name')
      .sort('-createdAt')
      .limit(20),
    LabTest.find({ patient: patient._id })
      .populate('doctor', 'name')
      .sort('-createdAt')
      .limit(20),
    IPAdmission.find({ patient: patient._id })
      .populate('doctor', 'name')
      .populate('department', 'name')
      .sort('-admissionDate')
      .limit(10),
  ]);

  res.status(200).json({
    success: true,
    data: {
      patient,
      previousVisits: visits,
      previousPrescriptions: prescriptions,
      previousLabReports: labTests,
      previousAdmissions: admissions,
      allergies: patient.allergies || [],
      chronicDiseases: patient.chronicConditions || [],
    },
  });
});

exports.createOPRegistration = asyncHandler(async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const countToday = await OPRegistration.countDocuments({ tokenDate: { $gte: today } });
  req.body.tokenNumber = generateTokenNo(countToday + 1);
  req.body.tokenDate = new Date();
  req.body.registeredBy = req.user._id;

  const op = await OPRegistration.create(req.body);
  await Patient.findByIdAndUpdate(req.body.patient, { $push: { visits: op._id } });

  const populated = await OPRegistration.findById(op._id)
    .populate('patient', 'patientId name age gender phone')
    .populate('doctor', 'name specialization')
    .populate('department', 'name');

  if (req.app.get('io')) {
    req.app.get('io').emit('queue:update', { type: 'new', data: populated });
    if (populated.doctor) {
      req.app.get('io').to(`doctor:${populated.doctor._id}`).emit('queue:update', { type: 'new', data: populated });
    }
  }

  res.status(201).json({ success: true, data: populated });
});

exports.updateOPStatus = asyncHandler(async (req, res, next) => {
  const updates = { status: req.body.status };
  if (req.body.status === 'in_consultation') updates.consultationStart = new Date();
  if (['completed', 'consultation_completed', 'sent_to_pharmacy', 'pharmacy_completed', 'sent_to_lab', 'admitted'].includes(req.body.status)) {
    updates.consultationEnd = new Date();
  }

  const op = await OPRegistration.findByIdAndUpdate(req.params.id, updates, { new: true })
    .populate('patient', 'patientId name age gender phone')
    .populate('doctor', 'name')
    .populate('department', 'name');

  if (!op) return next(new ErrorResponse('Registration not found', 404));

  if (req.app.get('io')) {
    req.app.get('io').emit('queue:update', { type: 'status_change', data: op });
  }

  res.status(200).json({ success: true, data: op });
});

exports.saveConsultation = asyncHandler(async (req, res, next) => {
  const { consultationNotes, diagnosis, vitals, followUpDate, status } = req.body;
  const op = await OPRegistration.findByIdAndUpdate(
    req.params.id,
    {
      consultationNotes,
      diagnosis,
      vitals,
      followUpDate,
      status: status || 'sent_to_pharmacy',
      consultationEnd: new Date(),
    },
    { new: true },
  ).populate('patient doctor department');

  if (!op) return next(new ErrorResponse('Registration not found', 404));

  if (req.app.get('io')) req.app.get('io').emit('queue:update', { type: 'consultation_saved', data: op });

  res.status(200).json({ success: true, data: op });
});

exports.getDepartmentStats = asyncHandler(async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const stats = await OPRegistration.aggregate([
    { $match: { tokenDate: { $gte: today } } },
    { $group: { _id: '$department', count: { $sum: 1 }, waiting: { $sum: { $cond: [{ $eq: ['$status', 'waiting'] }, 1, 0] } }, completed: { $sum: { $cond: [{ $in: ['$status', ['completed', 'consultation_completed', 'sent_to_pharmacy', 'pharmacy_completed']] }, 1, 0] } } } },
    { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
    { $unwind: '$dept' },
    { $project: { _id: 1, name: '$dept.name', count: 1, waiting: 1, completed: 1 } },
    { $sort: { count: -1 } },
  ]);
  res.status(200).json({ success: true, data: stats });
});
