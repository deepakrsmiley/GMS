const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const { logActivity } = require('../utils/activityLogger');
const { notifyRoles, notifyUser } = require('../utils/notify');
const { addDays, recordLifecycle, resolvePmInterval } = require('../utils/bemsHelpers');

const Asset = require('../models/Asset');
const AssetComplaint = require('../models/AssetComplaint');
const BmeVendor = require('../models/BmeVendor');
const BmeChecklistTemplate = require('../models/BmeChecklistTemplate');
const BmeWorkOrder = require('../models/BmeWorkOrder');
const BmePreventiveMaintenance = require('../models/BmePreventiveMaintenance');
const BmeCalibration = require('../models/BmeCalibration');
const BmeElectricalSafety = require('../models/BmeElectricalSafety');
const BmeSparePart = require('../models/BmeSparePart');
const BmeContract = require('../models/BmeContract');
const BmeMovement = require('../models/BmeMovement');
const BmeLifecycleEvent = require('../models/BmeLifecycleEvent');
const User = require('../models/User');

const BME_NOTIFY_ROLES = ['Biomedical Engineer', 'Admin', 'Super Admin'];

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════

exports.getDashboard = asyncHandler(async (req, res) => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const in30 = addDays(now, 30);
  const in90 = addDays(now, 90);

  const activeEq = { isActive: true, status: { $nin: ['Disposed', 'Decommissioned'] } };

  const [
    totalEquipment,
    byStatus,
    pmDueToday,
    pmOverdue,
    calDue,
    calOverdue,
    estDue,
    openComplaints,
    closedComplaints,
    pendingWorkOrders,
    amcExpiring,
    cmcExpiring,
    warrantyExpiring,
    lowStock,
    byDepartment,
    topFailed,
    recentActivities,
    vendorVisitsToday,
    completedRepairs,
  ] = await Promise.all([
    Asset.countDocuments(activeEq),
    Asset.aggregate([
      { $match: activeEq },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    BmePreventiveMaintenance.countDocuments({
      status: { $in: ['Scheduled', 'Overdue'] },
      scheduledDate: { $gte: todayStart, $lte: todayEnd },
    }),
    BmePreventiveMaintenance.countDocuments({
      $or: [
        { status: 'Overdue' },
        { status: 'Scheduled', scheduledDate: { $lt: todayStart } },
      ],
    }),
    Asset.countDocuments({
      ...activeEq,
      nextCalibrationDate: { $gte: todayStart, $lte: in30 },
    }),
    Asset.countDocuments({
      ...activeEq,
      nextCalibrationDate: { $lt: todayStart },
    }),
    Asset.countDocuments({
      ...activeEq,
      nextElectricalSafetyDate: { $lte: in30 },
    }),
    AssetComplaint.countDocuments({ status: { $nin: ['Completed', 'Closed'] } }),
    AssetComplaint.countDocuments({ status: { $in: ['Completed', 'Closed'] } }),
    BmeWorkOrder.countDocuments({ status: { $in: ['Pending', 'Assigned', 'In Progress', 'Waiting Parts', 'Waiting Approval'] } }),
    BmeContract.countDocuments({ type: 'AMC', status: { $in: ['Active', 'Expiring Soon'] }, endDate: { $lte: in90 } }),
    BmeContract.countDocuments({ type: 'CMC', status: { $in: ['Active', 'Expiring Soon'] }, endDate: { $lte: in90 } }),
    Asset.countDocuments({ ...activeEq, warrantyExpiry: { $gte: now, $lte: in30 } }),
    BmeSparePart.find({ isActive: true, $expr: { $lte: ['$stock', '$reorderLevel'] } })
      .select('partCode name stock reorderLevel category')
      .limit(10)
      .lean(),
    Asset.aggregate([
      { $match: activeEq },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
      { $project: { count: 1, name: { $ifNull: [{ $arrayElemAt: ['$dept.name', 0] }, 'Unassigned'] } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Asset.find({ ...activeEq, failureCount: { $gt: 0 } })
      .select('assetId name failureCount status department')
      .populate('department', 'name')
      .sort('-failureCount')
      .limit(10)
      .lean(),
    BmeLifecycleEvent.find()
      .sort('-occurredAt')
      .limit(15)
      .populate('equipment', 'assetId name')
      .lean(),
    Asset.countDocuments({ ...activeEq, nextVendorVisit: { $gte: todayStart, $lte: todayEnd } }),
    BmeWorkOrder.find({ type: 'Breakdown', status: 'Completed', endTime: { $exists: true }, startTime: { $exists: true } })
      .select('startTime endTime equipment')
      .limit(200)
      .lean(),
  ]);

  const statusMap = byStatus.reduce((a, s) => { a[s._id] = s.count; return a; }, {});

  // MTTR (hours) & MTBF approximation
  let mttr = 0;
  if (completedRepairs.length) {
    const totalHours = completedRepairs.reduce((sum, wo) => {
      const hrs = (new Date(wo.endTime) - new Date(wo.startTime)) / 3600000;
      return sum + (hrs > 0 ? hrs : 0);
    }, 0);
    mttr = Math.round((totalHours / completedRepairs.length) * 10) / 10;
  }

  const downtimeAgg = await Asset.aggregate([
    { $match: activeEq },
    { $group: { _id: null, total: { $sum: '$totalDowntimeHours' }, failures: { $sum: '$failureCount' } } },
  ]);
  const totalDowntime = downtimeAgg[0]?.total || 0;
  const totalFailures = downtimeAgg[0]?.failures || 0;
  const mtbf = totalFailures > 0
    ? Math.round(((totalEquipment * 24 * 30) / totalFailures) * 10) / 10
    : null;

  const engineerPerf = await BmeWorkOrder.aggregate([
    { $match: { status: 'Completed', engineer: { $ne: null } } },
    { $group: { _id: '$engineer', completed: { $sum: 1 }, avgCost: { $avg: '$cost' } } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $project: { completed: 1, avgCost: 1, name: { $arrayElemAt: ['$user.name', 0] } } },
    { $sort: { completed: -1 } },
    { $limit: 8 },
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalEquipment,
      working: statusMap.Working || 0,
      inUse: statusMap['In Use'] || 0,
      idle: statusMap.Idle || 0,
      underRepair: (statusMap['Under Repair'] || 0) + (statusMap['Repair In Progress'] || 0) + (statusMap['Under Maintenance'] || 0),
      breakdown: statusMap.Breakdown || 0,
      waitingSpareParts: statusMap['Waiting Spare Parts'] || 0,
      pmDueToday,
      pmOverdue,
      calibrationDue: calDue,
      calibrationOverdue: calOverdue,
      electricalSafetyDue: estDue,
      openComplaints,
      closedComplaints,
      pendingWorkOrders,
      vendorVisitsScheduled: vendorVisitsToday,
      amcExpiry: amcExpiring,
      cmcExpiry: cmcExpiring,
      warrantyExpiry: warrantyExpiring,
      equipmentDowntime: Math.round(totalDowntime * 10) / 10,
      mtbf,
      mttr,
      byDepartment,
      topFailedEquipment: topFailed,
      sparePartsLowStock: lowStock,
      engineerPerformance: engineerPerf,
      recentActivities,
      byStatus: statusMap,
    },
  });
});

// ═══════════════════════════════════════════
// EQUIPMENT TIMELINE / QR LOOKUP
// ═══════════════════════════════════════════

exports.getEquipmentTimeline = asyncHandler(async (req, res, next) => {
  const equipment = await Asset.findById(req.params.id)
    .populate('department', 'name')
    .populate('vendor', 'name contactPerson phone email')
    .populate('addedBy', 'name');
  if (!equipment) return next(new ErrorResponse('Equipment not found', 404));

  const [complaints, pms, calibrations, safety, workOrders, movements, lifecycle, contracts] = await Promise.all([
    AssetComplaint.find({ asset: equipment._id }).sort('-complaintDate').limit(50).lean(),
    BmePreventiveMaintenance.find({ equipment: equipment._id }).sort('-scheduledDate').limit(50).lean(),
    BmeCalibration.find({ equipment: equipment._id }).sort('-calibrationDate').limit(50).lean(),
    BmeElectricalSafety.find({ equipment: equipment._id }).sort('-testDate').limit(30).lean(),
    BmeWorkOrder.find({ equipment: equipment._id }).sort('-createdAt').limit(50).lean(),
    BmeMovement.find({ equipment: equipment._id }).sort('-movedAt').limit(50).lean(),
    BmeLifecycleEvent.find({ equipment: equipment._id }).sort('-occurredAt').limit(100).lean(),
    BmeContract.find({ machinesCovered: equipment._id, status: { $in: ['Active', 'Expiring Soon'] } })
      .populate('vendor', 'name phone email')
      .lean(),
  ]);

  res.status(200).json({
    success: true,
    data: {
      equipment,
      complaints,
      preventiveMaintenance: pms,
      calibrations,
      electricalSafety: safety,
      workOrders,
      movements,
      lifecycle,
      contracts,
      documents: equipment.documents || [],
    },
  });
});

exports.getByQr = asyncHandler(async (req, res, next) => {
  const code = String(req.params.code || '').trim();
  const equipment = await Asset.findOne({
    $or: [{ qrCode: code }, { assetId: code }, { barcode: code }, { equipmentCode: code }],
    isActive: true,
  }).populate('department', 'name').populate('vendor', 'name phone email');

  if (!equipment) return next(new ErrorResponse('Equipment not found for QR/barcode', 404));

  req.params.id = equipment._id.toString();
  return exports.getEquipmentTimeline(req, res, next);
});

// ═══════════════════════════════════════════
// CHECKLIST TEMPLATES
// ═══════════════════════════════════════════

exports.listChecklists = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.type) filter.type = req.query.type;
  const data = await BmeChecklistTemplate.find(filter).sort('name');
  res.status(200).json({ success: true, count: data.length, data });
});

exports.createChecklist = asyncHandler(async (req, res) => {
  req.body.createdBy = req.user._id;
  const data = await BmeChecklistTemplate.create(req.body);
  await logActivity(req, {
    action: 'Checklist Created',
    module: 'Biomedical',
    description: `${req.user.name} created checklist "${data.name}"`,
    relatedId: data._id,
    relatedModel: 'BmeChecklistTemplate',
  });
  res.status(201).json({ success: true, data });
});

exports.updateChecklist = asyncHandler(async (req, res, next) => {
  const data = await BmeChecklistTemplate.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!data) return next(new ErrorResponse('Checklist not found', 404));
  res.status(200).json({ success: true, data });
});

