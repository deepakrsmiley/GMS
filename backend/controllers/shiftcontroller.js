const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Shift = require('../models/shift');
const Bill = require('../models/Bill');
const LabTest = require('../models/LabTest');

// ── Open a new shift ──────────────────────────────────────────────────────────
exports.openShift = asyncHandler(async (req, res, next) => {
  // Prevent opening if this user already has an open shift
  const existing = await Shift.findOne({ openedBy: req.user._id, status: 'open' });
  if (existing) {
    return next(new ErrorResponse('You already have an open shift. Please close it first.', 400));
  }

  const { shiftName } = req.body;
  if (!shiftName) return next(new ErrorResponse('Shift name is required', 400));

  const shift = await Shift.create({ shiftName, openedBy: req.user._id });
  await shift.populate('openedBy', 'name role');
  res.status(201).json({ success: true, data: shift });
});

// ── Get my current open shift ─────────────────────────────────────────────────
exports.getMyOpenShift = asyncHandler(async (req, res) => {
  const shift = await Shift.findOne({ openedBy: req.user._id, status: 'open' })
    .populate('openedBy', 'name role');
  res.status(200).json({ success: true, data: shift || null });
});

// ── Get shift report (revenue in shift window) ────────────────────────────────
// This endpoint lets a night-shift user VIEW older shift summaries before settling
exports.getShiftReport = asyncHandler(async (req, res, next) => {
  const shift = await Shift.findById(req.params.id)
    .populate('openedBy', 'name role')
    .populate('closedBy', 'name role');
  if (!shift) return next(new ErrorResponse('Shift not found', 404));

  const from = shift.openedAt;
  const to = shift.closedAt || new Date();

  // Bills raised during this shift window
  const bills = await Bill.find({
    createdAt: { $gte: from, $lte: to },
    status: { $in: ['paid', 'partial'] },
  }).select('billType totalAmount paidAmount payments createdAt');

  const summary = {
    totalBills: bills.length,
    totalRevenue: bills.reduce((s, b) => s + (b.paidAmount || 0), 0),
    cashAmount: 0,
    cardAmount: 0,
    upiAmount: 0,
    otherAmount: 0,
    labRevenue: 0,
    pharmacyRevenue: 0,
    opRevenue: 0,
    ipRevenue: 0,
  };

  bills.forEach((b) => {
    (b.payments || []).forEach((p) => {
      if (p.mode === 'cash') summary.cashAmount += p.amount;
      else if (p.mode === 'card') summary.cardAmount += p.amount;
      else if (p.mode === 'upi') summary.upiAmount += p.amount;
      else summary.otherAmount += p.amount;
    });
    if (b.billType === 'lab') summary.labRevenue += b.paidAmount || 0;
    else if (b.billType === 'pharmacy') summary.pharmacyRevenue += b.paidAmount || 0;
    else if (b.billType === 'op') summary.opRevenue += b.paidAmount || 0;
    else if (b.billType === 'ip') summary.ipRevenue += b.paidAmount || 0;
  });

  // Lab tests created in this shift window
  const labTests = await LabTest.find({ createdAt: { $gte: from, $lte: to } })
    .select('labNumber patient status totalAmount tests createdAt')
    .populate('patient', 'name patientId');

  res.status(200).json({ success: true, data: { shift, summary, bills, labTests } });
});

// ── Get all shifts (paginated, for viewing history) ───────────────────────────
exports.getAllShifts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const [shifts, total] = await Promise.all([
    Shift.find(filter)
      .sort({ openedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('openedBy', 'name role')
      .populate('closedBy', 'name role'),
    Shift.countDocuments(filter),
  ]);

  res.status(200).json({ success: true, count: shifts.length, total, pages: Math.ceil(total / limit), page, data: shifts });
});

// ── Close shift + record settlement ──────────────────────────────────────────
exports.closeShift = asyncHandler(async (req, res, next) => {
  const shift = await Shift.findById(req.params.id);
  if (!shift) return next(new ErrorResponse('Shift not found', 404));

  // Only the person who opened the shift can close/settle it
  if (shift.openedBy.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse('Only the person who opened this shift can close it', 403));
  }

  if (shift.status === 'closed') {
    return next(new ErrorResponse('Shift is already closed', 400));
  }

  const from = shift.openedAt;
  const to = new Date();

  // Auto-calculate revenue during this shift
  const bills = await Bill.find({
    createdAt: { $gte: from, $lte: to },
    status: { $in: ['paid', 'partial'] },
  }).select('billType totalAmount paidAmount payments');

  let cashAmount = 0, cardAmount = 0, upiAmount = 0, otherAmount = 0;
  let labRevenue = 0, pharmacyRevenue = 0, opRevenue = 0, ipRevenue = 0;

  bills.forEach((b) => {
    (b.payments || []).forEach((p) => {
      if (p.mode === 'cash') cashAmount += p.amount;
      else if (p.mode === 'card') cardAmount += p.amount;
      else if (p.mode === 'upi') upiAmount += p.amount;
      else otherAmount += p.amount;
    });
    if (b.billType === 'lab') labRevenue += b.paidAmount || 0;
    else if (b.billType === 'pharmacy') pharmacyRevenue += b.paidAmount || 0;
    else if (b.billType === 'op') opRevenue += b.paidAmount || 0;
    else if (b.billType === 'ip') ipRevenue += b.paidAmount || 0;
  });

  const totalCollected = cashAmount + cardAmount + upiAmount + otherAmount;

  shift.status = 'closed';
  shift.closedBy = req.user._id;
  shift.closedAt = to;
  shift.settlement = {
    settledBy: req.user._id,
    settledAt: to,
    cashAmount,
    cardAmount,
    upiAmount,
    otherAmount,
    totalCollected,
    labRevenue,
    pharmacyRevenue,
    opRevenue,
    ipRevenue,
    totalBills: bills.length,
    notes: req.body.notes || '',
  };

  await shift.save();
  await shift.populate('openedBy', 'name role');
  await shift.populate('closedBy', 'name role');

  res.status(200).json({ success: true, data: shift });
});