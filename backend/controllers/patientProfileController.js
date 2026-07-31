const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

const Patient = require('../models/Patient');
const OPRegistration = require('../models/OPRegistration');
const IPAdmission = require('../models/IPAdmission');
const Bill = require('../models/Bill');
const LabTest = require('../models/LabTest');
const Prescription = require('../models/Prescription');
const Operation = require('../models/Operation');
const Document = require('../models/Document');
const ActivityLog = require('../models/ActivityLog');

const DOC_POP = { path: 'doctor', select: 'name role' };
const DEPT_POP = { path: 'department', select: 'name color' };

const getPatientOr404 = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return Patient.findById(id);
};

// ---------------------------------------------------------------------------
// SECTION 1 — Patient Summary
// ---------------------------------------------------------------------------
exports.getSummary = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const [
    totalOPVisits,
    totalAdmissions,
    activeAdmission,
    totalOperations,
    bills,
    lastVisit,
  ] = await Promise.all([
    OPRegistration.countDocuments({ patient: patient._id }),
    IPAdmission.countDocuments({ patient: patient._id }),
    IPAdmission.findOne({ patient: patient._id, status: 'admitted' }).select('_id admissionNumber'),
    Operation.countDocuments({ patient: patient._id }),
    Bill.find({ patient: patient._id }).select('totalAmount paidAmount dueAmount status'),
    OPRegistration.findOne({ patient: patient._id }).sort({ createdAt: -1 }).select('createdAt'),
  ]);

  const totalProcedures = await IPAdmission.aggregate([
    { $match: { patient: patient._id } },
    { $project: { count: { $size: { $ifNull: ['$serviceUsages', []] } } } },
    { $group: { _id: null, total: { $sum: '$count' } } },
  ]);

  const totalBilled = bills.reduce((s, b) => s + (b.totalAmount || 0), 0);
  const totalPaid = bills.reduce((s, b) => s + (b.paidAmount || 0), 0);
  const outstanding = bills.reduce((s, b) => s + (b.dueAmount || 0), 0);

  res.status(200).json({
    success: true,
    data: {
      patient,
      currentStatus: activeAdmission ? 'Admitted' : 'Outpatient / Discharged',
      currentAdmission: activeAdmission || null,
      stats: {
        totalVisits: totalOPVisits + totalAdmissions,
        totalOPVisits,
        totalAdmissions,
        totalProcedures: totalProcedures[0]?.total || 0,
        totalOperations,
        totalBills: bills.length,
        totalBilled,
        totalPaid,
        outstandingAmount: outstanding,
      },
      lastVisit: lastVisit?.createdAt || null,
    },
  });
});