// ═══════════════════════════════════════════
// PREVENTIVE MAINTENANCE
// ═══════════════════════════════════════════

exports.listPm = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.equipment) filter.equipment = req.query.equipment;
  const data = await BmePreventiveMaintenance.find(filter)
    .populate('equipment', 'assetId name status department')
    .populate('engineer', 'name')
    .sort('-scheduledDate');
  res.status(200).json({ success: true, count: data.length, data });
});

exports.schedulePm = asyncHandler(async (req, res, next) => {
  const equipment = await Asset.findById(req.body.equipment);
  if (!equipment) return next(new ErrorResponse('Equipment not found', 404));

  const intervalDays = resolvePmInterval(req.body.scheduleType, req.body.intervalDays);
  const scheduledDate = req.body.scheduledDate ? new Date(req.body.scheduledDate) : (equipment.nextPmDate || new Date());

  let checklist = req.body.checklist;
  if (!checklist?.length && req.body.templateId) {
    const tpl = await BmeChecklistTemplate.findById(req.body.templateId);
    if (tpl) checklist = tpl.items.map((i) => ({ label: i.label, done: false }));
  }
  if (!checklist?.length) {
    checklist = [
      'Cleaning', 'Battery Test', 'Electrical Safety', 'Cable Inspection',
      'Sensor Test', 'Alarm Test', 'Functional Test', 'Performance Test',
    ].map((label) => ({ label, done: false }));
  }

  const pm = await BmePreventiveMaintenance.create({
    equipment: equipment._id,
    scheduleType: req.body.scheduleType || 'Every 90 Days',
    intervalDays,
    scheduledDate,
    checklist,
    engineer: req.body.engineer,
    engineerName: req.body.engineerName,
    nextDueDate: addDays(scheduledDate, intervalDays),
    createdBy: req.user._id,
  });

  equipment.nextPmDate = scheduledDate;
  equipment.pmIntervalDays = intervalDays;
  if (scheduledDate <= new Date()) equipment.status = 'PM Due';
  await equipment.save();

  const wo = await BmeWorkOrder.create({
    type: 'Preventive Maintenance',
    equipment: equipment._id,
    department: equipment.department,
    engineer: req.body.engineer,
    engineerName: req.body.engineerName,
    priority: equipment.riskClass === 'Critical' ? 'Critical' : 'Medium',
    status: 'Pending',
    description: `PM scheduled for ${equipment.assetId}`,
    checklist,
    createdBy: req.user._id,
  });
  pm.workOrder = wo._id;
  await pm.save();

  await recordLifecycle({
    equipment: equipment._id,
    stage: 'Preventive Maintenance',
    title: `PM scheduled ${pm.pmNumber}`,
    relatedId: pm._id,
    relatedModel: 'BmePreventiveMaintenance',
    user: req.user,
  });

  if (req.body.engineer) {
    await notifyUser(req, {
      userId: req.body.engineer,
      title: 'PM Work Order Assigned',
      message: `PM ${pm.pmNumber} for ${equipment.name} (${equipment.assetId})`,
      type: 'asset',
      link: '/biomedical?tab=pm',
      relatedId: pm._id,
      relatedModel: 'BmePreventiveMaintenance',
    });
  }

  await logActivity(req, {
    action: 'PM Scheduled',
    module: 'Biomedical',
    description: `${req.user.name} scheduled PM ${pm.pmNumber} for ${equipment.assetId}`,
    relatedId: pm._id,
    relatedModel: 'BmePreventiveMaintenance',
  });

  res.status(201).json({ success: true, data: pm, workOrder: wo });
});

