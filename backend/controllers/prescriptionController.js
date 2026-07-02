const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const OPRegistration = require('../models/OPRegistration');

// @desc    Create prescription
// @route   POST /api/prescriptions
// @access  Private (Doctor, Super Admin, Admin)
exports.createPrescription = asyncHandler(async (req, res, next) => {
  // If doctor field is not provided, use the logged in user's ID
  if (!req.body.doctor) {
    req.body.doctor = req.user._id;
  }

  // Verify patient exists
  const patient = await Patient.findById(req.body.patient);
  if (!patient) {
    return next(new ErrorResponse('Patient not found', 404));
  }

  const prescription = await Prescription.create(req.body);

  // If there is an OPRegistration link, push this prescription to it
  if (req.body.opRegistration) {
    await OPRegistration.findByIdAndUpdate(req.body.opRegistration, {
      $push: { prescriptions: prescription._id },
      status: 'sent_to_pharmacy',
    });
    if (req.app.get('io')) req.app.get('io').emit('queue:update', { type: 'prescription_created' });
  }

  res.status(201).json({
    success: true,
    data: prescription
  });
});

// @desc    Get all prescriptions (filtered by patient or doctor)
// @route   GET /api/prescriptions
// @access  Private (Admin, Doctor, Pharmacist)
exports.getPrescriptions = asyncHandler(async (req, res, next) => {
  let query;

  // Build filter options
  const filter = {};
  if (req.query.patient) filter.patient = req.query.patient;
  if (req.query.doctor) filter.doctor = req.query.doctor;
  if (req.query.status) filter.status = req.query.status;

  query = Prescription.find(filter)
    .populate('patient', 'patientId name age gender phone')
    .populate('doctor', 'name specialization')
    .populate('medicines.medicine', 'name category unit currentStock')
    .sort({ createdAt: -1 });

  const prescriptions = await query;

  res.status(200).json({
    success: true,
    count: prescriptions.length,
    data: prescriptions
  });
});

// @desc    Get single prescription
// @route   GET /api/prescriptions/:id
// @access  Private (Admin, Doctor, Pharmacist, Patient)
exports.getPrescription = asyncHandler(async (req, res, next) => {
  const prescription = await Prescription.findById(req.params.id)
    .populate('patient', 'patientId name age gender phone bloodGroup address')
    .populate('doctor', 'name specialization department phone')
    .populate('medicines.medicine', 'name category unit sellingPrice currentStock');

  if (!prescription) {
    return next(new ErrorResponse('Prescription not found', 404));
  }

  // Ensure patients can only view their own prescriptions
  if (req.user.role === 'Patient' && prescription.patient._id.toString() !== req.user._id.toString()) {
    // Wait, let's verify if patient user ID matches patient record email or ID.
    // In our seed data, patient has user.email and patient has patient.email. Let's write a flexible check:
    const patientRecord = await Patient.findById(prescription.patient._id);
    if (patientRecord && patientRecord.email !== req.user.email) {
      return next(new ErrorResponse('Not authorized to access this prescription', 403));
    }
  }

  res.status(200).json({
    success: true,
    data: prescription
  });
});

// @desc    Get prescriptions of a specific patient
// @route   GET /api/prescriptions/patient/:patientId
// @access  Private (Admin, Doctor, Pharmacist, Patient)
exports.getPatientPrescriptions = asyncHandler(async (req, res, next) => {
  // Can fetch by patient's DB ObjectID
  let filter = { patient: req.params.patientId };
  
  // If the requester is a Patient, enforce that they can only view their own
  if (req.user.role === 'Patient') {
    const patientRecord = await Patient.findOne({ email: req.user.email });
    if (!patientRecord || patientRecord._id.toString() !== req.params.patientId) {
      return next(new ErrorResponse('Not authorized to access these prescriptions', 403));
    }
  }

  const prescriptions = await Prescription.find(filter)
    .populate('doctor', 'name specialization')
    .populate('medicines.medicine', 'name category unit')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: prescriptions.length,
    data: prescriptions
  });
});

// @desc    Cancel prescription
// @route   DELETE /api/prescriptions/:id
// @access  Private (Doctor, Super Admin)
exports.cancelPrescription = asyncHandler(async (req, res, next) => {
  const prescription = await Prescription.findById(req.params.id);

  if (!prescription) {
    return next(new ErrorResponse('Prescription not found', 404));
  }

  // Ensure only the writing doctor (or Admin) can cancel
  if (req.user.role !== 'Super Admin' && req.user.role !== 'Admin' && prescription.doctor.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse('Not authorized to cancel this prescription', 403));
  }

  prescription.status = 'cancelled';
  await prescription.save();

  res.status(200).json({
    success: true,
    message: 'Prescription cancelled successfully',
    data: prescription
  });
});
