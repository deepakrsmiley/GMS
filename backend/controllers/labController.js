const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const LabTest = require('../models/LabTest');
const Counter = require('../models/Counter');
const { generateLabNo } = require('../utils/generateId');
const { generateLabReportPDF } = require('../utils/pdfGenerator');
const { LAB_TYPES } = require('../models/LabTest');
const { analyzeResult } = require('../utils/labResultAnalyzer');
const TestMaster = require('../models/TestMaster');
const { normalizeRole } = require('../utils/roles');

const resolveOrderSource = (body, user) => {
  if (body.orderSource && ['reception', 'lab_desk', 'nurse_ip', 'doctor', 'other'].includes(body.orderSource)) {
    return body.orderSource;
  }
  if (body.ipAdmission) return 'nurse_ip';
  if (body.opRegistration) return 'reception';
  const role = normalizeRole(user?.role);
  if (role === 'Lab Technician') return 'lab_desk';
  if (role === 'Receptionist') return 'reception';
  if (role === 'Nurse') return 'nurse_ip';
  if (role === 'Doctor') return 'doctor';
  return 'other';
};

/** Smart filter for desk queues — includes legacy rows without orderSource */
const buildSourceFilter = (orderSource) => {
  if (!orderSource) return {};
  if (orderSource === 'reception') {
    return {
      $or: [
        { orderSource: 'reception' },
        { opRegistration: { $exists: true, $ne: null } },
      ],
    };
  }
  if (orderSource === 'nurse_ip') {
    return {
      $or: [
        { orderSource: 'nurse_ip' },
        { ipAdmission: { $exists: true, $ne: null } },
      ],
    };
  }
  if (orderSource === 'lab_desk') {
    return {
      $or: [
        { orderSource: 'lab_desk' },
        {
          $and: [
            { orderSource: { $nin: ['reception', 'nurse_ip'] } },
            { $or: [{ opRegistration: null }, { opRegistration: { $exists: false } }] },
            { $or: [{ ipAdmission: null }, { ipAdmission: { $exists: false } }] },
          ],
        },
      ],
    };
  }
  return { orderSource };
};

exports.getLabTests = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.labType) filter.labType = req.query.labType;
  if (req.query.patient) filter.patient = req.query.patient;

  const sourcePart = buildSourceFilter(req.query.orderSource);
  const findFilter = Object.keys(sourcePart).length
    ? (Object.keys(filter).length ? { $and: [filter, sourcePart] } : sourcePart)
    : filter;

  const sort = req.query.sort
    ? req.query.sort.split(',').join(' ')
    : '-createdAt';

  const [data, total] = await Promise.all([
    LabTest.find(findFilter)
      .populate('patient', 'patientId name age gender')
      .populate('doctor', 'name')
      .populate('createdBy', 'name role')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    LabTest.countDocuments(findFilter),
  ]);

  res.status(200).json({
    success: true,
    count: data.length,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data,
  });
});

exports.getLabTest = asyncHandler(async (req, res, next) => {
  const test = await LabTest.findById(req.params.id)
    .populate('patient', 'patientId name age gender email')
    .populate('doctor', 'name')
    .populate('sampleCollectedBy', 'name')
    .populate('reportVerifiedBy', 'name')
    .populate('createdBy', 'name role');
  if (!test) return next(new ErrorResponse('Lab test not found', 404));

  if (req.user.role === 'Patient' && test.patient?.email !== req.user.email) {
    return next(new ErrorResponse('Not authorized to access this lab test', 403));
  }

  res.status(200).json({ success: true, data: test });
});

