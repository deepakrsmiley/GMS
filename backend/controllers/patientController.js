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

/** Keep patient counter at/above the highest existing UHID for the current year. */
const syncPatientCounter = async () => {
  const year = new Date().getFullYear().toString().slice(-2);
  const latest = await Patient.findOne({ patientId: new RegExp(`^PT${year}`) })
    .sort({ patientId: -1 })
    .select('patientId')
    .lean();
  if (!latest?.patientId) return;
  const maxSeq = parseInt(latest.patientId.slice(-6), 10);
  if (!Number.isFinite(maxSeq)) return;

  const counter = await Counter.findById('patient');
  if (!counter) {
    await Counter.create({ _id: 'patient', seq: maxSeq });
  } else if (counter.seq < maxSeq) {
    counter.seq = maxSeq;
    await counter.save();
  }
};

const allocatePatientId = async () => {
  await syncPatientCounter();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const seq = await Counter.getNextSeq('patient');
    const patientId = generatePatientId(seq);
    const exists = await Patient.exists({ patientId });
    if (!exists) return patientId;
  }
  throw new ErrorResponse('Unable to allocate a unique patient ID. Please try again.', 500);
};

/** Drop empty strings so optional enum/email fields do not fail validation. */
const sanitizePatientPayload = (body) => {
  const data = { ...body };
  delete data._id;
  delete data.patientId;

  ['email', 'bloodGroup', 'maritalStatus', 'occupation', 'alternatePhone', 'rchId', 'photo'].forEach((key) => {
    if (data[key] === '' || data[key] === null) delete data[key];
  });

  return data;
};

exports.createPatient = asyncHandler(async (req, res) => {
  const payload = sanitizePatientPayload(req.body);
  payload.patientId = await allocatePatientId();
  payload.registeredBy = req.user._id;

  if (payload.photo && payload.photo.startsWith('data:')) {
    try {
      if (hasCloudinaryCredentials()) {
        const upload = await cloudinary.uploader.upload(payload.photo, {
          folder: 'hms/patients',
          resource_type: 'image',
        });
        payload.photo = upload.secure_url;
      } else {
        delete payload.photo;
      }
    } catch (error) {
      logger.warn(`Patient photo upload failed; continuing without image: ${error.message}`);
      delete payload.photo;
    }
  }

  const patient = await Patient.create(payload);
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