exports.completePm = asyncHandler(async (req, res, next) => {
  const pm = await BmePreventiveMaintenance.findById(req.params.id);
  if (!pm) return next(new ErrorResponse('PM record not found', 404));

  const performedDate = req.body.performedDate ? new Date(req.body.performedDate) : new Date();
  const intervalDays = pm.intervalDays || 90;
  const nextDue = addDays(performedDate, intervalDays);

  pm.performedDate = performedDate;
  pm.startTime = req.body.startTime || pm.startTime || performedDate;
  pm.endTime = req.body.endTime || new Date();
  pm.checklist = req.body.checklist || pm.checklist;
  pm.result = req.body.result || 'Pass';
  pm.remarks = req.body.remarks;
  pm.attachments = req.body.attachments || pm.attachments;
  pm.signature = req.body.signature;
  pm.engineer = req.body.engineer || req.user._id;
  pm.engineerName = req.body.engineerName || req.user.name;
  pm.status = 'Completed';
  pm.nextDueDate = nextDue;
  await pm.save();

  const equipment = await Asset.findById(pm.equipment);
  if (equipment) {
    equipment.lastPmDate = performedDate;
    equipment.nextPmDate = nextDue;
    equipment.pmIntervalDays = intervalDays;
    if (['PM Due', 'Idle'].includes(equipment.status) || equipment.status === 'Working') {
      equipment.status = 'Working';
    }
    await equipment.save();
  }

  if (pm.workOrder) {
    await BmeWorkOrder.findByIdAndUpdate(pm.workOrder, {
      status: 'Completed',
      endTime: pm.endTime,
      startTime: pm.startTime,
      checklist: pm.checklist,
      signature: pm.signature,
      remarks: pm.remarks,
    });
  }

  await recordLifecycle({
    equipment: pm.equipment,
    stage: 'Preventive Maintenance',
    title: `PM completed ${pm.pmNumber}`,
    description: `Result: ${pm.result}. Next due: ${nextDue.toISOString().slice(0, 10)}`,
    relatedId: pm._id,
    relatedModel: 'BmePreventiveMaintenance',
    newValue: { lastPmDate: performedDate, nextPmDate: nextDue },
    user: req.user,
  });

  await logActivity(req, {
    action: 'PM Completed',
    module: 'Biomedical',
    description: `${req.user.name} completed PM ${pm.pmNumber}`,
    relatedId: pm._id,
    relatedModel: 'BmePreventiveMaintenance',
  });

  res.status(200).json({ success: true, data: pm });
});

