const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const IPAdmission = require('../models/IPAdmission');
const { generateDischargeSummaryPDF } = require('../utils/pdfGenerator');
const { normalizeRole } = require('../utils/roles');

const DISCHARGE_REQUIRED_FIELDS = [
  'diagnosis', 'treatmentGiven', 'clinicalFindings',
  'hospitalCourse', 'medicationsOnDischarge', 'followUpAdvice', 'dischargeInstructions',
];

const buildDischargeSummaryText = (details = {}) => {
  const sections = [
    ['Diagnosis', details.diagnosis],
    ['Treatment Given', details.treatmentGiven],
    ['Procedures', details.procedures],
    ['Clinical Findings', details.clinicalFindings],
    ['Hospital Course', details.hospitalCourse],
    ['Medications On Discharge', details.medicationsOnDischarge],
    ['Follow-up Advice', details.followUpAdvice],
    ['Discharge Instructions', details.dischargeInstructions],
  ];
  return sections.filter(([, v]) => v).map(([k, v]) => `${k}:\n${v}`).join('\n\n');
};

const isDischargeSummaryComplete = (admission) => {
  const d = admission.dischargeDetails || {};
  return DISCHARGE_REQUIRED_FIELDS.every((f) => d[f] && String(d[f]).trim());
};
const Bed = require('../models/Bed');
const Room = require('../models/Room');
const Patient = require('../models/Patient');
const OPRegistration = require('../models/OPRegistration');
const Counter = require('../models/Counter');
const { generateAdmissionNo } = require('../utils/generateId');
const { occupyBedAndRoom, releaseBedAndRoom } = require('../utils/roomBedSync');

exports.getAdmissions = asyncHandler(async (req, res) => {
  res.status(200).json(res.advancedResults);
});

exports.getAdmission = asyncHandler(async (req, res, next) => {
  const admission = await IPAdmission.findById(req.params.id)
    .populate('patient')
    .populate('doctor', 'name specialization')
    .populate('department', 'name')
    .populate('bed', 'bedNumber type dailyRate roomNumber floor')
    .populate('room', 'roomNumber type floor dailyCharge bedNumber')
    .populate('ward', 'name type')
    .populate('nursingNotes.nurse', 'name')
    .populate('doctorRounds.doctor', 'name');
  if (!admission) return next(new ErrorResponse('Admission not found', 404));
  res.status(200).json({ success: true, data: admission });
});

exports.createAdmission = asyncHandler(async (req, res, next) => {
  if (!req.body.bed && !req.body.room) {
    return next(new ErrorResponse('Please select an available bed or room', 400));
  }

  let bedId = req.body.bed;
  let roomId = req.body.room;

  if (roomId && !bedId) {
    const room = await Room.findById(roomId);
    if (!room) return next(new ErrorResponse('Room not found', 404));
    if (room.status !== 'available') return next(new ErrorResponse('Selected room is not available', 400));
    bedId = room.bed;
  }

  if (bedId) {
    const bed = await Bed.findById(bedId);
    if (!bed) return next(new ErrorResponse('Bed not found', 404));
    if (bed.status !== 'available') return next(new ErrorResponse('Selected bed is not available', 400));
    req.body.bed = bedId;
    req.body.ward = bed.ward;
    if (bed.room) {
      req.body.room = bed.room;
      roomId = bed.room;
    }
  }

  const seq = await Counter.getNextSeq('admission');
  req.body.admissionNumber = generateAdmissionNo(seq);
  req.body.admittedBy = req.user._id;

  const admission = await IPAdmission.create(req.body);

  await occupyBedAndRoom({
    bedId: req.body.bed,
    roomId: req.body.room,
    patientId: req.body.patient,
    admissionId: admission._id,
  });

  await Patient.findByIdAndUpdate(req.body.patient, { $push: { admissions: admission._id } });

  if (req.body.opRegistration) {
    await OPRegistration.findByIdAndUpdate(req.body.opRegistration, {
      status: 'admitted',
      ipAdmission: admission._id,
    });
  }

  if (req.app.get('io')) req.app.get('io').emit('bed:update', { type: 'admission' });

  const populated = await IPAdmission.findById(admission._id)
    .populate('patient', 'patientId name age gender phone')
    .populate('doctor', 'name')
    .populate('bed', 'bedNumber roomNumber dailyRate')
    .populate('room', 'roomNumber type dailyCharge')
    .populate('department', 'name')
    .populate('ward', 'name');

  res.status(201).json({ success: true, data: populated });
});