exports.createLabTest = asyncHandler(async (req, res, next) => {
  const body = { ...req.body };
  const seq = await Counter.getNextSeq('lab');
  body.labNumber = generateLabNo(seq);
  body.createdBy = req.user._id;
  body.orderSource = resolveOrderSource(body, req.user);

  // Normalize multi-profile → one Lab No.
  const profiles = Array.isArray(body.profiles) && body.profiles.length
    ? body.profiles
    : (body.testProfile ? [body.testProfile] : []);
  body.profiles = profiles.filter(Boolean);
  if (body.profiles.length) {
    body.testProfile = body.profiles.join(' + ');
  }

  const testsTotal = (body.tests || []).reduce((sum, t) => sum + (t.price || 0), 0);
  body.totalAmount = body.totalAmount || testsTotal;

  if (!body.totalAmount || body.totalAmount <= 0) {
    let sum = 0;
    for (const name of body.profiles.length ? body.profiles : [body.testProfile].filter(Boolean)) {
      const master = await TestMaster.findOne({
        name: new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        isActive: true,
      });
      if (master) sum += Number(master.price) || 0;
    }
    if (sum > 0) body.totalAmount = sum;
  }

  if (!body.labType && body.profiles?.[0]) {
    const master = await TestMaster.findOne({ name: body.profiles[0], isActive: true });
    if (master?.category) body.labType = master.category;
  }

  if (!(body.tests || []).length) {
    return next(new ErrorResponse('Select at least one lab test / profile', 400));
  }

  const labTest = await LabTest.create(body);

  if (body.opRegistration) {
    const OPRegistration = require('../models/OPRegistration');
    await OPRegistration.findByIdAndUpdate(body.opRegistration, {
      $addToSet: { labTests: labTest._id },
    });
  }

  if (body.ipAdmission) {
    const IPAdmission = require('../models/IPAdmission');
    await IPAdmission.findByIdAndUpdate(body.ipAdmission, {
      $addToSet: { labTests: labTest._id },
    });
  }

  const populated = await LabTest.findById(labTest._id)
    .populate('patient', 'patientId name age gender')
    .populate('doctor', 'name')
    .populate('createdBy', 'name role');

  try {
    const { notifyRoles } = require('../utils/notify');
    await notifyRoles(req, {
      roles: ['Lab Technician', 'Admin', 'Super Admin'],
      title: 'New lab order',
      message: `${populated.patient?.name || 'Patient'} — ${populated.labNumber} (${populated.orderSource || 'request'})`,
      type: 'lab',
      link: `/lab?desk=${populated.orderSource || 'reception'}`,
      relatedId: populated._id,
      relatedModel: 'LabTest',
      excludeUserId: req.user._id,
    });
  } catch (_) { /* ignore */ }

  if (req.app.get('io')) {
    req.app.get('io').emit('lab:update', { type: 'created', data: populated });
  }

  res.status(201).json({ success: true, data: populated });
});

/** Append packages/tests to an existing Lab No. (no new order) */
exports.addTestsToLabOrder = asyncHandler(async (req, res, next) => {
  const lab = await LabTest.findById(req.params.id);
  if (!lab) return next(new ErrorResponse('Lab order not found', 404));
  if (['completed', 'cancelled'].includes(lab.status)) {
    return next(new ErrorResponse('Cannot add tests to a completed / cancelled order', 400));
  }

  const newProfiles = Array.isArray(req.body.profiles) ? req.body.profiles.filter(Boolean) : [];
  const newTests = Array.isArray(req.body.tests) ? req.body.tests : [];
  if (!newTests.length && !newProfiles.length) {
    return next(new ErrorResponse('No tests to add', 400));
  }

  const existingNames = new Set((lab.tests || []).map((t) => t.testName));
  newTests.forEach((t) => {
    if (t?.testName && !existingNames.has(t.testName)) {
      lab.tests.push(t);
      existingNames.add(t.testName);
    }
  });

  const profiles = [...new Set([...(lab.profiles || []), ...(lab.testProfile ? [lab.testProfile] : []), ...newProfiles]
    .flatMap((p) => String(p).split(' + ').map((s) => s.trim()))
    .filter(Boolean))];
  lab.profiles = profiles;
  lab.testProfile = profiles.join(' + ');

  const addAmount = Number(req.body.totalAmount)
    || newTests.reduce((s, t) => s + (Number(t.price) || 0), 0);
  lab.totalAmount = (Number(lab.totalAmount) || 0) + addAmount;

  if (req.body.notes) {
    lab.notes = [lab.notes, req.body.notes].filter(Boolean).join('\n');
  }

  await lab.save();

  const populated = await LabTest.findById(lab._id)
    .populate('patient', 'patientId name age gender')
    .populate('doctor', 'name')
    .populate('createdBy', 'name role');

  if (req.app.get('io')) {
    req.app.get('io').emit('lab:update', { type: 'tests_added', data: populated });
  }

  res.status(200).json({ success: true, data: populated, message: 'Tests added to same lab order' });
});

