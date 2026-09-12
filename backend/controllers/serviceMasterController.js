const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const ServiceMaster = require('../models/ServiceMaster');

exports.getServices = asyncHandler(async (req, res) => {
  const filter = req.query.activeOnly === 'false' ? {} : { isActive: true };
  const services = await ServiceMaster.find(filter).sort({ createdAt: 1, _id: 1 });
  res.status(200).json({ success: true, count: services.length, data: services });
});

exports.createService = asyncHandler(async (req, res, next) => {
  const name = String(req.body.name || '').trim();
  if (!name) return next(new ErrorResponse('Service name is required', 400));
  const defaultPrice = Number(req.body.defaultPrice);
  if (!Number.isFinite(defaultPrice) || defaultPrice < 0) {
    return next(new ErrorResponse('Price is required', 400));
  }

  const service = await ServiceMaster.create({
    name,
    category: req.body.category || 'Equipment',
    chargeType: req.body.chargeType || 'per_use',
    defaultPrice,
    gstPercent: Number(req.body.gstPercent) || 0,
    createdBy: req.user._id,
  });
  res.status(201).json({ success: true, data: service, message: 'Service added' });
});

exports.updateService = asyncHandler(async (req, res, next) => {
  const service = await ServiceMaster.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!service) return next(new ErrorResponse('Service not found', 404));
  res.status(200).json({ success: true, data: service });
});

exports.deleteService = asyncHandler(async (req, res, next) => {
  const service = await ServiceMaster.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!service) return next(new ErrorResponse('Service not found', 404));
  res.status(200).json({ success: true, data: service, message: 'Service deactivated' });
});