// ---------------------------------------------------------------------------
// SECTION 2 — Patient Timeline (unified chronological feed)
// ---------------------------------------------------------------------------
exports.getTimeline = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const [opVisits, admissions, labTests, prescriptions, operations, bills] = await Promise.all([
    OPRegistration.find({ patient: patient._id }).populate(DOC_POP).populate(DEPT_POP).lean(),
    IPAdmission.find({ patient: patient._id }).populate(DOC_POP).lean(),
    LabTest.find({ patient: patient._id }).populate(DOC_POP).lean(),
    Prescription.find({ patient: patient._id }).populate(DOC_POP).lean(),
    Operation.find({ patient: patient._id }).populate('surgeon', 'name').lean(),
    Bill.find({ patient: patient._id }).lean(),
  ]);

  const events = [];

  events.push({ type: 'Registration', date: patient.createdAt, title: 'Patient Registered', refId: patient._id });

  opVisits.forEach((v) => events.push({
    type: 'OP Visit', date: v.createdAt, title: `OP Visit - ${v.department?.name || ''}`.trim(),
    subtitle: v.doctor?.name ? `Dr. ${v.doctor.name}` : undefined, status: v.status, refId: v._id,
  }));

  admissions.forEach((a) => {
    events.push({ type: 'Admission', date: a.admissionDate, title: `Admitted - ${a.admissionNumber}`, subtitle: a.doctor?.name ? `Dr. ${a.doctor.name}` : undefined, refId: a._id });
    (a.transferHistory || []).forEach((t) => events.push({ type: 'Room Transfer', date: t.transferDate, title: 'Bed/Room Transfer', subtitle: t.reason, refId: a._id }));
    (a.doctorRounds || []).forEach((r) => events.push({ type: 'Doctor Round', date: r.visitTime, title: 'Doctor Round', subtitle: r.notes, refId: a._id }));
    if (a.dischargeDate) events.push({ type: 'Discharge', date: a.dischargeDate, title: `Discharged - ${a.admissionNumber}`, subtitle: a.dischargeType, refId: a._id });
    if (a.followUpDate) events.push({ type: 'Follow Up', date: a.followUpDate, title: 'Follow Up Scheduled', refId: a._id });
  });

  labTests.forEach((l) => events.push({ type: 'Lab Test', date: l.createdAt, title: `Lab - ${l.labType}`, subtitle: l.doctor?.name ? `Ordered by Dr. ${l.doctor.name}` : undefined, status: l.status, refId: l._id }));

  prescriptions.forEach((p) => events.push({ type: 'Medicine', date: p.createdAt, title: 'Medicine Prescribed', subtitle: p.doctor?.name ? `Dr. ${p.doctor.name}` : undefined, refId: p._id }));

  operations.forEach((o) => events.push({ type: 'Operation', date: o.startTime || o.scheduledDate, title: o.operationName, subtitle: o.surgeon?.name ? `Dr. ${o.surgeon.name}` : undefined, refId: o._id }));

  bills.forEach((b) => {
    events.push({ type: 'Bill', date: b.createdAt, title: `Bill ${b.billNumber}`, subtitle: `₹${b.totalAmount}`, status: b.status, refId: b._id });
    (b.payments || []).forEach((p) => events.push({ type: 'Payment', date: p.paidAt, title: `Payment ₹${p.amount} (${p.mode})`, refId: b._id }));
  });

  const timeline = events.filter((e) => e.date).sort((a, b) => new Date(b.date) - new Date(a.date));

  res.status(200).json({ success: true, count: timeline.length, data: timeline });
});

// ---------------------------------------------------------------------------
// SECTION 3 — OP History
// ---------------------------------------------------------------------------
exports.getOPHistory = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const visits = await OPRegistration.find({ patient: patient._id })
    .populate(DOC_POP).populate(DEPT_POP)
    .populate({ path: 'prescriptions', select: 'medicines status' })
    .populate({ path: 'labTests', select: 'labNumber labType status' })
    .populate({ path: 'bill', select: 'billNumber totalAmount paidAmount dueAmount status' })
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({ success: true, count: visits.length, data: visits });
});

// ---------------------------------------------------------------------------
// SECTION 4 — IP Admission History (list)
// ---------------------------------------------------------------------------
exports.getIPHistory = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const admissions = await IPAdmission.find({ patient: patient._id })
    .populate(DOC_POP).populate(DEPT_POP)
    .populate({ path: 'bed', select: 'bedNumber' })
    .populate({ path: 'room', select: 'roomNumber type' })
    .populate({ path: 'ward', select: 'name type' })
    .populate({ path: 'bills', select: 'billNumber totalAmount paidAmount dueAmount status' })
    .sort({ admissionDate: -1 })
    .lean();

  const data = admissions.map((a) => {
    const start = new Date(a.admissionDate);
    const end = a.dischargeDate ? new Date(a.dischargeDate) : new Date();
    const lengthOfStay = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    const totalBill = (a.bills || []).reduce((s, b) => s + (b.totalAmount || 0), 0);
    const paid = (a.bills || []).reduce((s, b) => s + (b.paidAmount || 0), 0);
    const outstanding = (a.bills || []).reduce((s, b) => s + (b.dueAmount || 0), 0);
    return { ...a, lengthOfStay, totalBill, paid, outstanding };
  });

  res.status(200).json({ success: true, count: data.length, data });
});

