const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Patient = require('../models/Patient');
const Counter = require('../models/Counter');
const { generatePatientId } = require('../utils/generateId');
const cloudinary = require('../config/cloudinary');
const logger = require('../utils/logger');

const hasCloudinaryCredentials = () => (
  process.env.CLOUDINARY_CLOUD_NAME
  && process.env.CLOUDINARY_API_KEY
  && process.env.CLOUDINARY_API_SECRET
  && !process.env.CLOUDINARY_CLOUD_NAME.startsWith('your_')
  && !process.env.CLOUDINARY_API_KEY.startsWith('your_')
  && !process.env.CLOUDINARY_API_SECRET.startsWith('your_')
);

exports.getPatients = asyncHandler(async (req, res) => {
  res.status(200).json(res.advancedResults);
});

exports.getPatient = asyncHandler(async (req, res, next) => {
  const patient = await Patient.findById(req.params.id)
    .populate({ path: 'visits', options: { limit: 10, sort: { createdAt: -1 } }, populate: { path: 'doctor department', select: 'name' } })
    .populate({ path: 'admissions', options: { limit: 5, sort: { createdAt: -1 } }, populate: { path: 'doctor department bed', select: 'name bedNumber' } });
  if (!patient) return next(new ErrorResponse('Patient not found', 404));

  // Enforce Patient ownership
  if (req.user.role === 'Patient' && patient.email !== req.user.email) {
    return next(new ErrorResponse('Not authorized to access this patient record', 403));
  }

  res.status(200).json({ success: true, data: patient });
});

exports.createPatient = asyncHandler(async (req, res) => {
  const seq = await Counter.getNextSeq('patient');
  req.body.patientId = generatePatientId(seq);
  req.body.registeredBy = req.user._id;

  if (req.body.photo && req.body.photo.startsWith('data:')) {
    try {
      if (hasCloudinaryCredentials()) {
        const upload = await cloudinary.uploader.upload(req.body.photo, {
          folder: 'hms/patients',
          resource_type: 'image',
        });
        req.body.photo = upload.secure_url;
      } else {
        req.body.photo = undefined;
      }
    } catch (error) {
      logger.warn(`Patient photo upload failed; continuing without image: ${error.message}`);
      req.body.photo = undefined;
    }
  }

  const patient = await Patient.create(req.body);
  res.status(201).json({ success: true, data: patient });
});

exports.updatePatient = asyncHandler(async (req, res, next) => {
  let patient = await Patient.findById(req.params.id);
  if (!patient) return next(new ErrorResponse('Patient not found', 404));
  patient = await Patient.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  res.status(200).json({ success: true, data: patient });
});

exports.searchPatients = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(200).json({ success: true, data: [] });
  const patients = await Patient.find({
    $or: [
      { patientId: { $regex: q, $options: 'i' } },
      { name: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
    ],
  }).limit(10).select('patientId name phone age gender bloodGroup');
  res.status(200).json({ success: true, data: patients });
});

exports.getPatientStats = asyncHandler(async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [total, todayNew, male, female] = await Promise.all([
    Patient.countDocuments(),
    Patient.countDocuments({ createdAt: { $gte: today } }),
    Patient.countDocuments({ gender: 'Male' }),
    Patient.countDocuments({ gender: 'Female' }),
  ]);
  res.status(200).json({ success: true, data: { total, todayNew, male, female } });
});
