const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const brandingService = require('../services/brandingService');
const { orgRoom } = require('../middleware/tenant');

exports.getPublicBranding = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: brandingService.getPublicBranding() });
});

exports.getBranding = asyncHandler(async (req, res) => {
  const branding = await brandingService.getBranding(req);
  res.status(200).json({ success: true, data: branding });
});

exports.updateBranding = asyncHandler(async (req, res, next) => {
  if (!req.organizationId) {
    return next(new ErrorResponse(
      'Select a client hospital first. GMS is the Super Admin organization; branding belongs to that hospital.',
      400,
    ));
  }

  const branding = await brandingService.updateBranding(req.body, req.user._id, req);

  const io = req.app.get('io');
  if (io && req.organizationId) {
    io.to(orgRoom.branding(req.organizationId)).emit('branding:updated', branding);
  }

  res.status(200).json({ success: true, data: branding });
});