// ---------------------------------------------------------------------------
// SECTION 5 — Complete Admission Detail (drill-down)
// ---------------------------------------------------------------------------
exports.getAdmissionDetail = asyncHandler(async (req, res, next) => {
  const { id, admissionId } = req.params;
  const patient = await getPatientOr404(id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const admission = await IPAdmission.findOne({ _id: admissionId, patient: patient._id })
    .populate(DOC_POP).populate(DEPT_POP)
    .populate({ path: 'bed', select: 'bedNumber type' })
    .populate({ path: 'room', select: 'roomNumber type dailyCharge' })
    .populate({ path: 'ward', select: 'name type' })
    .populate({ path: 'nursingNotes.nurse', select: 'name' })
    .populate({ path: 'doctorRounds.doctor', select: 'name' })
    .populate({ path: 'serviceUsages.administeredBy', select: 'name' })
    .populate({ path: 'medications.administeredBy', select: 'name' })
    .populate({ path: 'transferHistory.fromBed transferHistory.toBed', select: 'bedNumber' })
    .populate({ path: 'prescriptions', select: 'medicines diagnosis status createdAt' })
    .populate({ path: 'labTests', select: 'labNumber labType status createdAt' })
    .populate({ path: 'bills' })
    .lean();

  if (!admission) return next(new ErrorResponse('Admission not found', 404));

  const [operations, documents] = await Promise.all([
    Operation.find({ ipAdmission: admission._id }).populate('surgeon assistants anesthetist', 'name').lean(),
    Document.find({ ipAdmission: admission._id, isActive: true }).lean(),
  ]);

  res.status(200).json({ success: true, data: { ...admission, operations, documents } });
});

// ---------------------------------------------------------------------------
// SECTION 6 — Room / Bed History (across all admissions)
// ---------------------------------------------------------------------------
exports.getRoomHistory = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const admissions = await IPAdmission.find({ patient: patient._id })
    .populate({ path: 'room', select: 'roomNumber type dailyCharge' })
    .populate({ path: 'bed', select: 'bedNumber type dailyRate' })
    .populate({ path: 'ward', select: 'name type' })
    .populate({ path: 'transferHistory.fromBed transferHistory.toBed', select: 'bedNumber type' })
    .select('admissionNumber admissionDate dischargeDate room bed ward transferHistory')
    .sort({ admissionDate: -1 })
    .lean();

  const rows = [];
  admissions.forEach((a) => {
    rows.push({
      admissionNumber: a.admissionNumber,
      ward: a.ward?.name, room: a.room?.roomNumber, bed: a.bed?.bedNumber,
      type: a.room?.type || a.bed?.type,
      fromDate: a.admissionDate, toDate: a.dischargeDate,
      charges: a.room?.dailyCharge || a.bed?.dailyRate || 0,
      reason: 'Admission',
    });
    (a.transferHistory || []).forEach((t) => rows.push({
      admissionNumber: a.admissionNumber,
      fromBed: t.fromBed?.bedNumber, toBed: t.toBed?.bedNumber,
      fromDate: t.transferDate, toDate: null, reason: t.reason || 'Transfer',
    }));
  });

  res.status(200).json({ success: true, count: rows.length, data: rows });
});

