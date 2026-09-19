const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const LabTest = require('../models/LabTest');
const Bill = require('../models/Bill');
const { allocateLabNumber, allocateBillNumber } = require('../utils/generateId');
const { generateLabReportPDF } = require('../utils/pdfGenerator');
const { LAB_TYPES } = require('../models/LabTest');
const { analyzeResult } = require('../utils/labResultAnalyzer');
const TestMaster = require('../models/TestMaster');
const { expandLabOrderTests, collectProfilePrices } = require('../utils/labCatalog');
const { normalizeRole } = require('../utils/roles');
const { withOrganization } = require('../middleware/tenant');
const { markSourcesAsBilled } = require('../services/billingService');
const { labBillableTestLines } = require('../utils/billingChargeRules');
const { pharmacistBillScopeError } = require('../utils/billingAccess');
const { inclusiveIstRange, istDayBounds, kolkataToday } = require('../utils/istDay');
const Patient = require('../models/Patient');

const PAYMENT_MODES = ['cash', 'card', 'upi', 'cheque', 'insurance', 'online'];

const expandCatalogTests = async (profiles, clientTests) => {
  const names = (profiles || []).filter(Boolean);
  if (!names.length) return { tests: clientTests || [], totalAmount: 0, masters: [] };
  const masters = await TestMaster.find({
    isActive: true,
    $or: names.map((name) => ({
      name: new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    })),
  });
  if (!masters.length) return { tests: clientTests || [], totalAmount: 0, masters };
  const prices = collectProfilePrices(names, masters, clientTests);
  return { ...expandLabOrderTests(names, masters, prices, clientTests), masters };
};

const asObjectId = (value) => {
  if (!value) return undefined;
  const id = typeof value === 'object' ? String(value._id || '') : String(value);
  return /^[a-fA-F0-9]{24}$/.test(id) ? id : undefined;
};

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

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const lineAmount = (lab) => {
  const fromLines = (lab.tests || [])
    .filter((t) => t && t.status !== 'cancelled')
    .reduce((sum, t) => sum + (Number(t.price) || 0), 0);
  return fromLines || Number(lab.totalAmount) || 0;
};

const buildLabDateFilter = (query) => {
  if (!query.from && !query.to) return null;
  const { from, to } = inclusiveIstRange(query.from, query.to);
  const field = query.dateField === 'reportGeneratedAt' ? 'reportGeneratedAt' : 'createdAt';
  return { [field]: { $gte: from, $lt: to } };
};

const buildLabSearchFilter = async (q) => {
  const term = String(q || '').trim();
  if (!term) return null;
  const rx = new RegExp(escapeRegex(term), 'i');
  const patients = await Patient.find({
    $or: [{ name: rx }, { phone: rx }, { patientId: rx }],
  }).select('_id').limit(80);
  return {
    $or: [
      { labNumber: rx },
      { patient: { $in: patients.map((p) => p._id) } },
    ],
  };
};

const mergeLabFilters = (...parts) => {
  const used = parts.filter((p) => p && typeof p === 'object' && Object.keys(p).length);
  if (!used.length) return {};
  if (used.length === 1) return used[0];
  return { $and: used };
};

