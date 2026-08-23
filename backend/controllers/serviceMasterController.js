const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const ServiceMaster = require('../models/ServiceMaster');

exports.getServices = asyncHandler(async (req, res) => {
  const filter = req.query.activeOnly === 'false' ? {} : { isActive: true };
  const services = await ServiceMaster.find(filter).sort('category name');
  res.status(200).json({ success: true, count: services.length, data: services });
});

exports.createService = asyncHandler(async (req, res, next) => {
  const name = String(req.body.name || '').trim();
  if (!name) return next(new ErrorResponse('Service name is required', 400));
  req.body.name = name;
  req.body.createdBy = req.user._id;

  const existing = await ServiceMaster.findOne({
    name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  });
  if (existing) {
    if (!existing.isActive) {
      existing.isActive = true;
      if (req.body.defaultPrice != null) existing.defaultPrice = req.body.defaultPrice;
      if (req.body.category) existing.category = req.body.category;
      if (req.body.chargeType) existing.chargeType = req.body.chargeType;
      await existing.save();
      return res.status(200).json({ success: true, data: existing, message: 'Service reactivated' });
    }
    return res.status(200).json({
      success: true,
      data: existing,
      message: 'Service already on the list — using the existing item',
    });
  }

  const service = await ServiceMaster.create(req.body);
  res.status(201).json({ success: true, data: service });
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