// ---------------------------------------------------------------------------
// SECTION 7 — Doctor History (every doctor who treated this patient)
// ---------------------------------------------------------------------------
exports.getDoctorHistory = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const [opAgg, ipAgg, opAgg2, opsAgg, revenueBills] = await Promise.all([
    OPRegistration.aggregate([
      { $match: { patient: patient._id, doctor: { $ne: null } } },
      { $group: { _id: '$doctor', visits: { $sum: 1 } } },
    ]),
    IPAdmission.aggregate([
      { $match: { patient: patient._id, doctor: { $ne: null } } },
      { $group: { _id: '$doctor', admissions: { $sum: 1 } } },
    ]),
    IPAdmission.aggregate([
      { $match: { patient: patient._id } },
      { $unwind: { path: '$serviceUsages', preserveNullAndEmptyArrays: false } },
      { $match: { 'serviceUsages.administeredBy': { $ne: null } } },
      { $group: { _id: '$serviceUsages.administeredBy', procedures: { $sum: 1 } } },
    ]),
    Operation.aggregate([
      { $match: { patient: patient._id } },
      { $group: { _id: '$surgeon', operations: { $sum: 1 } } },
    ]),
    Bill.find({ patient: patient._id, doctor: { $ne: null } }).select('doctor totalAmount').lean(),
  ]);

  const byDoctor = {};
  const ensure = (id) => {
    const key = String(id);
    if (!byDoctor[key]) byDoctor[key] = { doctorId: id, visits: 0, admissions: 0, procedures: 0, operations: 0, revenue: 0 };
    return byDoctor[key];
  };
  opAgg.forEach((r) => { ensure(r._id).visits = r.visits; });
  ipAgg.forEach((r) => { ensure(r._id).admissions = r.admissions; });
  opAgg2.forEach((r) => { ensure(r._id).procedures = r.procedures; });
  opsAgg.forEach((r) => { ensure(r._id).operations = r.operations; });
  revenueBills.forEach((b) => { ensure(b.doctor).revenue += (b.totalAmount || 0); });

  const User = require('../models/User');
  const ids = Object.values(byDoctor).map((d) => d.doctorId);
  const users = await User.find({ _id: { $in: ids } }).select('name role department').populate('department', 'name').lean();
  const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]));

  const data = Object.values(byDoctor).map((d) => ({
    ...d,
    doctorName: userMap[String(d.doctorId)]?.name || 'Unknown',
    department: userMap[String(d.doctorId)]?.department?.name,
  })).sort((a, b) => (b.visits + b.admissions) - (a.visits + a.admissions));

  res.status(200).json({ success: true, count: data.length, data });
});

// ---------------------------------------------------------------------------
// SECTION 8 — Medicine History (OP prescriptions + IP MAR)
// ---------------------------------------------------------------------------
exports.getMedicineHistory = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const [prescriptions, admissions] = await Promise.all([
    Prescription.find({ patient: patient._id }).populate('doctor', 'name').sort({ createdAt: -1 }).lean(),
    IPAdmission.find({ patient: patient._id }).select('admissionNumber medications').populate('medications.administeredBy', 'name').lean(),
  ]);

  const rows = [];
  prescriptions.forEach((p) => (p.medicines || []).forEach((m) => rows.push({
    source: 'OP Prescription', admissionNumber: null,
    medicine: m.medicineName, dose: m.dosage, frequency: m.frequency, duration: m.duration,
    doctor: p.doctor?.name, route: m.route, dispensed: m.dispensed,
    date: p.createdAt,
  })));
  admissions.forEach((a) => (a.medications || []).forEach((m) => rows.push({
    source: 'IP Administration', admissionNumber: a.admissionNumber,
    medicine: m.medicineName, dose: m.dosage, frequency: m.frequency, route: m.route,
    administeredBy: m.administeredBy?.name, batchNumber: m.batchNumber,
    date: m.administeredAt,
  })));

  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.status(200).json({ success: true, count: rows.length, data: rows });
});

// ---------------------------------------------------------------------------
// SECTION 9 & 10 — Lab + Radiology History (LabTest model covers both)
// ---------------------------------------------------------------------------
exports.getLabHistory = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const RADIOLOGY_TYPES = ['Radiology', 'Ultrasound', 'X-Ray', 'CT Scan', 'MRI'];
  const filter = { patient: patient._id };
  if (req.query.type === 'radiology') filter.labType = { $in: RADIOLOGY_TYPES };
  if (req.query.type === 'lab') filter.labType = { $nin: RADIOLOGY_TYPES };

  const tests = await LabTest.find(filter)
    .populate('doctor', 'name').populate('opRegistration', 'tokenNumber').populate('ipAdmission', 'admissionNumber')
    .sort({ createdAt: -1 }).lean();

  res.status(200).json({ success: true, count: tests.length, data: tests });
});

