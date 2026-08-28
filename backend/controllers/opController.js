const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const OPRegistration = require('../models/OPRegistration');
const Patient = require('../models/Patient');
const IPAdmission = require('../models/IPAdmission');
const Prescription = require('../models/Prescription');
const LabTest = require('../models/LabTest');
const Bill = require('../models/Bill');
const User = require('../models/User');
const Department = require('../models/Department');
const logger = require('../utils/logger');
const { allocateDailyOpToken, allocateBillNumber } = require('../utils/generateId');
const { withOrganization } = require('../middleware/tenant');
const { istDayBounds, kolkataToday } = require('../utils/istDay');
const { markSourcesAsBilled } = require('../services/billingService');
const {
  EMERGENCY_SURCHARGE,
  resolveOpConsultationFee,
  resolveBilledConsultationFee,
  defaultPaymentPurpose,
} = require('../utils/opConsultationFee');

const PAYMENT_MODES = ['cash', 'card', 'upi', 'cheque', 'insurance', 'online'];
const BILL_PRINT_POPULATE = [
  { path: 'patient', select: 'patientId name age gender phone address' },
  { path: 'doctor', select: 'name specialization' },
  { path: 'department', select: 'name' },
  { path: 'createdBy', select: 'name' },
  { path: 'opRegistration', select: 'tokenNumber tokenDate appointmentType queueFor' },
];

async function createOpConsultationBill(req, op, payment) {
  const doctorId = op.doctor?._id || op.doctor;
  const departmentId = op.department?._id || op.department;
  const [doctorDoc, deptDoc] = await Promise.all([
    doctorId ? User.findById(doctorId).select('name consultationFee followUpFee specialization').setOptions({ skipOrganizationFilter: true }) : null,
    departmentId ? Department.findById(departmentId).select('name consultationFee').setOptions({ skipOrganizationFilter: true }) : null,
  ]);

  const masterFee = resolveOpConsultationFee(doctorDoc, deptDoc, op.appointmentType);
  const consultFee = resolveBilledConsultationFee(
    masterFee,
    payment?.consultationFee,
    op.billedConsultationFee,
  );
  if (op.billedConsultationFee !== consultFee) {
    op.billedConsultationFee = consultFee;
    await OPRegistration.updateOne({ _id: op._id }, { billedConsultationFee: consultFee });
  }
  const purpose = String(payment.paymentPurpose || '').trim() || defaultPaymentPurpose(op.appointmentType);
  const doctorName = (() => {
    const cleaned = String(doctorDoc?.name || '').replace(/^(dr\.?\s*)+/i, '').trim();
    return cleaned ? `Dr. ${cleaned}` : 'N/A';
  })();
  const deptName = deptDoc?.name || 'OPD';

  const items = [{
    category: 'Consultation',
    type: 'consultation',
    description: `${purpose} — Dr. ${doctorName} (${deptName}) · Token ${op.tokenNumber}`,
    name: purpose,
    quantity: 1,
    unitPrice: consultFee,
    gstPercent: 0,
    gstAmount: 0,
    totalAmount: consultFee,
    referenceId: op._id,
    referenceModel: 'OPRegistration',
  }];

  if (op.appointmentType === 'emergency') {
    items.push({
      category: 'Procedure',
      type: 'procedure',
      description: `Emergency consultation surcharge - Token ${op.tokenNumber || ''}`,
      name: 'Emergency consultation surcharge',
      quantity: 1,
      unitPrice: EMERGENCY_SURCHARGE,
      gstPercent: 0,
      gstAmount: 0,
      totalAmount: EMERGENCY_SURCHARGE,
      referenceId: op._id,
      referenceModel: 'OPRegistration',
    });
  }

  const total = items.reduce((sum, item) => sum + item.totalAmount, 0);
  const rawPaid = payment.paidAmount;
  const paidParsed = Number(rawPaid);
  const paidAmount = (rawPaid === '' || rawPaid == null || !Number.isFinite(paidParsed))
    ? total
    : Math.max(0, paidParsed);
  const paymentMode = PAYMENT_MODES.includes(payment.paymentMode) ? payment.paymentMode : 'cash';
  const tokenWhen = op.tokenDate instanceof Date ? op.tokenDate.toISOString() : String(op.tokenDate || '');

  const billNumber = await allocateBillNumber();
  const payload = withOrganization(req, {
    billNumber,
    billType: 'op',
    patient: op.patient?._id || op.patient,
    doctor: doctorId,
    department: departmentId,
    opRegistration: op._id,
    items,
    paidAmount,
    paymentMode,
    payments: paidAmount > 0
      ? [{ amount: paidAmount, mode: paymentMode, receivedBy: req.user._id, paidAt: new Date() }]
      : [],
    notes: `OP registered ${tokenWhen} · Token ${op.tokenNumber} · ${purpose}`,
    createdBy: req.user._id,
  });

  const bill = await Bill.create(payload);
  await markSourcesAsBilled(payload.items, bill._id);
  return Bill.findById(bill._id).populate(BILL_PRINT_POPULATE);
}

