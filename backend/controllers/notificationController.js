const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Notification = require('../models/Notification');
const { serialize } = require('../utils/notify');

/** GET /api/notifications — my inbox */
exports.getMyNotifications = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 40, 100);
  const unreadOnly = req.query.unread === 'true';

  const filter = { recipient: req.user._id };
  if (unreadOnly) filter.isRead = false;

  const rows = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.status(200).json({
    success: true,
    count: rows.length,
    data: rows.map(serialize),
  });
});

/** GET /api/notifications/unread-count */
exports.getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    recipient: req.user._id,
    isRead: false,
  });
  res.status(200).json({ success: true, data: { count } });
});

/** POST /api/notifications/read — mark one/many/all */
exports.markRead = asyncHandler(async (req, res, next) => {
  const me = req.user._id;
  const { ids, all } = req.body || {};

  if (all) {
    await Notification.updateMany(
      { recipient: me, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    return res.status(200).json({ success: true });
  }

  if (!Array.isArray(ids) || !ids.length) {
    return next(new ErrorResponse('Provide ids or all:true', 400));
  }

  await Notification.updateMany(
    { _id: { $in: ids }, recipient: me, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  res.status(200).json({ success: true });
});

/** DELETE /api/notifications/:id — remove from my inbox */
exports.deleteNotification = asyncHandler(async (req, res, next) => {
  const row = await Notification.findOne({ _id: req.params.id, recipient: req.user._id });
  if (!row) return next(new ErrorResponse('Notification not found', 404));
  await row.deleteOne();
  res.status(200).json({ success: true });
});
