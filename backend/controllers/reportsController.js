const asyncHandler = require('../utils/asyncHandler');
const Patient = require('../models/Patient');
const OPRegistration = require('../models/OPRegistration');
const IPAdmission = require('../models/IPAdmission');
const Bed = require('../models/Bed');
const Bill = require('../models/Bill');
const LabTest = require('../models/LabTest');
const DirectSale = require('../models/DirectSale');
const Department = require('../models/Department');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const parseRange = (req) => {
  const now = new Date();
  let from = req.query.from ? new Date(req.query.from) : new Date(now);
  let to = req.query.to ? new Date(req.query.to) : new Date(now);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  if (from > to) [from, to] = [to, from];
  return { from, to };
};

const prevRange = (from, to) => {
  const spanMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  return { prevFrom, prevTo };
};

const pctChange = (curr, prev) => {
  if (!prev) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
};

const dayList = (from, to) => {
  const days = [];
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (d <= end) {
    days.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return days;
};

const fillSeries = (days, rows, keys) => {
  const map = {};
  rows.forEach((r) => { map[r._id] = r; });
  return days.map((day) => {
    const row = map[day] || {};
    const out = { date: day };
    keys.forEach((k) => { out[k] = row[k] || 0; });
    return out;
  });
};

// ---------------------------------------------------------------------------
// GET /api/reports/summary?from=&to=
// One-shot payload for the Reports & Business Intelligence dashboard
// ---------------------------------------------------------------------------
exports.getReportsSummary = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req);
  const { prevFrom, prevTo } = prevRange(from, to);
  const days = dayList(from, to);

  const paidStatus = { $in: ['paid', 'partial'] };

  const [
    opCount, opCountPrev,
    ipCount, ipCountPrev,
    admissionsCount, admissionsCountPrev,
    dischargesCount, dischargesCountPrev,
    revenueAgg, revenueAggPrev,
    pendingBillsAgg,
    labTestsCount, labTestsCountPrev,
    pharmacySalesAgg, pharmacySalesAggPrev,
    bedStatsRaw,
    insuranceAgg, insuranceAggPrev,
  ] = await Promise.all([
    OPRegistration.countDocuments({ tokenDate: { $gte: from, $lte: to } }),
    OPRegistration.countDocuments({ tokenDate: { $gte: prevFrom, $lte: prevTo } }),
    IPAdmission.countDocuments({ admissionDate: { $gte: from, $lte: to } }),
    IPAdmission.countDocuments({ admissionDate: { $gte: prevFrom, $lte: prevTo } }),
    IPAdmission.countDocuments({ admissionDate: { $gte: from, $lte: to } }),
    IPAdmission.countDocuments({ admissionDate: { $gte: prevFrom, $lte: prevTo } }),
    IPAdmission.countDocuments({ dischargeDate: { $gte: from, $lte: to } }),
    IPAdmission.countDocuments({ dischargeDate: { $gte: prevFrom, $lte: prevTo } }),
    Bill.aggregate([{ $match: { createdAt: { $gte: from, $lte: to }, status: paidStatus } }, { $group: { _id: null, total: { $sum: '$paidAmount' } } }]),
    Bill.aggregate([{ $match: { createdAt: { $gte: prevFrom, $lte: prevTo }, status: paidStatus } }, { $group: { _id: null, total: { $sum: '$paidAmount' } } }]),
    Bill.aggregate([{ $match: { status: { $in: ['pending', 'partial'] } } }, { $group: { _id: null, total: { $sum: '$dueAmount' } } }]),
    LabTest.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    LabTest.countDocuments({ createdAt: { $gte: prevFrom, $lte: prevTo } }),
    DirectSale.aggregate([{ $match: { saleDate: { $gte: from, $lte: to } } }, { $group: { _id: null, total: { $sum: '$grandTotal' } } }]),
    DirectSale.aggregate([{ $match: { saleDate: { $gte: prevFrom, $lte: prevTo } } }, { $group: { _id: null, total: { $sum: '$grandTotal' } } }]),
    Bed.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Bill.aggregate([{ $match: { createdAt: { $gte: from, $lte: to }, 'insuranceClaim.claimNumber': { $exists: true, $ne: null } } }, { $group: { _id: null, total: { $sum: '$insuranceClaim.approvedAmount' }, count: { $sum: 1 } } }]),
    Bill.aggregate([{ $match: { createdAt: { $gte: prevFrom, $lte: prevTo }, 'insuranceClaim.claimNumber': { $exists: true, $ne: null } } }, { $group: { _id: null, total: { $sum: '$insuranceClaim.approvedAmount' } } }]),
  ]);

  const revenue = revenueAgg[0]?.total || 0;
  const revenuePrev = revenueAggPrev[0]?.total || 0;
  const pharmacySales = pharmacySalesAgg[0]?.total || 0;
  const pharmacySalesPrev = pharmacySalesAggPrev[0]?.total || 0;
  const pendingBills = pendingBillsAgg[0]?.total || 0;
  const insuranceTotal = insuranceAgg[0]?.total || 0;
  const insuranceTotalPrev = insuranceAggPrev[0]?.total || 0;

  const bedStat = bedStatsRaw.reduce((acc, b) => { acc[b._id] = b.count; return acc; }, {});
  const totalBeds = Object.values(bedStat).reduce((s, v) => s + v, 0);
  const occupiedBeds = bedStat.occupied || 0;
  const bedOccupancyPct = totalBeds ? Math.round((occupiedBeds / totalBeds) * 1000) / 10 : 0;

  // ---- KPI cards ----
  const kpis = {
    opCount: { value: opCount, change: pctChange(opCount, opCountPrev), prev: opCountPrev },
    ipCount: { value: ipCount, change: pctChange(ipCount, ipCountPrev), prev: ipCountPrev },
    admissions: { value: admissionsCount, change: pctChange(admissionsCount, admissionsCountPrev), prev: admissionsCountPrev },
    discharges: { value: dischargesCount, change: pctChange(dischargesCount, dischargesCountPrev), prev: dischargesCountPrev },
    revenue: { value: revenue, change: pctChange(revenue, revenuePrev), prev: revenuePrev },
    pendingBills: { value: pendingBills, change: 0 },
    labTests: { value: labTestsCount, change: pctChange(labTestsCount, labTestsCountPrev), prev: labTestsCountPrev },
    pharmacySales: { value: pharmacySales, change: pctChange(pharmacySales, pharmacySalesPrev), prev: pharmacySalesPrev },
    bedOccupancy: { value: bedOccupancyPct, occupied: occupiedBeds, total: totalBeds, change: 0 },
    insuranceClaims: { value: insuranceTotal, change: pctChange(insuranceTotal, insuranceTotalPrev), prev: insuranceTotalPrev },
  };

  // ---- Revenue trend (daily, within range) ----
  const revenueTrendRaw = await Bill.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, status: paidStatus } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$paidAmount' } } },
  ]);
  const revenueTrend = fillSeries(days, revenueTrendRaw, ['revenue']);

  // ---- OP vs IP trend ----
  const [opTrendRaw, ipTrendRaw] = await Promise.all([
    OPRegistration.aggregate([
      { $match: { tokenDate: { $gte: from, $lte: to } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$tokenDate' } }, opCount: { $sum: 1 } } },
    ]),
    IPAdmission.aggregate([
      { $match: { admissionDate: { $gte: from, $lte: to } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$admissionDate' } }, ipCount: { $sum: 1 } } },
    ]),
  ]);
  const opIpMap = {};
  days.forEach((d) => { opIpMap[d] = { date: d, opCount: 0, ipCount: 0 }; });
  opTrendRaw.forEach((r) => { if (opIpMap[r._id]) opIpMap[r._id].opCount = r.opCount; });
  ipTrendRaw.forEach((r) => { if (opIpMap[r._id]) opIpMap[r._id].ipCount = r.ipCount; });
  const opVsIpTrend = days.map((d) => opIpMap[d]);

  // ---- Department-wise revenue ----
  const departmentRevenueRaw = await Bill.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, status: paidStatus, department: { $ne: null } } },
    { $group: { _id: '$department', revenue: { $sum: '$paidAmount' } } },
    { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
    { $unwind: { path: '$dept', preserveNullAndEmptyArrays: true } },
    { $project: { name: { $ifNull: ['$dept.name', 'Other'] }, revenue: 1 } },
    { $sort: { revenue: -1 } },
    { $limit: 8 },
  ]);

  // ---- Doctor performance (consultation count) ----
  const doctorPerformanceRaw = await OPRegistration.aggregate([
    { $match: { tokenDate: { $gte: from, $lte: to } } },
    { $group: { _id: '$doctor', count: { $sum: 1 } } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'doc' } },
    { $unwind: { path: '$doc', preserveNullAndEmptyArrays: true } },
    { $project: { doctorName: { $ifNull: ['$doc.name', 'Unassigned'] }, count: 1 } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);

  // ---- Payment mode distribution ----
  const paymentModeRaw = await Bill.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, status: paidStatus } },
    { $unwind: { path: '$payments', preserveNullAndEmptyArrays: true } },
    { $group: { _id: { $ifNull: ['$payments.mode', '$paymentMode'] }, amount: { $sum: { $ifNull: ['$payments.amount', '$paidAmount'] } } } },
    { $match: { _id: { $ne: null } } },
    { $sort: { amount: -1 } },
  ]);
  const paymentModeTotal = paymentModeRaw.reduce((s, r) => s + r.amount, 0);
  const paymentModeDistribution = paymentModeRaw.map((r) => ({
    mode: r._id,
    amount: r.amount,
    percent: paymentModeTotal ? Math.round((r.amount / paymentModeTotal) * 1000) / 10 : 0,
  }));

  // ---- Admissions vs Discharges (daily) ----
  const [admRaw, disRaw] = await Promise.all([
    IPAdmission.aggregate([
      { $match: { admissionDate: { $gte: from, $lte: to } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$admissionDate' } }, admissions: { $sum: 1 } } },
    ]),
    IPAdmission.aggregate([
      { $match: { dischargeDate: { $gte: from, $lte: to } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$dischargeDate' } }, discharges: { $sum: 1 } } },
    ]),
  ]);
  const admDisMap = {};
  days.forEach((d) => { admDisMap[d] = { date: d, admissions: 0, discharges: 0 }; });
  admRaw.forEach((r) => { if (admDisMap[r._id]) admDisMap[r._id].admissions = r.admissions; });
  disRaw.forEach((r) => { if (admDisMap[r._id]) admDisMap[r._id].discharges = r.discharges; });
  const admissionsVsDischarges = days.map((d) => admDisMap[d]);

  // ---- Pharmacy sales trend ----
  const pharmacyTrendRaw = await DirectSale.aggregate([
    { $match: { saleDate: { $gte: from, $lte: to } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } }, sales: { $sum: '$grandTotal' } } },
  ]);
  const pharmacySalesTrend = fillSeries(days, pharmacyTrendRaw.map((r) => ({ _id: r._id, sales: r.sales })), ['sales']);

  // ---- Lab tests trend ----
  const labTrendRaw = await LabTest.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, tests: { $sum: 1 } } },
  ]);
  const labTestsTrend = fillSeries(days, labTrendRaw.map((r) => ({ _id: r._id, tests: r.tests })), ['tests']);

  // ---- Monthly patient growth (last 6 months, registrations) ----
  const sixMonthsAgo = new Date(to);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);
  const monthlyGrowthRaw = await Patient.aggregate([
    { $match: { createdAt: { $gte: sixMonthsAgo, $lte: to } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const monthLabels = [];
  const mCursor = new Date(sixMonthsAgo);
  for (let i = 0; i < 6; i += 1) {
    monthLabels.push(mCursor.toISOString().slice(0, 7));
    mCursor.setMonth(mCursor.getMonth() + 1);
  }
  const monthlyMap = {};
  monthlyGrowthRaw.forEach((r) => { monthlyMap[r._id] = r.count; });
  const monthlyPatientGrowth = monthLabels.map((m) => ({ month: m, count: monthlyMap[m] || 0 }));

  // ---- Bed occupancy breakdown ----
  const bedOccupancy = {
    occupied: bedStat.occupied || 0,
    available: bedStat.available || 0,
    cleaning: bedStat.cleaning || 0,
    maintenance: bedStat.maintenance || 0,
    reserved: bedStat.reserved || 0,
    total: totalBeds,
    occupiedPercent: bedOccupancyPct,
  };

  res.status(200).json({
    success: true,
    data: {
      range: { from, to },
      kpis,
      revenueTrend,
      opVsIpTrend,
      departmentRevenue: departmentRevenueRaw,
      doctorPerformance: doctorPerformanceRaw,
      paymentModeDistribution,
      admissionsVsDischarges,
      pharmacySalesTrend,
      labTestsTrend,
      monthlyPatientGrowth,
      bedOccupancy,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/reports/detailed?from=&to=&page=&limit=
// Day-by-day OP summary table (drives "Detailed Report - OP Summary")
// ---------------------------------------------------------------------------
exports.getDetailedReport = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit) || 10, 1);
  const days = dayList(from, to).reverse();

  const paidStatus = { $in: ['paid', 'partial'] };

  const [opRaw, ipRaw, admRaw, disRaw, revRaw, labRaw, pharmRaw, pendRaw] = await Promise.all([
    OPRegistration.aggregate([{ $match: { tokenDate: { $gte: from, $lte: to } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$tokenDate' } }, count: { $sum: 1 } } }]),
    IPAdmission.aggregate([{ $match: { admissionDate: { $gte: from, $lte: to } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$admissionDate' } }, count: { $sum: 1 } } }]),
    IPAdmission.aggregate([{ $match: { admissionDate: { $gte: from, $lte: to } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$admissionDate' } }, count: { $sum: 1 } } }]),
    IPAdmission.aggregate([{ $match: { dischargeDate: { $gte: from, $lte: to } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$dischargeDate' } }, count: { $sum: 1 } } }]),
    Bill.aggregate([{ $match: { createdAt: { $gte: from, $lte: to }, status: paidStatus } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$paidAmount' } } }]),
    LabTest.aggregate([{ $match: { createdAt: { $gte: from, $lte: to } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } }]),
    DirectSale.aggregate([{ $match: { saleDate: { $gte: from, $lte: to } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } }, total: { $sum: '$grandTotal' } } }]),
    Bill.aggregate([{ $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ['pending', 'partial'] } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$dueAmount' } } }]),
  ]);

  const toMap = (rows, field) => rows.reduce((acc, r) => { acc[r._id] = r[field]; return acc; }, {});
  const opMap = toMap(opRaw, 'count');
  const admMap = toMap(admRaw, 'count');
  const disMap = toMap(disRaw, 'count');
  const revMap = toMap(revRaw, 'total');
  const labMap = toMap(labRaw, 'count');
  const pharmMap = toMap(pharmRaw, 'total');
  const pendMap = toMap(pendRaw, 'total');

  const rows = days.map((d) => ({
    date: d,
    opCount: opMap[d] || 0,
    ipCount: admMap[d] || 0,
    admissions: admMap[d] || 0,
    discharges: disMap[d] || 0,
    revenue: revMap[d] || 0,
    labTests: labMap[d] || 0,
    pharmacySales: pharmMap[d] || 0,
    pendingBills: pendMap[d] || 0,
  }));

  const total = rows.length;
  const start = (page - 1) * limit;
  const paginated = rows.slice(start, start + limit);

  res.status(200).json({
    success: true,
    data: paginated,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  });
});
