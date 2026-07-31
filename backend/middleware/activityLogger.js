const ActivityLog = require('../models/ActivityLog');

const logActivity = (module, action) => async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = async (data) => {
    if (res.statusCode < 400 && req.user) {
      try {
        await ActivityLog.create({
          user: req.user._id,
          action,
          module,
          description: `${req.method} ${req.originalUrl}`,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { body: req.body, params: req.params },
        });
      } catch (e) { /* silent fail */ }
    }
    return originalJson(data);
  };
  next();
};

module.exports = logActivity;
