const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const OPRegistration = require('../models/OPRegistration');
const Patient = require('../models/Patient');
const IPAdmission = require('../models/IPAdmission');
const Prescription = require('../models/Prescription');
const LabTest = require('../models/LabTest');
const Bill = require('../models/Bill');
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

/** Build print-ready medicine lines from prescriptions + pharmacy bills for this OP visit. */
function buildPharmacyMedicines(prescriptions, bills) {
  const pharmacyMeds = [];
  const seen = new Set();

  for (const rx of prescriptions || []) {
    for (const m of rx.medicines || []) {
      const key = String(m.medicine?._id || m.medicine || m.medicineName || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      pharmacyMeds.push({
        name: m.medicine?.genericName || m.medicineName || m.medicine?.name || 'Medicine',
        drugName: m.medicine?.name || '',
        dosage: m.dosage || '',
        quantity: m.quantity,
        frequency: m.frequency || '',
        duration: m.duration || '',
        instructions: m.instructions || '',
      });
    }
  }

  for (const bill of bills || []) {
    for (const it of bill.items || []) {
      if (it.type !== 'medicine' && it.category !== 'Pharmacy') continue;
      const key = String(it.medicine || it.name || it.description || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      pharmacyMeds.push({
        name: it.genericName || it.description || it.name || 'Medicine',
        drugName: it.name || '',
        dosage: '',
        quantity: it.quantity,
        frequency: '',
        duration: '',
        instructions: '',
      });
    }
  }

  return pharmacyMeds;
}

exports.getOPRegistration = asyncHandler(async (req, res, next) => {
  const op = await OPRegistration.findById(req.params.id)
    .populate('patient', 'patientId name age gender phone address allergies chronicConditions')
    .populate('doctor', 'name specialization')
    .populate('department', 'name')
    .populate('serviceUsages.administeredBy', 'name');
  if (!op) return next(new ErrorResponse('Registration not found', 404));

  const [labs, bills, prescriptions] = await Promise.all([
    LabTest.find({
      $or: [
        { opRegistration: op._id },
        { _id: { $in: op.labTests || [] } },
      ],
      status: { $ne: 'cancelled' },
    })
      .select('labNumber testProfile tests totalAmount status createdAt sampleType labType')
      .sort('createdAt'),
    Bill.find({
      opRegistration: op._id,
      status: { $ne: 'cancelled' },
    }).select('items billNumber createdAt'),
    Prescription.find({
      opRegistration: op._id,
      status: { $ne: 'cancelled' },
    })
      .populate('medicines.medicine', 'name genericName')
      .select('medicines diagnosis status createdAt'),
  ]);

  const data = op.toObject();
  data.labs = labs;
  data.pharmacyMedicines = buildPharmacyMedicines(prescriptions, bills);
  data.prescriptions = prescriptions;

  res.status(200).json({ success: true, data });
});

exports.getTodaysQueue = asyncHandler(async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const filter = { tokenDate: { $gte: today, $lt: tomorrow } };
  if (req.query.department) filter.department = req.query.department;
  if (req.query.doctor) filter.doctor = req.query.doctor;
  if (req.user.role === 'Doctor' && !req.query.doctor) filter.doctor = req.user._id;

  const queue = await OPRegistration.find(filter)
    .populate('patient', 'patientId name age gender phone address')
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
  // Allow backdating OP visits via visitDate / scheduledTime from the registration form
  let tokenDate = new Date();
  if (req.body.scheduledTime) {
    const scheduled = new Date(req.body.scheduledTime);
    if (!Number.isNaN(scheduled.getTime())) tokenDate = scheduled;
  } else if (req.body.visitDate) {
    const visit = new Date(`${req.body.visitDate}T${req.body.visitTime || '00:00'}`);
    if (!Number.isNaN(visit.getTime())) tokenDate = visit;
  }

  const dayStart = new Date(tokenDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const countThatDay = await OPRegistration.countDocuments({
    tokenDate: { $gte: dayStart, $lt: dayEnd },
  });
  req.body.tokenNumber = generateTokenNo(countThatDay + 1);
  req.body.tokenDate = tokenDate;
  req.body.registeredBy = req.user._id;
  delete req.body.visitDate;
  delete req.body.visitTime;

  const op = await OPRegistration.create(req.body);
  await Patient.findByIdAndUpdate(req.body.patient, { $push: { visits: op._id } });

  const populated = await OPRegistration.findById(op._id)
    .populate('patient', 'patientId name age gender phone address')
    .populate('doctor', 'name specialization')
    .populate('department', 'name');

  if (req.app.get('io')) {
    req.app.get('io').emit('queue:update', { type: 'new', data: populated });
    if (populated.doctor) {
      req.app.get('io').to(`doctor:${populated.doctor._id}`).emit('queue:update', { type: 'new', data: populated });
    }
  }

  try {
    const { notifyUser } = require('../utils/notify');
    if (populated.doctor?._id) {
      await notifyUser(req, {
        userId: populated.doctor._id,
        title: 'New patient in queue',
        message: `${populated.patient?.name || 'Patient'} — token ${populated.tokenNumber || ''}`.trim(),
        type: 'queue',
        link: '/op-queue',
        relatedId: populated._id,
        relatedModel: 'OPRegistration',
      });
    }
  } catch (_) { /* ignore */ }

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

  if (req.body.status === 'in_consultation') {
    try {
      const { notifyUser } = require('../utils/notify');
      if (op.doctor?._id) {
        await notifyUser(req, {
          userId: op.doctor._id,
          title: 'Patient called',
          message: `${op.patient?.name || 'Patient'} is in consultation (token ${op.tokenNumber || ''})`.trim(),
          type: 'queue',
          link: '/op-queue',
          relatedId: op._id,
          relatedModel: 'OPRegistration',
        });
      }
    } catch (_) { /* ignore */ }
  }

  res.status(200).json({ success: true, data: op });
});

exports.saveConsultation = asyncHandler(async (req, res, next) => {
  const {
    consultationNotes, diagnosis, vitals, followUpDate, status,
    examinationFindings, investigationsAdvised, chiefComplaint,
  } = req.body;
  const op = await OPRegistration.findByIdAndUpdate(
    req.params.id,
    {
      consultationNotes,
      diagnosis,
      vitals,
      followUpDate,
      examinationFindings,
      investigationsAdvised,
      ...(chiefComplaint !== undefined ? { chiefComplaint } : {}),
      status: status || 'sent_to_pharmacy',
      consultationEnd: new Date(),
    },
    { new: true },
  ).populate('patient doctor department');

  if (!op) return next(new ErrorResponse('Registration not found', 404));

  if (req.app.get('io')) req.app.get('io').emit('queue:update', { type: 'consultation_saved', data: op });

  res.status(200).json({ success: true, data: op });
});

// Log equipment/procedure usage (ECG, Nebulizer, dressing, injection, etc.) against
// an OP visit. Picked up automatically as a billable line by billingService.js the
// next time a bill is generated for this patient - no manual bill entry needed.
exports.addServiceUsage = asyncHandler(async (req, res, next) => {
  const { serviceName, category, chargeType, quantity, unitPrice, usedAt, notes } = req.body;
  if (!serviceName || unitPrice === undefined || unitPrice === null) {
    return next(new ErrorResponse('serviceName and unitPrice are required', 400));
  }

  const op = await OPRegistration.findById(req.params.id);
  if (!op) return next(new ErrorResponse('Registration not found', 404));

  op.serviceUsages.push({
    serviceName,
    category: category || 'Equipment',
    chargeType: chargeType || 'per_use',
    quantity: Number(quantity) || 1,
    unitPrice: Number(unitPrice),
    usedAt: usedAt || Date.now(),
    administeredBy: req.user._id,
    notes,
  });
  await op.save();

  const populated = await OPRegistration.findById(op._id).populate('serviceUsages.administeredBy', 'name');
  res.status(201).json({ success: true, data: populated.serviceUsages });
});

exports.updateServiceUsage = asyncHandler(async (req, res, next) => {
  const op = await OPRegistration.findById(req.params.id);
  if (!op) return next(new ErrorResponse('Registration not found', 404));

  const entry = op.serviceUsages.id(req.params.usageId);
  if (!entry) return next(new ErrorResponse('Service usage entry not found', 404));

  ['serviceName', 'category', 'chargeType', 'quantity', 'unitPrice', 'usedAt', 'notes'].forEach((field) => {
    if (req.body[field] !== undefined) entry[field] = req.body[field];
  });
  await op.save();

  const populated = await OPRegistration.findById(op._id).populate('serviceUsages.administeredBy', 'name');
  res.status(200).json({ success: true, data: populated.serviceUsages });
});

exports.deleteServiceUsage = asyncHandler(async (req, res, next) => {
  const op = await OPRegistration.findById(req.params.id);
  if (!op) return next(new ErrorResponse('Registration not found', 404));

  const entry = op.serviceUsages.id(req.params.usageId);
  if (!entry) return next(new ErrorResponse('Service usage entry not found', 404));

  entry.deleteOne();
  await op.save();

  res.status(200).json({ success: true, data: op.serviceUsages, message: 'Entry removed' });
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