// ---------------------------------------------------------------------------
// SECTION 11 — Procedure History (bedside procedures from serviceUsages)
// ---------------------------------------------------------------------------
exports.getProcedureHistory = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const admissions = await IPAdmission.find({ patient: patient._id })
    .select('admissionNumber serviceUsages')
    .populate('serviceUsages.administeredBy', 'name')
    .lean();

  const rows = [];
  admissions.forEach((a) => (a.serviceUsages || [])
    .filter((s) => ['Procedure', 'Injection', 'Nursing', 'Other'].includes(s.category))
    .forEach((s) => rows.push({
      admissionNumber: a.admissionNumber,
      procedure: s.serviceName, category: s.category, quantity: s.quantity,
      unitPrice: s.unitPrice, administeredBy: s.administeredBy?.name,
      date: s.usedAt, notes: s.notes,
    })));

  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.status(200).json({ success: true, count: rows.length, data: rows });
});

// ---------------------------------------------------------------------------
// SECTION 12 — Machine / Equipment Usage History
// ---------------------------------------------------------------------------
exports.getMachineHistory = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const admissions = await IPAdmission.find({ patient: patient._id })
    .select('admissionNumber serviceUsages department')
    .populate('serviceUsages.administeredBy', 'name')
    .populate('department', 'name')
    .lean();

  const rows = [];
  admissions.forEach((a) => (a.serviceUsages || [])
    .filter((s) => s.category === 'Equipment')
    .forEach((s) => rows.push({
      admissionNumber: a.admissionNumber, machine: s.serviceName,
      department: a.department?.name, operator: s.administeredBy?.name,
      startTime: s.usedAt, chargeType: s.chargeType, quantity: s.quantity,
      charges: s.unitPrice * s.quantity, remarks: s.notes,
    })));

  rows.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  res.status(200).json({ success: true, count: rows.length, data: rows });
});

// ---------------------------------------------------------------------------
// SECTION 13 — Operation History
// ---------------------------------------------------------------------------
exports.getOperationHistory = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const operations = await Operation.find({ patient: patient._id })
    .populate('surgeon assistants anesthetist', 'name role')
    .populate('department', 'name')
    .populate('ipAdmission', 'admissionNumber')
    .sort({ startTime: -1 })
    .lean();

  res.status(200).json({ success: true, count: operations.length, data: operations });
});

exports.createOperation = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const Counter = require('../models/Counter');
  const seq = await Counter.getNextSeq('operation');
  const operationNumber = `OT${new Date().getFullYear().toString().slice(-2)}${String(seq).padStart(5, '0')}`;

  const operation = await Operation.create({
    ...req.body, patient: patient._id, operationNumber, createdBy: req.user._id,
  });

  res.status(201).json({ success: true, data: operation });
});

// ---------------------------------------------------------------------------
// SECTION 14 & 15 — Billing + Payment History
// ---------------------------------------------------------------------------
exports.getBillingHistory = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const bills = await Bill.find({ patient: patient._id })
    .populate('doctor', 'name').populate('department', 'name')
    .populate('opRegistration', 'tokenNumber').populate('ipAdmission', 'admissionNumber')
    .sort({ createdAt: -1 }).lean();

  res.status(200).json({ success: true, count: bills.length, data: bills });
});

exports.getPaymentHistory = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const bills = await Bill.find({ patient: patient._id }).select('billNumber payments').lean();
  const rows = [];
  bills.forEach((b) => (b.payments || []).forEach((p) => rows.push({
    billNumber: b.billNumber, amount: p.amount, mode: p.mode, reference: p.reference, paidAt: p.paidAt,
  })));
  rows.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));

  res.status(200).json({ success: true, count: rows.length, data: rows });
});

