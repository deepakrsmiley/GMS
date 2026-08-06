const asyncHandler = require('../utils/asyncHandler');
const ActivityLog = require('../models/ActivityLog');

/** Recent hospital activity for Super Admin / Admin header feed */
exports.getRecentActivity = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 40, 100);
  const moduleFilter = req.query.module ? { module: req.query.module } : {};

  const rows = await ActivityLog.find(moduleFilter)
    .populate('user', 'name email role')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.status(200).json({
    success: true,
    count: rows.length,
    data: rows.map((r) => ({
      _id: r._id,
      action: r.action,
      module: r.module,
      description: r.description,
      relatedId: r.relatedId,
      relatedModel: r.relatedModel,
      metadata: r.metadata,
      createdAt: r.createdAt,
      user: r.user
        ? { _id: r.user._id, name: r.user.name, email: r.user.email, role: r.user.role }
        : null,
    })),
  });
});
