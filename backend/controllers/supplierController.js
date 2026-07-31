const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Supplier = require('../models/Supplier');

exports.getSuppliers = asyncHandler(async (req, res) => {
  res.status(200).json(res.advancedResults);
});

exports.getSupplier = asyncHandler(async (req, res, next) => {
  const supplier = await Supplier.findById(req.params.id);

  if (!supplier) {
    return next(new ErrorResponse('Supplier not found', 404));
  }

  res.status(200).json({
    success: true,
    data: supplier,
  });
});

exports.createSupplier = asyncHandler(async (req, res) => {
  delete req.body._id; // Prevent duplicate _id errors

  const supplier = await Supplier.create(req.body);

  res.status(201).json({
    success: true,
    data: supplier,
  });
});

exports.updateSupplier = asyncHandler(async (req, res, next) => {
  const supplier = await Supplier.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
      runValidators: true,
    }
  );

  if (!supplier) {
    return next(new ErrorResponse('Supplier not found', 404));
  }

  res.status(200).json({
    success: true,
    data: supplier,
  });
});

exports.deleteSupplier = asyncHandler(async (req, res, next) => {
  const supplier = await Supplier.findById(req.params.id);

  if (!supplier) {
    return next(new ErrorResponse('Supplier not found', 404));
  }

  supplier.isActive = false;
  await supplier.save();

  res.status(200).json({
    success: true,
    data: {},
  });
});