exports.addNursingNote = asyncHandler(async (req, res, next) => {
  const admission = await IPAdmission.findByIdAndUpdate(
    req.params.id,
    { $push: { nursingNotes: { note: req.body.note, nurse: req.user._id } } },
    { new: true },
  ).populate('nursingNotes.nurse', 'name');
  if (!admission) return next(new ErrorResponse('Admission not found', 404));
  res.status(200).json({ success: true, data: admission.nursingNotes });
});

// Log a bedside service/equipment usage (Nebulizer, Ventilator, O2, Injection, etc.)
// against an IP admission. Each entry becomes its own billable line item -
// see billingService.getPatientBillableCharges().
exports.addServiceUsage = asyncHandler(async (req, res, next) => {
  const { serviceName, category, chargeType, quantity, unitPrice, usedAt, notes } = req.body;
  if (!serviceName || unitPrice === undefined || unitPrice === null) {
    return next(new ErrorResponse('serviceName and unitPrice are required', 400));
  }

  const admission = await IPAdmission.findById(req.params.id);
  if (!admission) return next(new ErrorResponse('Admission not found', 404));
  if (admission.status === 'discharged') {
    return next(new ErrorResponse('Cannot add charges after discharge. Reopen admission or bill directly.', 400));
  }

  admission.serviceUsages.push({
    serviceName,
    category: category || 'Equipment',
    chargeType: chargeType || 'per_use',
    quantity: Number(quantity) || 1,
    unitPrice: Number(unitPrice),
    usedAt: usedAt || Date.now(),
    administeredBy: req.user._id,
    notes,
  });
  await admission.save();

  const populated = await IPAdmission.findById(admission._id).populate('serviceUsages.administeredBy', 'name');
  res.status(201).json({ success: true, data: populated.serviceUsages });
});

exports.updateServiceUsage = asyncHandler(async (req, res, next) => {
  const admission = await IPAdmission.findById(req.params.id);
  if (!admission) return next(new ErrorResponse('Admission not found', 404));

  const entry = admission.serviceUsages.id(req.params.usageId);
  if (!entry) return next(new ErrorResponse('Service usage entry not found', 404));

  ['serviceName', 'category', 'chargeType', 'quantity', 'unitPrice', 'usedAt', 'notes'].forEach((field) => {
    if (req.body[field] !== undefined) entry[field] = req.body[field];
  });
  await admission.save();

  const populated = await IPAdmission.findById(admission._id).populate('serviceUsages.administeredBy', 'name');
  res.status(200).json({ success: true, data: populated.serviceUsages });
});

exports.deleteServiceUsage = asyncHandler(async (req, res, next) => {
  const admission = await IPAdmission.findById(req.params.id);
  if (!admission) return next(new ErrorResponse('Admission not found', 404));

  const entry = admission.serviceUsages.id(req.params.usageId);
  if (!entry) return next(new ErrorResponse('Service usage entry not found', 404));

  entry.deleteOne();
  await admission.save();

  res.status(200).json({ success: true, data: admission.serviceUsages, message: 'Entry removed' });
});

exports.addDoctorRound = asyncHandler(async (req, res, next) => {
  const admission = await IPAdmission.findByIdAndUpdate(
    req.params.id,
    { $push: { doctorRounds: { ...req.body, doctor: req.user._id } } },
    { new: true },
  ).populate('doctorRounds.doctor', 'name');
  if (!admission) return next(new ErrorResponse('Admission not found', 404));
  res.status(200).json({ success: true, data: admission.doctorRounds });
});