// ═══════════════════════════════════════════
// CALIBRATION
// ═══════════════════════════════════════════

exports.listCalibrations = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.equipment) filter.equipment = req.query.equipment;
  const data = await BmeCalibration.find(filter)
    .populate('equipment', 'assetId name status')
    .populate('engineer', 'name')
    .sort('-calibrationDate');
  res.status(200).json({ success: true, count: data.length, data });
});

exports.createCalibration = asyncHandler(async (req, res, next) => {
  const equipment = await Asset.findById(req.body.equipment);
  if (!equipment) return next(new ErrorResponse('Equipment not found', 404));

  const calibrationDate = new Date(req.body.calibrationDate || Date.now());
  const intervalDays = req.body.intervalDays || equipment.calibrationIntervalDays || 365;
  const nextCalibrationDate = req.body.nextCalibrationDate
    ? new Date(req.body.nextCalibrationDate)
    : addDays(calibrationDate, intervalDays);

  const result = req.body.result || 'Pending';
  const status = result === 'Pass' ? 'Completed' : result === 'Fail' ? 'Failed' : (req.body.status || 'Scheduled');

  const cal = await BmeCalibration.create({
    ...req.body,
    calibrationDate,
    nextCalibrationDate,
    intervalDays,
    result,
    status,
    engineer: req.body.engineer || req.user._id,
    engineerName: req.body.engineerName || req.user.name,
    createdBy: req.user._id,
  });

  const wo = await BmeWorkOrder.create({
    type: 'Calibration',
    equipment: equipment._id,
    department: equipment.department,
    engineer: cal.engineer,
    engineerName: cal.engineerName,
    status: status === 'Completed' ? 'Completed' : 'In Progress',
    description: `Calibration ${cal.calibrationNumber}`,
    startTime: calibrationDate,
    endTime: status === 'Completed' ? new Date() : undefined,
    createdBy: req.user._id,
  });
  cal.workOrder = wo._id;
  await cal.save();

  if (status === 'Completed' || status === 'Failed') {
    equipment.lastCalibrationDate = calibrationDate;
    equipment.nextCalibrationDate = nextCalibrationDate;
    equipment.calibrationIntervalDays = intervalDays;
    if (result === 'Pass' && equipment.status === 'Calibration Due') equipment.status = 'Working';
    if (result === 'Fail') equipment.status = 'Under Repair';
    if (req.body.certificateUrl) {
      equipment.documents.push({
        type: 'Calibration Certificate',
        name: req.body.certificateNumber || cal.calibrationNumber,
        url: req.body.certificateUrl,
        uploadedBy: req.user._id,
      });
    }
    await equipment.save();
  } else {
    equipment.nextCalibrationDate = calibrationDate;
    equipment.status = 'Calibration Due';
    await equipment.save();
  }

  await recordLifecycle({
    equipment: equipment._id,
    stage: 'Calibration',
    title: `Calibration ${cal.calibrationNumber} — ${result}`,
    relatedId: cal._id,
    relatedModel: 'BmeCalibration',
    newValue: { lastCalibrationDate: equipment.lastCalibrationDate, nextCalibrationDate },
    user: req.user,
  });

  await logActivity(req, {
    action: 'Calibration Recorded',
    module: 'Biomedical',
    description: `${req.user.name} recorded calibration ${cal.calibrationNumber}`,
    relatedId: cal._id,
    relatedModel: 'BmeCalibration',
  });

  res.status(201).json({ success: true, data: cal });
});

// ═══════════════════════════════════════════
// ELECTRICAL SAFETY
// ═══════════════════════════════════════════

