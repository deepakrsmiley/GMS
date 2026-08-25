const ActivityLog = require('../models/ActivityLog');

/**
 * Persist an audit row and broadcast to Super Admin / Admin activity feed.
 * Failures are swallowed so business APIs never break on logging.
 */
const logActivity = async (req, {
  action,
  module,
  description,
  relatedId,
  relatedModel,
  metadata,
} = {}) => {
  try {
    const userId = req?.user?._id || req?.user?.id || null;
    const entry = await ActivityLog.create({
      user: userId || undefined,
      action: action || 'Update',
      module: module || 'System',
      description: description || '',
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '',
      userAgent: req?.headers?.['user-agent'] || '',
      relatedId: relatedId ? String(relatedId) : undefined,
      relatedModel,
      metadata: metadata || undefined,
      organizationId: req?.organizationId || undefined,
    });

    const populated = await ActivityLog.findById(entry._id)
      .populate('user', 'name email role')
      .lean();

    const payload = {
      _id: populated._id,
      action: populated.action,
      module: populated.module,
      description: populated.description,
      relatedId: populated.relatedId,
      relatedModel: populated.relatedModel,
      metadata: populated.metadata,
      createdAt: populated.createdAt,
      user: populated.user
        ? {
            _id: populated.user._id,
            name: populated.user.name,
            email: populated.user.email,
            role: populated.user.role,
          }
        : null,
    };

    const io = req?.app?.get?.('io');
    if (io) {
      const { orgRoom } = require('../middleware/tenant');
      if (req?.organizationId) {
        io.to(orgRoom.role(req.organizationId, 'Super Admin')).emit('activity:new', payload);
        io.to(orgRoom.role(req.organizationId, 'Admin')).emit('activity:new', payload);
      }
      io.to('role:Super Admin').emit('activity:new', payload);
    }

    return payload;
  } catch (err) {
    // never block request
    return null;
  }
};

module.exports = { logActivity };
