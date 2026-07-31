const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const AssetComplaint = require('../models/AssetComplaint');
const Asset = require('../models/Asset');

// @desc    Get all complaints
// @route   GET /api/asset-complaints
exports.getComplaints = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.priority) filter.priority = req.query.priority;
  if (req.query.asset) filter.asset = req.query.asset;

  const complaints = await AssetComplaint.find(filter)
    .populate('asset', 'assetId name')
    .populate('reportedBy', 'name')
    .populate('closedBy', 'name')
    .sort('-complaintDate');

  res.status(200).json({ success: true, count: complaints.length, data: complaints });
});

// @desc    Get single complaint
// @route   GET /api/asset-complaints/:id
exports.getComplaint = asyncHandler(async (req, res, next) => {
  const complaint = await AssetComplaint.findById(req.params.id)
    .populate('asset', 'assetId name category department')
    .populate('reportedBy', 'name role')
    .populate('closedBy', 'name');
  if (!complaint) return next(new ErrorResponse('Complaint not found', 404));
  res.status(200).json({ success: true, data: complaint });
});

// @desc    Create complaint
// @route   POST /api/asset-complaints
exports.createComplaint = asyncHandler(async (req, res, next) => {
  // Get asset details for denormalization
  const asset = await Asset.findById(req.body.asset);
  if (!asset) return next(new ErrorResponse('Asset not found', 404));

  req.body.assetName = asset.name;
  req.body.assetId = asset.assetId;
  req.body.reportedBy = req.user._id;
  req.body.reportedByName = req.user.name;

  // Update asset status based on priority
  if (req.body.priority === 'Critical' || req.body.priority === 'High') {
    asset.status = 'Breakdown';
  } else {
    asset.status = 'Under Maintenance';
  }
  await asset.save();

  const complaint = await AssetComplaint.create(req.body);
  res.status(201).json({ success: true, data: complaint });
});

// @desc    Update complaint (status, assign technician, etc.)
// @route   PUT /api/asset-complaints/:id
exports.updateComplaint = asyncHandler(async (req, res, next) => {
  const complaint = await AssetComplaint.findById(req.params.id);
  if (!complaint) return next(new ErrorResponse('Complaint not found', 404));

  // If closing the complaint, record who closed it and when
  if ((req.body.status === 'Completed' || req.body.status === 'Closed') && complaint.status !== req.body.status) {
    req.body.closedBy = req.user._id;
    req.body.closedAt = new Date();
    if (!req.body.actualCompletionDate) req.body.actualCompletionDate = new Date();

    // Mark asset as working when complaint is completed
    if (req.body.status === 'Completed') {
      await Asset.findByIdAndUpdate(complaint.asset, { status: 'Working' });
    }
  }

  const updated = await AssetComplaint.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  })
    .populate('asset', 'assetId name')
    .populate('reportedBy', 'name')
    .populate('closedBy', 'name');

  res.status(200).json({ success: true, data: updated });
});

// @desc    Get complaint dashboard stats
// @route   GET /api/asset-complaints/dashboard
exports.getComplaintDashboard = asyncHandler(async (req, res) => {
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 30);

  const [totalAssets, assetsByStatus, openComplaints, criticalComplaints, warrantyExpiring] = await Promise.all([
    Asset.countDocuments({ isActive: true }),
    Asset.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    AssetComplaint.countDocuments({ status: { $in: ['Open', 'Assigned', 'In Progress', 'Waiting for Parts', 'Vendor Service'] } }),
    AssetComplaint.countDocuments({ priority: 'Critical', status: { $nin: ['Completed', 'Closed'] } }),
    Asset.countDocuments({
      isActive: true,
      warrantyExpiry: { $lte: thirtyDays, $gte: new Date() },
    }),
  ]);

  const statusMap = assetsByStatus.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {});

  res.status(200).json({
    success: true,
    data: {
      totalAssets,
      workingAssets: statusMap['Working'] || 0,
      underRepair: (statusMap['Under Maintenance'] || 0) + (statusMap['Breakdown'] || 0) + (statusMap['Repair In Progress'] || 0),
      openComplaints,
      criticalIssues: criticalComplaints,
      warrantyExpiringSoon: warrantyExpiring,
    },
  });
});
