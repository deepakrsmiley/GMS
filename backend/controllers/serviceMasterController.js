const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const ServiceMaster = require('../models/ServiceMaster');

exports.getServices = asyncHandler(async (req, res) => {
  const filter = req.query.activeOnly === 'false' ? {} : { isActive: true };
  const services = await ServiceMaster.find(filter).sort('category name');
  res.status(200).json({ success: true, count: services.length, data: services });
});

exports.createService = asyncHandler(async (req, res, next) => {
  req.body.createdBy = req.user._id;
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