exports.updateLabStatus = asyncHandler(async (req, res, next) => {
  const update = { status: req.body.status };
  if (req.body.status === 'sample_collected') {
    update.sampleCollectedAt = new Date();
    update.sampleCollectedBy = req.user._id;
  }
  if (req.body.status === 'processing') {
    update.sampleReceivedAt = update.sampleReceivedAt || new Date();
  }
  const test = await LabTest.findByIdAndUpdate(req.params.id, update, { new: true })
    .populate('patient', 'patientId name age gender')
    .populate('doctor', 'name')
    .populate('createdBy', 'name role')
    .populate('sampleCollectedBy', 'name');
  if (!test) return next(new ErrorResponse('Lab test not found', 404));

  if (req.app.get('io')) {
    req.app.get('io').emit('lab:update', { type: 'status_change', data: test });
  }

  // Notify requester desk that status moved (Reception / Nurse see progress)
  try {
    const { notifyRoles, notifyUser } = require('../utils/notify');
    const statusLabel = String(req.body.status || '').replace(/_/g, ' ');
    const msg = `${test.labNumber} — ${test.patient?.name || 'Patient'}: ${statusLabel}`;
    if (test.orderSource === 'reception' || test.opRegistration) {
      await notifyRoles(req, {
        roles: ['Receptionist', 'Admin', 'Super Admin'],
        title: 'Lab status update',
        message: msg,
        type: 'lab',
        link: '/lab?desk=reception',
        relatedId: test._id,
        relatedModel: 'LabTest',
        excludeUserId: req.user._id,
      });
    }
    if (test.orderSource === 'nurse_ip' || test.ipAdmission) {
      await notifyRoles(req, {
        roles: ['Nurse', 'Admin', 'Super Admin'],
        title: 'Lab status update',
        message: msg,
        type: 'lab',
        link: '/lab?desk=nurse_ip',
        relatedId: test._id,
        relatedModel: 'LabTest',
        excludeUserId: req.user._id,
      });
    }
    if (test.createdBy?._id || test.createdBy) {
      await notifyUser(req, {
        userId: test.createdBy._id || test.createdBy,
        title: 'Lab status update',
        message: msg,
        type: 'lab',
        link: '/lab',
        relatedId: test._id,
        relatedModel: 'LabTest',
      });
    }
  } catch (_) { /* ignore */ }

  res.status(200).json({ success: true, data: test });
});

exports.enterResults = asyncHandler(async (req, res, next) => {
  const existing = await LabTest.findById(req.params.id).populate('patient', 'age gender');
  if (!existing) return next(new ErrorResponse('Lab test not found', 404));

  const patientContext = { age: existing.patient?.age, gender: existing.patient?.gender };

  // Auto-analyze each result row: derive flag/status from value vs reference range
  // so the report template never has to guess — it just renders what's stored.
  const analyzedResults = (req.body.results || []).map((row) => {
    const analysis = analyzeResult({
      value: row.value,
      referenceRange: row.referenceRange || row.normalRange,
      criticalLow: row.criticalLow,
      criticalHigh: row.criticalHigh,
      patient: patientContext,
    });
    return {
      ...row,
      flag: analysis.flag,
      status: analysis.status,
    };
  });

  const test = await LabTest.findByIdAndUpdate(
    req.params.id,
    {
      results: analyzedResults,
      remarks: req.body.remarks,
      interpretation: req.body.interpretation,
      clinicalNotes: req.body.clinicalNotes,
      doctorComments: req.body.doctorComments,
      labComments: req.body.labComments,
      recommendation: req.body.recommendation,
      impression: req.body.impression,
      conclusion: req.body.conclusion,
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

  try {
    const { notifyUser, notifyRoles } = require('../utils/notify');
    if (test.doctor?._id) {
      await notifyUser(req, {
        userId: test.doctor._id,
        title: 'Lab report ready',
        message: `${test.patient?.name || 'Patient'} — ${test.labNumber} results available`,
        type: 'lab',
        link: '/lab?tab=reports',
        relatedId: test._id,
        relatedModel: 'LabTest',
      });
    }
    await notifyRoles(req, {
      roles: ['Lab Technician'],
      title: 'Lab report completed',
      message: `${test.labNumber} marked completed`,
      type: 'lab',
      link: '/lab?tab=reports',
      relatedId: test._id,
      relatedModel: 'LabTest',
      excludeUserId: req.user._id,
    });
  } catch (_) { /* ignore */ }

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