// ---------------------------------------------------------------------------
// SECTION 16 — Document History
// ---------------------------------------------------------------------------
exports.getDocumentHistory = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const filter = { patient: patient._id, isActive: true };
  if (req.query.category) filter.category = req.query.category;

  const documents = await Document.find(filter).populate('uploadedBy', 'name').sort({ createdAt: -1 }).lean();
  res.status(200).json({ success: true, count: documents.length, categories: Document.CATEGORIES, data: documents });
});

exports.uploadDocument = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const { category, title, fileUrl, fileType, notes, ipAdmission, opRegistration } = req.body;
  if (!category || !title || !fileUrl) return next(new ErrorResponse('category, title and fileUrl are required', 400));

  const doc = await Document.create({
    patient: patient._id, category, title, fileUrl, fileType, notes, ipAdmission, opRegistration,
    uploadedBy: req.user._id,
  });

  res.status(201).json({ success: true, data: doc });
});

exports.deleteDocument = asyncHandler(async (req, res, next) => {
  const doc = await Document.findOneAndUpdate(
    { _id: req.params.docId, patient: req.params.id },
    { isActive: false },
    { new: true },
  );
  if (!doc) return next(new ErrorResponse('Document not found', 404));
  res.status(200).json({ success: true, data: doc });
});

// ---------------------------------------------------------------------------
// SECTION 17 — Alerts
// ---------------------------------------------------------------------------
exports.getAlerts = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const alerts = [];
  if (patient.allergies?.length) alerts.push({ type: 'Drug/Food Allergy', level: 'critical', detail: patient.allergies.join(', ') });
  if (patient.bloodGroup) alerts.push({ type: 'Blood Group', level: 'info', detail: patient.bloodGroup });
  (patient.chronicConditions || []).forEach((c) => {
    const lc = c.toLowerCase();
    let level = 'warning';
    if (lc.includes('cardiac') || lc.includes('heart')) alerts.push({ type: 'Cardiac', level: 'critical', detail: c });
    else if (lc.includes('diabet')) alerts.push({ type: 'Diabetic', level, detail: c });
    else if (lc.includes('hypertens') || lc.includes('bp')) alerts.push({ type: 'Hypertension', level, detail: c });
    else alerts.push({ type: 'Chronic Condition', level, detail: c });
  });

  const activeAdmission = await IPAdmission.findOne({ patient: patient._id, status: 'admitted' }).select('admissionType ward').populate('ward', 'type');
  if (activeAdmission?.ward?.type === 'icu') alerts.push({ type: 'Critical / ICU', level: 'critical', detail: 'Currently in ICU' });

  res.status(200).json({ success: true, count: alerts.length, data: alerts });
});

// ---------------------------------------------------------------------------
// SECTION 18 — Audit History
// ---------------------------------------------------------------------------
exports.getAuditHistory = asyncHandler(async (req, res, next) => {
  const patient = await getPatientOr404(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  const [opIds, ipIds, billIds, labIds, presIds, opsIds] = await Promise.all([
    OPRegistration.find({ patient: patient._id }).distinct('_id'),
    IPAdmission.find({ patient: patient._id }).distinct('_id'),
    Bill.find({ patient: patient._id }).distinct('_id'),
    LabTest.find({ patient: patient._id }).distinct('_id'),
    Prescription.find({ patient: patient._id }).distinct('_id'),
    Operation.find({ patient: patient._id }).distinct('_id'),
  ]);

  const relatedIds = [patient._id, ...opIds, ...ipIds, ...billIds, ...labIds, ...presIds, ...opsIds].map(String);

  const logs = await ActivityLog.find({ relatedId: { $in: relatedIds } })
    .populate('user', 'name role')
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  res.status(200).json({ success: true, count: logs.length, data: logs });
});
