const ErrorResponse = require('../utils/errorResponse');
const { isModuleEnabled } = require('../config/hospitalModules');

const requireHospitalModule = (...moduleIds) => (req, res, next) => {
  const ids = moduleIds.filter(Boolean);
  if (!ids.length) return next();
  const org = req.organization || req.tenant?.organization;
  const allowed = ids.some((id) => isModuleEnabled(org, id));
  if (!allowed) {
    return next(new ErrorResponse('This module is not enabled for this hospital', 403));
  }
  next();
};

module.exports = { requireHospitalModule };
