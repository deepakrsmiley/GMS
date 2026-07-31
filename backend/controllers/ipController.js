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
const Medicine = require('../models/Medicine');
const { generateAdmissionNo } = require('../utils/generateId');
const { occupyBedAndRoom, releaseBedAndRoom } = require('../utils/roomBedSync');
const {
  syncCurrentStock,
  deductFromUsableBatches,
  logStockMovement,
  validateDispensable,
} = require('../utils/pharmacyStockHelper');

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
    .populate('doctorRounds.doctor', 'name')
    .populate('serviceUsages.administeredBy', 'name')
    .populate('medications.medicine', 'name genericName category unitOfMeasure')
    .populate('medications.administeredBy', 'name');
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
    .populate('patient', 'patientId name age gender phone address bloodGroup')
    .populate('doctor', 'name specialization')
    .populate('bed', 'bedNumber roomNumber dailyRate type')
    .populate('room', 'roomNumber type dailyCharge floor')
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

// Log a pharmacy medicine given to an IP (admitted) patient during their stay.
// Works just like an OP dispense: stock is deducted from the medicine's usable
// batches (FEFO) the moment it's logged, and a StockMovement audit entry is made.
// Every entry stays on the admission record from admit -> discharge, giving a
// full daily medication history, and is picked up as its own billable line by
// billingService.getPatientBillableCharges() (category: Pharmacy).
exports.addMedication = asyncHandler(async (req, res, next) => {
  const { medicine: medicineId, medicineName, dosage, frequency, route, quantity, administeredAt, notes } = req.body;

  const qty = Number(quantity) || 0;
  if (qty <= 0) return next(new ErrorResponse('Quantity must be greater than zero', 400));
  if (!medicineId && !medicineName) {
    return next(new ErrorResponse('Please select a medicine', 400));
  }

  const admission = await IPAdmission.findById(req.params.id);
  if (!admission) return next(new ErrorResponse('Admission not found', 404));
  if (admission.status === 'discharged') {
    return next(new ErrorResponse('Cannot add medicines after discharge', 400));
  }

  const entry = {
    medicineName: medicineName || 'Medicine',
    dosage,
    frequency: frequency || 'OD',
    route: route || 'oral',
    quantity: qty,
    administeredAt: administeredAt || Date.now(),
    administeredBy: req.user._id,
    notes,
  };

  // If it's a real pharmacy-stocked medicine, deduct stock from usable batches.
  if (medicineId) {
    const medicine = await Medicine.findById(medicineId);
    if (!medicine) return next(new ErrorResponse('Medicine not found', 404));

    const check = validateDispensable(medicine, qty);
    if (!check.ok) return next(new ErrorResponse(check.reason, 400));

    const qtyBefore = medicine.currentStock;
    const { primaryBatch, unallocated } = deductFromUsableBatches(medicine, qty);
    if (unallocated > 0) {
      return next(new ErrorResponse(`${medicine.name}: insufficient non-expired stock`, 400));
    }

    syncCurrentStock(medicine);
    medicine.markModified('batches');
    await medicine.save();

    await logStockMovement({
      medicine,
      batchNumber: primaryBatch,
      type: 'dispense',
      quantityBefore: qtyBefore,
      quantityAfter: medicine.currentStock,
      quantityChanged: -qty,
      unitPrice: medicine.sellingPrice,
      referenceId: admission._id,
      referenceModel: 'IPAdmission',
      userId: req.user._id,
      remarks: `IP medicine given - ${admission.admissionNumber}`,
    });

    entry.medicine = medicine._id;
    entry.medicineName = medicine.name;
    entry.unitPrice = medicine.sellingPrice;
    entry.gstPercent = medicine.gstPercent || 0;
    entry.batchNumber = primaryBatch;
  }

  admission.medications.push(entry);
  await admission.save();

  const populated = await IPAdmission.findById(admission._id)
    .populate('medications.medicine', 'name genericName category unitOfMeasure')
    .populate('medications.administeredBy', 'name');

  res.status(201).json({ success: true, data: populated.medications, message: 'Medicine logged' });
});

exports.deleteMedication = asyncHandler(async (req, res, next) => {
  const admission = await IPAdmission.findById(req.params.id);
  if (!admission) return next(new ErrorResponse('Admission not found', 404));

  const entry = admission.medications.id(req.params.medId);
  if (!entry) return next(new ErrorResponse('Medication entry not found', 404));

  // Return the deducted quantity back to stock, if it was tied to a real medicine.
  if (entry.medicine) {
    const medicine = await Medicine.findById(entry.medicine);
    if (medicine) {
      const qtyBefore = medicine.currentStock;
      let batch = medicine.batches.find((b) => b.batchNumber === entry.batchNumber && !b.isDisposed);
      if (batch) {
        batch.quantity += entry.quantity;
      } else {
        medicine.batches.push({
          batchNumber: entry.batchNumber || `RETURN-${Date.now()}`,
          quantity: entry.quantity,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          receivedDate: new Date(),
        });
      }
      syncCurrentStock(medicine);
      medicine.markModified('batches');
      await medicine.save();

      await logStockMovement({
        medicine,
        batchNumber: entry.batchNumber,
        type: 'stock_adjustment_increase',
        quantityBefore: qtyBefore,
        quantityAfter: medicine.currentStock,
        quantityChanged: entry.quantity,
        unitPrice: entry.unitPrice,
        referenceId: admission._id,
        referenceModel: 'IPAdmission',
        userId: req.user._id,
        remarks: `IP medicine entry removed - ${admission.admissionNumber} (stock restored)`,
      });
    }
  }

  entry.deleteOne();
  await admission.save();

  res.status(200).json({ success: true, data: admission.medications, message: 'Entry removed and stock restored' });
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
    .populate('patient', 'patientId name age gender phone address rchId allergies')
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