exports.listElectricalSafety = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.equipment) filter.equipment = req.query.equipment;
  const data = await BmeElectricalSafety.find(filter)
    .populate('equipment', 'assetId name')
    .sort('-testDate');
  res.status(200).json({ success: true, count: data.length, data });
});

exports.createElectricalSafety = asyncHandler(async (req, res, next) => {
  const equipment = await Asset.findById(req.body.equipment);
  if (!equipment) return next(new ErrorResponse('Equipment not found', 404));

  const testDate = new Date(req.body.testDate || Date.now());
  const intervalDays = req.body.intervalDays || 365;
  const nextTestDate = addDays(testDate, intervalDays);
  const result = req.body.result || 'Pass';

  const record = await BmeElectricalSafety.create({
    ...req.body,
    testDate,
    nextTestDate,
    intervalDays,
    result,
    status: result === 'Pass' ? 'Completed' : result === 'Fail' ? 'Failed' : 'Scheduled',
    engineer: req.body.engineer || req.user._id,
    engineerName: req.body.engineerName || req.user.name,
    createdBy: req.user._id,
  });

  equipment.lastElectricalSafetyDate = testDate;
  equipment.nextElectricalSafetyDate = nextTestDate;
  if (req.body.certificateUrl) {
    equipment.documents.push({
      type: 'Electrical Safety Certificate',
      name: req.body.certificateNumber || record.testNumber,
      url: req.body.certificateUrl,
      uploadedBy: req.user._id,
    });
  }
  await equipment.save();

  await BmeWorkOrder.create({
    type: 'Electrical Safety',
    equipment: equipment._id,
    engineer: record.engineer,
    engineerName: record.engineerName,
    status: 'Completed',
    description: `EST ${record.testNumber}`,
    startTime: testDate,
    endTime: new Date(),
    createdBy: req.user._id,
  });

  await recordLifecycle({
    equipment: equipment._id,
    stage: 'Electrical Safety',
    title: `Electrical safety ${record.testNumber} — ${result}`,
    relatedId: record._id,
    relatedModel: 'BmeElectricalSafety',
    user: req.user,
  });

  res.status(201).json({ success: true, data: record });
});

// ═══════════════════════════════════════════
// WORK ORDERS
// ═══════════════════════════════════════════

exports.listWorkOrders = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.equipment) filter.equipment = req.query.equipment;
  const data = await BmeWorkOrder.find(filter)
    .populate('equipment', 'assetId name status riskClass')
    .populate('engineer', 'name')
    .populate('complaint', 'complaintNumber priority')
    .sort('-createdAt');
  res.status(200).json({ success: true, count: data.length, data });
});

exports.createWorkOrder = asyncHandler(async (req, res, next) => {
  const equipment = await Asset.findById(req.body.equipment);
  if (!equipment) return next(new ErrorResponse('Equipment not found', 404));

  const wo = await BmeWorkOrder.create({
    ...req.body,
    department: req.body.department || equipment.department,
    createdBy: req.user._id,
  });

  if (wo.engineer) {
    await notifyUser(req, {
      userId: wo.engineer,
      title: 'Work Order Assigned',
      message: `${wo.workOrderNumber} — ${equipment.name}`,
      type: 'asset',
      link: '/biomedical?tab=work-orders',
      relatedId: wo._id,
      relatedModel: 'BmeWorkOrder',
    });
  }

  await recordLifecycle({
    equipment: equipment._id,
    stage: 'Work Order',
    title: `Work order ${wo.workOrderNumber} created`,
    relatedId: wo._id,
    relatedModel: 'BmeWorkOrder',
    user: req.user,
  });

  res.status(201).json({ success: true, data: wo });
});

exports.updateWorkOrder = asyncHandler(async (req, res, next) => {
  const wo = await BmeWorkOrder.findById(req.params.id);
  if (!wo) return next(new ErrorResponse('Work order not found', 404));

  const prevStatus = wo.status;
  Object.assign(wo, req.body);

  // Deduct spare parts on completion
  if (req.body.status === 'Completed' && prevStatus !== 'Completed' && Array.isArray(wo.partsUsed)) {
    for (const part of wo.partsUsed) {
      if (!part.sparePart || !part.quantity) continue;
      const sp = await BmeSparePart.findById(part.sparePart);
      if (sp) {
        sp.stock = Math.max(0, sp.stock - part.quantity);
        await sp.save();
        if (sp.stock <= sp.reorderLevel) {
          await notifyRoles(req, {
            roles: BME_NOTIFY_ROLES,
            title: 'Spare Stock Low',
            message: `${sp.name} (${sp.partCode}) stock: ${sp.stock}`,
            type: 'asset',
            link: '/biomedical?tab=spares',
            relatedId: sp._id,
            relatedModel: 'BmeSparePart',
          });
        }
      }
    }

    const equipment = await Asset.findById(wo.equipment);
    if (equipment) {
      if (wo.startTime && wo.endTime) {
        const hrs = (new Date(wo.endTime) - new Date(wo.startTime)) / 3600000;
        if (hrs > 0) equipment.totalDowntimeHours += hrs;
      }
      if (wo.type === 'Breakdown') {
        equipment.lastRepairDate = wo.endTime || new Date();
        equipment.status = 'Working';
      }
      await equipment.save();
    }

    await notifyRoles(req, {
      roles: BME_NOTIFY_ROLES,
      title: 'Work Order Completed',
      message: `${wo.workOrderNumber} completed`,
      type: 'asset',
      link: '/biomedical?tab=work-orders',
      relatedId: wo._id,
      relatedModel: 'BmeWorkOrder',
      excludeUserId: req.user._id,
    });
  }

  if (req.body.status === 'In Progress' || req.body.status === 'Assigned') {
    const equipment = await Asset.findById(wo.equipment);
    if (equipment && wo.type === 'Breakdown') {
      equipment.status = 'Under Repair';
      await equipment.save();
    }
  }

  await wo.save();
  res.status(200).json({ success: true, data: wo });
});

