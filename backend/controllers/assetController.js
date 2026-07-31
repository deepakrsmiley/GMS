const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Asset = require('../models/Asset');
const AssetComplaint = require('../models/AssetComplaint');

// @desc    Get all assets
// @route   GET /api/assets
exports.getAssets = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.department) filter.department = req.query.department;

  const assets = await Asset.find(filter)
    .populate('department', 'name')
    .populate('addedBy', 'name')
    .sort('-createdAt');

  res.status(200).json({ success: true, count: assets.length, data: assets });
});

// @desc    Get single asset
// @route   GET /api/assets/:id
exports.getAsset = asyncHandler(async (req, res, next) => {
  const asset = await Asset.findById(req.params.id)
    .populate('department', 'name')
    .populate('addedBy', 'name');
  if (!asset) return next(new ErrorResponse('Asset not found', 404));
  res.status(200).json({ success: true, data: asset });
});

// @desc    Create asset
// @route   POST /api/assets
exports.createAsset = asyncHandler(async (req, res) => {
  req.body.addedBy = req.user._id;
  const asset = await Asset.create(req.body);
  res.status(201).json({ success: true, data: asset });
});

// @desc    Update asset
// @route   PUT /api/assets/:id
exports.updateAsset = asyncHandler(async (req, res, next) => {
  const asset = await Asset.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  }).populate('department', 'name');
  if (!asset) return next(new ErrorResponse('Asset not found', 404));
  res.status(200).json({ success: true, data: asset });
});

// @desc    Soft delete asset
// @route   DELETE /api/assets/:id
exports.deleteAsset = asyncHandler(async (req, res, next) => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) return next(new ErrorResponse('Asset not found', 404));
  asset.isActive = false;
  await asset.save();
  res.status(200).json({ success: true, message: 'Asset decommissioned' });
});

// @desc    Get asset dashboard stats
// @route   GET /api/assets/dashboard
exports.getAssetDashboard = asyncHandler(async (req, res) => {
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 30);

  const [totalAssets, byStatus, warningExpiry, recentComplaints] = await Promise.all([
    Asset.countDocuments({ isActive: true }),
    Asset.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Asset.find({
      isActive: true,
      warrantyExpiry: { $lte: thirtyDays, $gte: new Date() },
    }).select('assetId name warrantyExpiry department').populate('department', 'name').limit(10),
    AssetComplaint.find({ status: { $in: ['Open', 'Assigned', 'In Progress'] } })
      .select('complaintNumber assetName priority status complaintDate')
      .sort('-complaintDate')
      .limit(5),
  ]);

  const statusMap = byStatus.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {});

  res.status(200).json({
    success: true,
    data: {
      totalAssets,
      working: statusMap['Working'] || 0,
      underMaintenance: statusMap['Under Maintenance'] || 0,
      breakdown: statusMap['Breakdown'] || 0,
      repairInProgress: statusMap['Repair In Progress'] || 0,
      decommissioned: statusMap['Decommissioned'] || 0,
      underRepair: (statusMap['Under Maintenance'] || 0) + (statusMap['Breakdown'] || 0) + (statusMap['Repair In Progress'] || 0),
      warrantyExpiringSoon: warningExpiry.length,
      warningExpiryList: warningExpiry,
      recentComplaints,
      byStatus: statusMap,
    },
  });
});