exports.getLabTests = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.labType) filter.labType = req.query.labType;
  if (req.query.patient) filter.patient = req.query.patient;

  const findFilter = mergeLabFilters(
    filter,
    buildSourceFilter(req.query.orderSource),
    buildLabDateFilter(req.query),
    await buildLabSearchFilter(req.query.q),
  );

  const sort = req.query.sort
    ? req.query.sort.split(',').join(' ')
    : '-createdAt';

  const [data, total] = await Promise.all([
    LabTest.find(findFilter)
      .populate('patient', 'patientId name age gender phone')
      .populate('doctor', 'name')
      .populate('createdBy', 'name role')
      .populate({
        path: 'bill',
        select: 'billNumber status paidAmount totalAmount dueAmount billType createdAt',
        options: { skipOrganizationFilter: true },
      })
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

exports.getLabCollectionReport = asyncHandler(async (req, res) => {
  const { isoFrom, isoTo, from, to } = inclusiveIstRange(req.query.from, req.query.to);
  const match = mergeLabFilters(
    {
      createdAt: { $gte: from, $lt: to },
      status: req.query.status && req.query.status !== 'all'
        ? req.query.status
        : { $ne: 'cancelled' },
    },
    await buildLabSearchFilter(req.query.q),
  );

  const rows = await LabTest.find(match)
    .populate('patient', 'patientId name age gender phone')
    .populate('doctor', 'name')
    .populate({
      path: 'bill',
      select: 'billNumber status paidAmount totalAmount dueAmount',
      options: { skipOrganizationFilter: true },
    })
    .sort({ createdAt: 1 })
    .limit(2000)
    .lean();

  const summary = {
    count: 0,
    completed: 0,
    pending: 0,
    amount: 0,
    paid: 0,
  };
  const data = rows.map((lab) => {
    const amount = lineAmount(lab);
    const bill = lab.bill && typeof lab.bill === 'object' ? lab.bill : null;
    const billed = bill && !['cancelled', 'refunded'].includes(bill.status);
    const paid = billed ? Number(bill.paidAmount || 0) : 0;
    summary.count += 1;
    summary.amount += amount;
    summary.paid += paid;
    if (lab.status === 'completed') summary.completed += 1;
    else summary.pending += 1;
    return {
      _id: lab._id,
      labNumber: lab.labNumber,
      createdAt: lab.createdAt,
      reportGeneratedAt: lab.reportGeneratedAt,
      status: lab.status,
      labType: lab.labType,
      testProfile: lab.profiles?.length ? lab.profiles.join(' + ') : (lab.testProfile || ''),
      testsCount: (lab.tests || []).filter((t) => t.status !== 'cancelled').length,
      amount,
      paid,
      billed,
      billNumber: billed ? bill.billNumber : '',
      patient: lab.patient || {},
      doctor: lab.doctor || null,
    };
  });

  res.status(200).json({
    success: true,
    range: { from: isoFrom, to: isoTo },
    summary,
    count: data.length,
    data,
  });
});

exports.getLabBills = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = {
    status: { $nin: ['cancelled', 'refunded'] },
    billType: { $ne: 'ip' },
    $or: [
      { billType: 'lab' },
      { 'items.category': 'Laboratory' },
      { 'items.type': 'lab' },
    ],
  };
  if (req.query.patient) filter.patient = req.query.patient;

  const [data, total] = await Promise.all([
    Bill.find(filter)
      .populate('patient', 'patientId name age gender phone')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    Bill.countDocuments(filter),
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
    .populate('createdBy', 'name role')
    .populate({
      path: 'bill',
      select: 'billNumber status paidAmount totalAmount dueAmount billType createdAt',
      options: { skipOrganizationFilter: true },
    });
  if (!test) return next(new ErrorResponse('Lab test not found', 404));

  if (req.user.role === 'Patient' && test.patient?.email !== req.user.email) {
    return next(new ErrorResponse('Not authorized to access this lab test', 403));
  }

  res.status(200).json({ success: true, data: test });
});

exports.createLabTest = asyncHandler(async (req, res, next) => {
  const body = { ...req.body };
  body.labNumber = await allocateLabNumber();
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

  const expanded = await expandCatalogTests(body.profiles, body.tests);
  if (expanded.tests?.length) body.tests = expanded.tests;

  const testsTotal = (body.tests || []).reduce((sum, t) => sum + (t.price || 0), 0);
  body.totalAmount = body.totalAmount || testsTotal || expanded.totalAmount;

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
  if (!body.sampleType && expanded.masters?.[0]?.sampleType) {
    body.sampleType = expanded.masters[0].sampleType;
  }

  if (!(body.tests || []).length) {
    return next(new ErrorResponse('Select at least one lab test / profile', 400));
  }

  const OPRegistration = require('../models/OPRegistration');
  const IPAdmission = require('../models/IPAdmission');

  let doctorId = asObjectId(body.doctor);
  let opDoc = null;
  if (body.opRegistration) {
    opDoc = await OPRegistration.findById(body.opRegistration).select('status doctor');
    if (!doctorId) doctorId = asObjectId(opDoc?.doctor);
  }
  if (!doctorId && body.ipAdmission) {
    const ipDoc = await IPAdmission.findById(body.ipAdmission).select('doctor');
    doctorId = asObjectId(ipDoc?.doctor);
  }
  body.doctor = doctorId;

  const labTest = await LabTest.create(body);

  if (opDoc) {
    const patch = { $addToSet: { labTests: labTest._id } };
    // Keep pharmacy queue if Rx already sent; lab desk still sees the LabTest order.
    if (!['admitted', 'discharged', 'cancelled', 'no_show', 'sent_to_pharmacy'].includes(opDoc.status)) {
      patch.$set = { status: 'sent_to_lab' };
    }
    await OPRegistration.updateOne({ _id: opDoc._id }, patch);
  }

  if (body.ipAdmission) {
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
  if (lab.bill) {
    const existingBill = await Bill.findById(lab.bill).select('billNumber status');
    if (existingBill && !['cancelled', 'refunded'].includes(existingBill.status)) {
      return next(new ErrorResponse(
        `This lab order is already billed (${existingBill.billNumber}). Create a new lab order for extra tests.`,
        400,
      ));
    }
  }

  const newProfiles = Array.isArray(req.body.profiles) ? req.body.profiles.filter(Boolean) : [];
  let newTests = Array.isArray(req.body.tests) ? req.body.tests : [];
  if (newProfiles.length) {
    const expanded = await expandCatalogTests(newProfiles, newTests);
    if (expanded.tests?.length) {
      newTests = expanded.tests;
      if (!req.body.totalAmount) req.body.totalAmount = expanded.totalAmount;
    }
  }
  if (!newTests.length && !newProfiles.length) {
    return next(new ErrorResponse('No tests to add', 400));
  }

  const existingNames = new Set(
    (lab.tests || []).map((t) => `${t.profileName || ''}:${t.testName}`),
  );
  newTests.forEach((t) => {
    const key = `${t.profileName || ''}:${t.testName}`;
    if (t?.testName && !existingNames.has(key)) {
      lab.tests.push(t);
      existingNames.add(key);
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
  if (req.body.doctor !== undefined) {
    lab.doctor = asObjectId(req.body.doctor) || undefined;
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
  const wasCompleted = existing.status === 'completed';

  // Only persist parameters that were selected and actually filled in.
  const analyzedResults = (req.body.results || [])
    .filter((row) => String(row.testName || '').trim() && String(row.value ?? '').trim())
    .map((row) => {
      const analysis = analyzeResult({
        value: row.value,
        referenceRange: row.referenceRange || row.normalRange,
        criticalLow: row.criticalLow,
        criticalHigh: row.criticalHigh,
        patient: patientContext,
      });
      return {
        testName: row.testName,
        section: row.section,
        method: row.method,
        value: row.value,
        unit: row.unit,
        normalRange: row.normalRange,
        referenceRange: row.referenceRange || row.normalRange,
        criticalLow: row.criticalLow,
        criticalHigh: row.criticalHigh,
        remarks: row.remarks,
        flag: analysis.flag,
        status: analysis.status,
      };
    });

  if (!analyzedResults.length) {
    return next(new ErrorResponse('Tick a parameter and enter a value before saving the report', 400));
  }

  const showReportEnteredTime = req.body.showReportEnteredTime !== false;
  const parsedEnteredAt = req.body.reportGeneratedAt ? new Date(req.body.reportGeneratedAt) : null;
  const reportGeneratedAt = parsedEnteredAt && !Number.isNaN(parsedEnteredAt.getTime())
    ? parsedEnteredAt
    : (existing.reportGeneratedAt || new Date());

  const resultUpdate = {
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
    reportGeneratedAt,
    showReportEnteredTime,
    reportVerifiedBy: req.user._id,
  };
  if (req.body.doctor !== undefined) {
    resultUpdate.doctor = asObjectId(req.body.doctor) || null;
  }

  const test = await LabTest.findByIdAndUpdate(
    req.params.id,
    resultUpdate,
    { new: true }
  )
    .populate('patient', 'patientId name age gender')
    .populate('doctor', 'name');
  if (!test) return next(new ErrorResponse('Lab test not found', 404));

  if (!wasCompleted && req.app.get('io')) {
    req.app.get('io')
      .to(`doctor:${test.doctor?._id}`)
      .emit('lab:result_ready', { labNumber: test.labNumber, patient: test.patient?.name });
  }

  if (!wasCompleted) {
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
  const { from, to } = istDayBounds(kolkataToday());
  const todayMatch = { createdAt: { $gte: from, $lt: to } };

  const [todayTests, pending, completed, urgent, byLabType, todayAmount] = await Promise.all([
    LabTest.countDocuments(todayMatch),
    LabTest.countDocuments({ status: { $in: ['pending', 'sample_collected', 'processing'] } }),
    LabTest.countDocuments({ status: 'completed', ...todayMatch }),
    LabTest.countDocuments({ priority: 'urgent', status: { $ne: 'completed' } }),
    LabTest.aggregate([
      { $match: todayMatch },
      { $group: { _id: '$labType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    LabTest.aggregate([
      { $match: { ...todayMatch, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, amount: { $sum: { $ifNull: ['$totalAmount', 0] } } } },
    ]),
  ]);

  res.status(200).json({
    success: true,
    data: {
      todayTests,
      pending,
      completed,
      urgent,
      todayAmount: todayAmount[0]?.amount || 0,
      byLabType,
      labTypes: LAB_TYPES,
    },
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

exports.createLabBill = asyncHandler(async (req, res, next) => {
  const lab = await LabTest.findById(req.params.id);
  if (!lab) return next(new ErrorResponse('Lab order not found', 404));
  if (lab.status === 'cancelled') {
    return next(new ErrorResponse('Cannot bill a cancelled lab order', 400));
  }
  if (lab.ipAdmission) {
    return next(new ErrorResponse(
      'IP lab tests are billed from IP Billing / Pending Discharge, not as a separate lab bill',
      400,
    ));
  }

  if (lab.bill) {
    const existing = await Bill.findById(lab.bill).select('billNumber status totalAmount paidAmount dueAmount');
    if (existing && !['cancelled', 'refunded'].includes(existing.status)) {
      return next(new ErrorResponse(`This lab order is already billed as ${existing.billNumber}`, 400));
    }
  }

  const items = labBillableTestLines(lab).map((line) => ({
    ...line,
    referenceId: lab._id,
  }));
  if (!items.length) {
    return next(new ErrorResponse('No billable tests on this order. Set prices in Test Master, then try again.', 400));
  }

  const billLike = { billType: 'lab' };
  const scopeError = pharmacistBillScopeError(req.user, billLike);
  if (scopeError) return next(new ErrorResponse(scopeError, 403));

  const total = items.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  const rawPaid = req.body.paidAmount;
  const paidParsed = Number(rawPaid);
  const paidAmount = (rawPaid === '' || rawPaid == null || !Number.isFinite(paidParsed))
    ? total
    : Math.max(0, Math.min(paidParsed, total));
  const paymentMode = PAYMENT_MODES.includes(req.body.paymentMode) ? req.body.paymentMode : 'cash';

  const payload = withOrganization(req, {
    billNumber: await allocateBillNumber(),
    billType: 'lab',
    patient: lab.patient,
    doctor: lab.doctor || undefined,
    opRegistration: lab.opRegistration || undefined,
    items,
    paidAmount,
    paymentMode,
    payments: paidAmount > 0
      ? [{ amount: paidAmount, mode: paymentMode, receivedBy: req.user._id, paidAt: new Date() }]
      : [],
    notes: `Lab order ${lab.labNumber || lab._id}`,
    createdBy: req.user._id,
  });

  const bill = await Bill.create(payload);
  await markSourcesAsBilled(payload.items, bill._id);

  const populated = await Bill.findById(bill._id)
    .populate('patient', 'patientId name age gender phone')
    .populate('doctor', 'name')
    .populate('createdBy', 'name');

  const updatedLab = await LabTest.findById(lab._id)
    .populate('patient', 'patientId name age gender')
    .populate('doctor', 'name')
    .populate('createdBy', 'name role')
    .populate({
      path: 'bill',
      select: 'billNumber status paidAmount totalAmount dueAmount billType createdAt',
      options: { skipOrganizationFilter: true },
    });

  if (req.app.get('io')) {
    req.app.get('io').emit('lab:update', { type: 'billed', data: updatedLab });
  }

  res.status(201).json({
    success: true,
    data: { bill: populated, lab: updatedLab },
    message: paidAmount >= total
      ? `Lab bill ${populated.billNumber} collected`
      : `Lab bill ${populated.billNumber} created`,
  });
});