exports.saveDischargeSummary = asyncHandler(async (req, res, next) => {
  const admission = await IPAdmission.findById(req.params.id);
  if (!admission) return next(new ErrorResponse('Admission not found', 404));
  if (admission.status === 'discharged') return next(new ErrorResponse('Patient already discharged', 400));

  const role = normalizeRole(req.user.role);
  if (!['Super Admin', 'Doctor'].includes(role)) {
    return next(new ErrorResponse('Only doctors can create discharge summaries', 403));
  }

  const details = { ...req.body, completedAt: new Date(), completedBy: req.user._id };
  admission.dischargeDetails = { ...admission.dischargeDetails?.toObject?.() || admission.dischargeDetails || {}, ...details };
  admission.finalDiagnosis = details.diagnosis || admission.finalDiagnosis;
  admission.dischargeSummary = buildDischargeSummaryText(admission.dischargeDetails);
  await admission.save();

  const populated = await IPAdmission.findById(admission._id)
    .populate('patient', 'patientId name age gender')
    .populate('doctor', 'name specialization')
    .populate('department', 'name')
    .populate('dischargeDetails.completedBy', 'name');

  res.status(200).json({ success: true, data: populated, message: 'Discharge summary saved' });
});

exports.dischargePatient = asyncHandler(async (req, res, next) => {
  const admission = await IPAdmission.findById(req.params.id);
  if (!admission) return next(new ErrorResponse('Admission not found', 404));
  if (admission.status === 'discharged') return next(new ErrorResponse('Patient already discharged', 400));

  if (req.body.dischargeDetails) {
    admission.dischargeDetails = { ...admission.dischargeDetails?.toObject?.() || {}, ...req.body.dischargeDetails };
    admission.dischargeSummary = buildDischargeSummaryText(admission.dischargeDetails);
    admission.finalDiagnosis = req.body.dischargeDetails.diagnosis || admission.finalDiagnosis;
  }

  if (!isDischargeSummaryComplete(admission)) {
    return next(new ErrorResponse('Complete discharge summary is required before discharge. Doctor must fill all required sections.', 400));
  }

  admission.status = 'discharged';
  admission.dischargeDate = new Date();
  admission.dischargeType = req.body.dischargeType || 'regular';
  if (req.body.dischargeSummary) admission.dischargeSummary = req.body.dischargeSummary;
  if (req.body.finalDiagnosis) admission.finalDiagnosis = req.body.finalDiagnosis;
  await admission.save();

  await releaseBedAndRoom({ bedId: admission.bed, roomId: admission.room });

  const opRegs = await OPRegistration.find({ patient: admission.patient, status: 'admitted' });
  for (const op of opRegs) {
    op.status = 'discharged';
    await op.save();
  }

  if (req.app.get('io')) req.app.get('io').emit('bed:update', { type: 'discharge' });

  res.status(200).json({ success: true, data: admission, message: 'Patient discharged. Room and bed are now available.' });
});

exports.printDischargeSummary = asyncHandler(async (req, res, next) => {
  const admission = await IPAdmission.findById(req.params.id)
    .populate('patient', 'patientId name age gender phone')
    .populate('doctor', 'name specialization')
    .populate('department', 'name');
  if (!admission) return next(new ErrorResponse('Admission not found', 404));
  await generateDischargeSummaryPDF(admission, res);
});

exports.transferBed = asyncHandler(async (req, res, next) => {
  const admission = await IPAdmission.findById(req.params.id);
  if (!admission) return next(new ErrorResponse('Admission not found', 404));

  const newBed = await Bed.findById(req.body.newBed);
  if (!newBed || newBed.status !== 'available') {
    return next(new ErrorResponse('Target bed is not available', 400));
  }

  const oldBed = admission.bed;
  const oldRoom = admission.room;

  admission.transferHistory.push({
    fromBed: oldBed,
    toBed: req.body.newBed,
    transferDate: new Date(),
    reason: req.body.reason,
  });
  admission.bed = req.body.newBed;
  admission.room = newBed.room || null;
  admission.ward = newBed.ward;
  await admission.save();

  await releaseBedAndRoom({ bedId: oldBed, roomId: oldRoom });
  await occupyBedAndRoom({
    bedId: req.body.newBed,
    roomId: newBed.room,
    patientId: admission.patient,
    admissionId: admission._id,
  });

  res.status(200).json({ success: true, data: admission });
});
