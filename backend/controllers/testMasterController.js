const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const TestMaster = require('../models/TestMaster');

// GET /api/test-master  (everyone logged in can view prices)
// ?activeOnly=false to include deactivated entries (used by the manage screen)
exports.getTests = asyncHandler(async (req, res) => {
  const filter = req.query.activeOnly === 'false' ? {} : { isActive: true };
  const tests = await TestMaster.find(filter).sort('category name');
  res.status(200).json({ success: true, count: tests.length, data: tests });
});

// GET /api/test-master/lookup?name=CBC (Complete Blood Count)
// Case-insensitive exact-name lookup used to auto-fill price when a lab order is created.
exports.lookupTest = asyncHandler(async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(200).json({ success: true, data: null });
  const test = await TestMaster.findOne({
    name: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    isActive: true,
  });
  res.status(200).json({ success: true, data: test });
});

exports.createTest = asyncHandler(async (req, res) => {
  req.body.createdBy = req.user._id;
  const test = await TestMaster.create(req.body);
  res.status(201).json({ success: true, data: test });
});

exports.updateTest = asyncHandler(async (req, res, next) => {
  const test = await TestMaster.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!test) return next(new ErrorResponse('Test not found', 404));
  res.status(200).json({ success: true, data: test });
});

exports.deleteTest = asyncHandler(async (req, res, next) => {
  const test = await TestMaster.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!test) return next(new ErrorResponse('Test not found', 404));
  res.status(200).json({ success: true, data: test, message: 'Test deactivated' });
});