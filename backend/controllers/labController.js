const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const LabTest = require('../models/LabTest');
const Counter = require('../models/Counter');
const { generateLabNo } = require('../utils/generateId');
const { generateLabReportPDF } = require('../utils/pdfGenerator');
const { LAB_TYPES } = require('../models/LabTest');

exports.getLabTests = asyncHandler(async (req, res) => {
  res.status(200).json(res.advancedResults);
});

exports.getLabTest = asyncHandler(async (req, res, next) => {
  const test = await LabTest.findById(req.params.id)
    .populate('patient', 'patientId name age gender email')
    .populate('doctor', 'name')
    .populate('sampleCollectedBy', 'name')
    .populate('reportVerifiedBy', 'name');
  if (!test) return next(new ErrorResponse('Lab test not found', 404));

  if (req.user.role === 'Patient' && test.patient?.email !== req.user.email) {
    return next(new ErrorResponse('Not authorized to access this lab test', 403));
  }

  res.status(200).json({ success: true, data: test });
});

exports.createLabTest = asyncHandler(async (req, res) => {
  const seq = await Counter.getNextSeq('lab');
  req.body.labNumber = generateLabNo(seq);
  req.body.createdBy = req.user._id;
  req.body.totalAmount = (req.body.tests || []).reduce((sum, t) => sum + (t.price || 0), 0);

  const labTest = await LabTest.create(req.body);
  const populated = await LabTest.findById(labTest._id)
    .populate('patient', 'patientId name age gender')
    .populate('doctor', 'name');
  res.status(201).json({ success: true, data: populated });
});

exports.updateLabStatus = asyncHandler(async (req, res, next) => {
  const update = { status: req.body.status };
  if (req.body.status === 'sample_collected') {
    update.sampleCollectedAt = new Date();
    update.sampleCollectedBy = req.user._id;
  }
  const test = await LabTest.findByIdAndUpdate(req.params.id, update, { new: true })
    .populate('patient', 'patientId name age gender')
    .populate('doctor', 'name');
  if (!test) return next(new ErrorResponse('Lab test not found', 404));

  if (req.app.get('io')) {
    req.app.get('io').emit('lab:update', { type: 'status_change', data: test });
  }
  res.status(200).json({ success: true, data: test });
});

exports.enterResults = asyncHandler(async (req, res, next) => {
  const test = await LabTest.findByIdAndUpdate(
    req.params.id,
    {
      results: req.body.results,
      remarks: req.body.remarks,
      status: 'completed',
      reportGeneratedAt: new Date(),
      reportVerifiedBy: req.user._id,
    },
    { new: true }
  )
    .populate('patient', 'patientId name age gender')
    .populate('doctor', 'name');
  if (!test) return next(new ErrorResponse('Lab test not found', 404));

  if (req.app.get('io')) {
    req.app.get('io')
      .to(`doctor:${test.doctor?._id}`)
      .emit('lab:result_ready', { labNumber: test.labNumber, patient: test.patient?.name });
  }
  res.status(200).json({ success: true, data: test });
});

exports.printLabReport = asyncHandler(async (req, res, next) => {
  const test = await LabTest.findById(req.params.id)
    .populate('patient', 'patientId name age gender phone')
    .populate('doctor', 'name specialization')
    .populate('reportVerifiedBy', 'name qualification');
  if (!test) return next(new ErrorResponse('Lab test not found', 404));
  await generateLabReportPDF(test, res);
});

exports.getLabDashboard = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [todayTests, pending, completed, urgent, byLabType] = await Promise.all([
    LabTest.countDocuments({ createdAt: { $gte: today } }),
    LabTest.countDocuments({ status: { $in: ['pending', 'sample_collected', 'processing'] } }),
    LabTest.countDocuments({ status: 'completed', createdAt: { $gte: today } }),
    LabTest.countDocuments({ priority: 'urgent', status: { $ne: 'completed' } }),
    LabTest.aggregate([
      { $match: { createdAt: { $gte: today } } },
      { $group: { _id: '$labType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  res.status(200).json({
    success: true,
    data: { todayTests, pending, completed, urgent, byLabType, labTypes: LAB_TYPES },
  });
});

// Returns IP admission patients with their medicine prescriptions
// filtered by a time range (useful for night-shift viewing)
exports.getIPMedicinesByTime = asyncHandler(async (req, res) => {
  const IPAdmission = require('../models/IPAdmission');
  const { from, to } = req.query;

  const filter = { status: 'admitted' };

  const admissions = await IPAdmission.find(filter)
    .populate('patient', 'patientId name age gender')
    .populate('doctor', 'name')
    .populate({
      path: 'prescriptions',
      match: from && to
        ? { createdAt: { $gte: new Date(from), $lte: new Date(to) } }
        : {},
      populate: { path: 'medicines.medicine', select: 'name genericName' },
    })
    .select('admissionNumber patient doctor admissionDate status ward bed')
    .lean();

  res.status(200).json({ success: true, data: admissions });
});

// Export LAB_TYPES for frontend to fetch
exports.getLabTypes = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: LAB_TYPES });
});