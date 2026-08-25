const asyncHandler = require('../utils/asyncHandler');
const brandingService = require('../services/brandingService');
const { orgRoom } = require('../middleware/tenant');

exports.getPublicBranding = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: brandingService.getPublicBranding() });
});

exports.getBranding = asyncHandler(async (req, res) => {
  const branding = await brandingService.getBranding(req);
  res.status(200).json({ success: true, data: branding });
});

exports.updateBranding = asyncHandler(async (req, res) => {
  const branding = await brandingService.updateBranding(req.body, req.user._id, req);

  const io = req.app.get('io');
  if (io && req.organizationId) {
    io.to(orgRoom.branding(req.organizationId)).emit('branding:updated', branding);
  } else if (io) {
    io.emit('branding:updated', branding);
  }

  res.status(200).json({ success: true, data: branding });
});