// ═══════════════════════════════════════════
// SPARE PARTS
// ═══════════════════════════════════════════

exports.listSpares = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.lowStock === 'true') filter.$expr = { $lte: ['$stock', '$reorderLevel'] };
  const data = await BmeSparePart.find(filter).populate('supplier', 'name').sort('name');
  res.status(200).json({ success: true, count: data.length, data });
});

exports.createSpare = asyncHandler(async (req, res) => {
  req.body.createdBy = req.user._id;
  const data = await BmeSparePart.create(req.body);
  await logActivity(req, {
    action: 'Spare Part Created',
    module: 'Biomedical',
    description: `${req.user.name} added spare ${data.name}`,
    relatedId: data._id,
    relatedModel: 'BmeSparePart',
  });
  res.status(201).json({ success: true, data });
});

exports.updateSpare = asyncHandler(async (req, res, next) => {
  const data = await BmeSparePart.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!data) return next(new ErrorResponse('Spare part not found', 404));
  res.status(200).json({ success: true, data });
});

exports.adjustSpareStock = asyncHandler(async (req, res, next) => {
  const sp = await BmeSparePart.findById(req.params.id);
  if (!sp) return next(new ErrorResponse('Spare part not found', 404));
  const qty = Number(req.body.quantity || 0);
  const type = req.body.type || 'in';
  sp.stock = type === 'out' ? Math.max(0, sp.stock - Math.abs(qty)) : sp.stock + Math.abs(qty);
  if (req.body.batch) sp.batch = req.body.batch;
  await sp.save();
  res.status(200).json({ success: true, data: sp });
});

// ═══════════════════════════════════════════
// VENDORS
// ═══════════════════════════════════════════

exports.listVendors = asyncHandler(async (req, res) => {
  const data = await BmeVendor.find({ isActive: true }).sort('name');
  res.status(200).json({ success: true, count: data.length, data });
});

exports.createVendor = asyncHandler(async (req, res) => {
  req.body.createdBy = req.user._id;
  const data = await BmeVendor.create(req.body);
  await logActivity(req, {
    action: 'BME Vendor Created',
    module: 'Biomedical',
    description: `${req.user.name} added vendor ${data.name}`,
    relatedId: data._id,
    relatedModel: 'BmeVendor',
  });
  res.status(201).json({ success: true, data });
});

exports.updateVendor = asyncHandler(async (req, res, next) => {
  const data = await BmeVendor.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!data) return next(new ErrorResponse('Vendor not found', 404));
  res.status(200).json({ success: true, data });
});

// ═══════════════════════════════════════════
// AMC / CMC CONTRACTS
// ═══════════════════════════════════════════

exports.listContracts = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.type) filter.type = req.query.type;
  if (req.query.status) filter.status = req.query.status;
  const data = await BmeContract.find(filter)
    .populate('vendor', 'name phone email')
    .populate('machinesCovered', 'assetId name')
    .sort('-endDate');
  res.status(200).json({ success: true, count: data.length, data });
});

exports.createContract = asyncHandler(async (req, res, next) => {
  const vendor = await BmeVendor.findById(req.body.vendor);
  if (!vendor) return next(new ErrorResponse('Vendor not found', 404));

  const contract = await BmeContract.create({ ...req.body, createdBy: req.user._id });

  // Sync expiry onto covered equipment
  if (Array.isArray(contract.machinesCovered)) {
    const field = contract.type === 'CMC' ? 'cmcExpiry' : 'amcExpiry';
    await Asset.updateMany(
      { _id: { $in: contract.machinesCovered } },
      { $set: { [field]: contract.endDate } }
    );
  }

  await logActivity(req, {
    action: `${contract.type} Created`,
    module: 'Biomedical',
    description: `${req.user.name} created ${contract.contractNumber}`,
    relatedId: contract._id,
    relatedModel: 'BmeContract',
  });

  res.status(201).json({ success: true, data: contract });
});

exports.updateContract = asyncHandler(async (req, res, next) => {
  const contract = await BmeContract.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!contract) return next(new ErrorResponse('Contract not found', 404));

  if (contract.machinesCovered?.length) {
    const field = contract.type === 'CMC' ? 'cmcExpiry' : 'amcExpiry';
    await Asset.updateMany(
      { _id: { $in: contract.machinesCovered } },
      { $set: { [field]: contract.endDate } }
    );
  }
  res.status(200).json({ success: true, data: contract });
});

