const asyncHandler = require('../utils/asyncHandler');
const brandingService = require('../services/brandingService');

/**
 * @desc    Get hospital branding (with system defaults)
 * @route   GET /api/branding
 * @access  Private
 */
exports.getBranding = asyncHandler(async (req, res) => {
  const branding = await brandingService.getBranding();
  res.status(200).json({ success: true, data: branding });
});

/**
 * @desc    Update hospital branding
 * @route   PUT /api/branding
 * @access  Private (Super Admin only)
 */
exports.updateBranding = asyncHandler(async (req, res) => {
  const branding = await brandingService.updateBranding(req.body, req.user._id);

  const io = req.app.get('io');
  if (io) io.emit('branding:updated', branding);

  res.status(200).json({ success: true, data: branding });
});