async function findOpConsultBill(opId, req) {
  const consultFilter = {
    opRegistration: opId,
    status: { $ne: 'cancelled' },
    $or: [
      { billType: 'op' },
      { 'items.type': 'consultation' },
      { 'items.category': 'Consultation' },
    ],
  };

  const bill = await Bill.findOne(consultFilter)
    .sort({ createdAt: 1 })
    .populate(BILL_PRINT_POPULATE);
  if (bill) return bill;

  const unscoped = await Bill.findOne(consultFilter)
    .setOptions({ skipOrganizationFilter: true })
    .sort({ createdAt: 1 })
    .populate(BILL_PRINT_POPULATE);
  if (!unscoped) return null;

  const reqOrg = req?.organizationId || req?.tenant?.organizationId;
  if (!unscoped.organizationId || !reqOrg || String(unscoped.organizationId) === String(reqOrg)) {
    return unscoped;
  }
  return null;
}

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
    .populate('serviceUsages.administeredBy', 'name')
    .populate({ path: 'bill', populate: BILL_PRINT_POPULATE });
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
  let consultBill = await findOpConsultBill(op._id, req);
  const shouldEnsure = req.query.ensureBill === '1' || req.query.ensureBill === 'true';
  if (!consultBill && shouldEnsure) {
    try {
      consultBill = await createOpConsultationBill(req, op, {
        paidAmount: undefined,
        paymentMode: 'cash',
        paymentPurpose: defaultPaymentPurpose(op.appointmentType),
        consultationFee: op.billedConsultationFee,
      });
    } catch (err) {
      logger.error(`OP consultation bill ensure failed for ${op._id}: ${err.message}`, { stack: err.stack });
    }
  }
  if (consultBill) data.bill = consultBill;
  data.labs = labs;
  data.pharmacyMedicines = buildPharmacyMedicines(prescriptions, bills);
  data.prescriptions = prescriptions;

  res.status(200).json({ success: true, data });
});

exports.getTodaysQueue = asyncHandler(async (req, res) => {
  const { from, to } = istDayBounds(req.query.date || kolkataToday());

  const filter = { tokenDate: { $gte: from, $lt: to } };
  if (req.query.department) filter.department = req.query.department;
  if (req.query.doctor) filter.doctor = req.query.doctor;
  if (req.user.role === 'Doctor' && !req.query.doctor) filter.doctor = req.user._id;

  const queue = await OPRegistration.find(filter)
    .populate('patient', 'patientId name age gender phone address')
    .populate('doctor', 'name specialization')
    .populate('department', 'name')
    .populate('bill', 'billNumber paidAmount totalAmount dueAmount status paymentMode')
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
  const { from, to } = istDayBounds(req.query.date || kolkataToday());
  const doctorId = req.query.doctor || req.user._id;

  const queue = await OPRegistration.find({
    tokenDate: { $gte: from, $lt: to },
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
  const payment = {
    paidAmount: req.body.paidAmount,
    paymentMode: req.body.paymentMode,
    paymentPurpose: req.body.paymentPurpose,
    consultationFee: req.body.consultationFee,
  };
  delete req.body.paidAmount;
  delete req.body.paymentMode;
  delete req.body.paymentPurpose;
  delete req.body.consultationFee;

  // Allow backdating OP visits via visitDate / scheduledTime from the registration form.
  // "Today" is the India calendar day and resets at 12:00 AM IST.
  let tokenDate = new Date();
  if (req.body.scheduledTime) {
    const scheduled = new Date(req.body.scheduledTime);
    if (!Number.isNaN(scheduled.getTime())) tokenDate = scheduled;
  } else if (req.body.visitDate) {
    const visitIso = String(req.body.visitDate).slice(0, 10);
    const visitTime = String(req.body.visitTime || '').slice(0, 5);
    const utcIso = new Date().toISOString().slice(0, 10);
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(visitIso)
      && visitIso !== kolkataToday()
      && visitIso !== utcIso
    ) {
      const hhmm = /^\d{2}:\d{2}$/.test(visitTime) ? visitTime : '09:00';
      const parsed = new Date(`${visitIso}T${hhmm}:00.000+05:30`);
      if (!Number.isNaN(parsed.getTime())) tokenDate = parsed;
    }
  }

  req.body.tokenNumber = await allocateDailyOpToken(tokenDate, req.organizationId);
  req.body.tokenDate = tokenDate;
  req.body.registeredBy = req.user._id;
  delete req.body.visitDate;
  delete req.body.visitTime;

  const op = await OPRegistration.create(req.body);
  await Patient.findByIdAndUpdate(req.body.patient, { $push: { visits: op._id } });

  let bill = null;
  try {
    bill = await createOpConsultationBill(req, op, payment);
  } catch (err) {
    logger.error(`OP consultation bill failed for token ${op.tokenNumber}: ${err.message}`, { stack: err.stack });
  }

  const populatedDoc = await OPRegistration.findById(op._id)
    .populate('patient', 'patientId name age gender phone address')
    .populate('doctor', 'name specialization')
    .populate('department', 'name');

  const populated = populatedDoc.toObject();
  if (bill) populated.bill = bill;

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

  res.status(201).json({ success: true, data: populated, bill });
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
  const { from, to } = istDayBounds(kolkataToday());
  const stats = await OPRegistration.aggregate([
    { $match: { tokenDate: { $gte: from, $lt: to } } },
    { $group: { _id: '$department', count: { $sum: 1 }, waiting: { $sum: { $cond: [{ $eq: ['$status', 'waiting'] }, 1, 0] } }, completed: { $sum: { $cond: [{ $in: ['$status', ['completed', 'consultation_completed', 'sent_to_pharmacy', 'pharmacy_completed']] }, 1, 0] } } } },
    { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
    { $unwind: '$dept' },
    { $project: { _id: 1, name: '$dept.name', count: 1, waiting: 1, completed: 1 } },
    { $sort: { count: -1 } },
  ]);
  res.status(200).json({ success: true, data: stats });
});