// ═══════════════════════════════════════════
// EQUIPMENT MOVEMENT
// ═══════════════════════════════════════════

exports.listMovements = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.equipment) filter.equipment = req.query.equipment;
  const data = await BmeMovement.find(filter)
    .populate('equipment', 'assetId name')
    .populate('from.department', 'name')
    .populate('to.department', 'name')
    .sort('-movedAt');
  res.status(200).json({ success: true, count: data.length, data });
});

exports.createMovement = asyncHandler(async (req, res, next) => {
  const equipment = await Asset.findById(req.body.equipment).populate('department', 'name');
  if (!equipment) return next(new ErrorResponse('Equipment not found', 404));

  const from = {
    hospital: equipment.hospital,
    building: equipment.building,
    floor: equipment.floor,
    department: equipment.department?._id || equipment.department,
    departmentName: equipment.department?.name,
    room: equipment.room,
    ward: equipment.ward,
    bed: equipment.bed,
    location: equipment.location,
  };

  const to = req.body.to || {};
  const movement = await BmeMovement.create({
    equipment: equipment._id,
    from,
    to,
    reason: req.body.reason,
    movedAt: req.body.movedAt || new Date(),
    engineer: req.body.engineer || req.user._id,
    engineerName: req.body.engineerName || req.user.name,
    approvedBy: req.body.approvedBy,
    approvedByName: req.body.approvedByName,
    receivedBy: req.body.receivedBy,
    remarks: req.body.remarks,
    createdBy: req.user._id,
  });

  // Update current location only — never overwrite history (stored in movement)
  if (to.hospital != null) equipment.hospital = to.hospital;
  if (to.building != null) equipment.building = to.building;
  if (to.floor != null) equipment.floor = to.floor;
  if (to.department != null) equipment.department = to.department;
  if (to.room != null) equipment.room = to.room;
  if (to.ward != null) equipment.ward = to.ward;
  if (to.bed != null) equipment.bed = to.bed;
  if (to.location != null) equipment.location = to.location;
  equipment.lifecycleStage = 'Transfer';
  equipment.status = 'Working';
  await equipment.save();

  await recordLifecycle({
    equipment: equipment._id,
    stage: 'Transfer',
    title: `Moved ${movement.movementNumber}`,
    description: req.body.reason,
    oldValue: from,
    newValue: to,
    relatedId: movement._id,
    relatedModel: 'BmeMovement',
    user: req.user,
  });

  await logActivity(req, {
    action: 'Equipment Moved',
    module: 'Biomedical',
    description: `${req.user.name} moved ${equipment.assetId}`,
    relatedId: movement._id,
    relatedModel: 'BmeMovement',
  });

  res.status(201).json({ success: true, data: movement });
});

// ═══════════════════════════════════════════
// LIFECYCLE / INSTALLATION / COMMISSIONING
// ═══════════════════════════════════════════

exports.advanceLifecycle = asyncHandler(async (req, res, next) => {
  const equipment = await Asset.findById(req.params.id);
  if (!equipment) return next(new ErrorResponse('Equipment not found', 404));

  const stage = req.body.stage;
  const oldStage = equipment.lifecycleStage;
  equipment.lifecycleStage = stage;

  if (stage === 'Installation') {
    equipment.installationDate = req.body.date || new Date();
    equipment.status = 'Idle';
    if (req.body.reportUrl) {
      equipment.documents.push({
        type: 'Installation Report',
        name: req.body.reportName || 'Installation Report',
        url: req.body.reportUrl,
        uploadedBy: req.user._id,
      });
    }
  }
  if (stage === 'Commissioning') {
    equipment.commissioningDate = req.body.date || new Date();
    equipment.status = 'Working';
    equipment.lifecycleStage = 'In Service';
    if (req.body.reportUrl) {
      equipment.documents.push({
        type: 'Commissioning Report',
        name: req.body.reportName || 'Commissioning Report',
        url: req.body.reportUrl,
        uploadedBy: req.user._id,
      });
    }
  }
  if (stage === 'Condemned') {
    equipment.condemnationDate = req.body.date || new Date();
    equipment.status = 'Condemned';
    equipment.isActive = true;
  }
  if (stage === 'Disposed') {
    equipment.disposalDate = req.body.date || new Date();
    equipment.status = 'Disposed';
    equipment.isActive = false;
  }
  if (stage === 'Department Assignment' && req.body.department) {
    equipment.department = req.body.department;
    equipment.lifecycleStage = 'In Service';
  }

  await equipment.save();

  await recordLifecycle({
    equipment: equipment._id,
    stage: stage === 'Commissioning' ? 'Commissioning' : stage,
    title: `Lifecycle → ${equipment.lifecycleStage}`,
    description: req.body.remarks,
    oldValue: { lifecycleStage: oldStage },
    newValue: { lifecycleStage: equipment.lifecycleStage, status: equipment.status },
    user: req.user,
  });

  await logActivity(req, {
    action: 'Lifecycle Updated',
    module: 'Biomedical',
    description: `${req.user.name} set ${equipment.assetId} to ${equipment.lifecycleStage}`,
    relatedId: equipment._id,
    relatedModel: 'Asset',
  });

  res.status(200).json({ success: true, data: equipment });
});

exports.addDocument = asyncHandler(async (req, res, next) => {
  const equipment = await Asset.findById(req.params.id);
  if (!equipment) return next(new ErrorResponse('Equipment not found', 404));

  equipment.documents.push({
    type: req.body.type || 'Other',
    name: req.body.name,
    url: req.body.url,
    uploadedBy: req.user._id,
  });
  await equipment.save();

  await recordLifecycle({
    equipment: equipment._id,
    stage: 'Document Upload',
    title: `Document: ${req.body.name || req.body.type}`,
    user: req.user,
  });

  res.status(200).json({ success: true, data: equipment.documents });
});

// ═══════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════

exports.getReports = asyncHandler(async (req, res) => {
  const type = req.query.type || 'register';
  const now = new Date();

  if (type === 'register') {
    const data = await Asset.find({ isActive: true })
      .populate('department', 'name')
      .populate('vendor', 'name')
      .sort('assetId')
      .lean();
    return res.status(200).json({ success: true, type, count: data.length, data });
  }

  if (type === 'pm') {
    const data = await BmePreventiveMaintenance.find()
      .populate('equipment', 'assetId name')
      .sort('-scheduledDate')
      .lean();
    return res.status(200).json({ success: true, type, count: data.length, data });
  }

  if (type === 'calibration') {
    const data = await BmeCalibration.find()
      .populate('equipment', 'assetId name')
      .sort('-calibrationDate')
      .lean();
    return res.status(200).json({ success: true, type, count: data.length, data });
  }

  if (type === 'complaints') {
    const data = await AssetComplaint.find()
      .populate('asset', 'assetId name')
      .sort('-complaintDate')
      .lean();
    return res.status(200).json({ success: true, type, count: data.length, data });
  }

  if (type === 'downtime') {
    const data = await Asset.find({ isActive: true, totalDowntimeHours: { $gt: 0 } })
      .select('assetId name totalDowntimeHours failureCount status department')
      .populate('department', 'name')
      .sort('-totalDowntimeHours')
      .lean();
    return res.status(200).json({ success: true, type, count: data.length, data });
  }

  if (type === 'spares') {
    const data = await BmeSparePart.find({ isActive: true }).sort('name').lean();
    return res.status(200).json({ success: true, type, count: data.length, data });
  }

  if (type === 'amc' || type === 'warranty') {
    if (type === 'amc') {
      const data = await BmeContract.find()
        .populate('vendor', 'name')
        .populate('machinesCovered', 'assetId name')
        .sort('-endDate')
        .lean();
      return res.status(200).json({ success: true, type, count: data.length, data });
    }
    const data = await Asset.find({
      isActive: true,
      warrantyExpiry: { $exists: true },
    }).select('assetId name warrantyExpiry warrantyStart vendorName status').sort('warrantyExpiry').lean();
    return res.status(200).json({ success: true, type, count: data.length, data });
  }

  if (type === 'condemned') {
    const data = await Asset.find({ status: { $in: ['Condemned', 'Disposed', 'Decommissioned'] } })
      .populate('department', 'name')
      .lean();
    return res.status(200).json({ success: true, type, count: data.length, data });
  }

  if (type === 'age') {
    const data = await Asset.find({ isActive: true, purchaseDate: { $exists: true } })
      .select('assetId name purchaseDate purchaseCost currentValue category status')
      .lean();
    const enriched = data.map((a) => ({
      ...a,
      ageYears: a.purchaseDate
        ? Math.round(((now - new Date(a.purchaseDate)) / (365.25 * 24 * 3600000)) * 10) / 10
        : null,
    }));
    return res.status(200).json({ success: true, type, count: enriched.length, data: enriched });
  }

  if (type === 'engineer') {
    const data = await BmeWorkOrder.aggregate([
      { $match: { status: 'Completed' } },
      {
        $group: {
          _id: '$engineer',
          completed: { $sum: 1 },
          totalCost: { $sum: '$cost' },
          name: { $first: '$engineerName' },
        },
      },
      { $sort: { completed: -1 } },
    ]);
    return res.status(200).json({ success: true, type, count: data.length, data });
  }

  res.status(200).json({ success: true, type, data: [] });
});

// Seed default PM checklists once (idempotent helper)
exports.seedDefaults = asyncHandler(async (req, res) => {
  const count = await BmeChecklistTemplate.countDocuments();
  if (count === 0) {
    await BmeChecklistTemplate.create({
      name: 'Standard Preventive Maintenance',
      type: 'Preventive Maintenance',
      items: [
        'Cleaning', 'Battery Test', 'Electrical Safety', 'Cable Inspection',
        'Sensor Test', 'Alarm Test', 'Functional Test', 'Performance Test',
        'Print Test', 'Software Update',
      ].map((label, order) => ({ label, required: true, order })),
      createdBy: req.user._id,
    });
  }
  res.status(200).json({ success: true, message: 'Defaults ready' });
});
