const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const TestMaster = require('../models/TestMaster');

// GET /api/test-master  (everyone logged in can view prices)
// ?activeOnly=false to include deactivated entries (used by the manage screen)
exports.getTests = asyncHandler(async (req, res) => {
  const filter = req.query.activeOnly === 'false' ? {} : { isActive: true };
  const tests = await TestMaster.find(filter).sort({ kind: 1, category: 1, name: 1 });
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

const normalizeItems = (items = []) => (
  (Array.isArray(items) ? items : [])
    .filter((i) => i && String(i.testName || '').trim())
    .map((item, idx) => ({
      testCode: item.testCode || '',
      testName: String(item.testName).trim(),
      unit: item.unit || '',
      normalRange: item.normalRange || '',
      method: item.method || '',
      sample: item.sample || '',
      sortOrder: item.sortOrder != null ? Number(item.sortOrder) : idx + 1,
      isSection: !!item.isSection,
    }))
);

exports.createTest = asyncHandler(async (req, res, next) => {
  const kind = req.body.kind === 'group' ? 'group' : 'single';
  const items = kind === 'group' ? normalizeItems(req.body.items) : [];
  if (kind === 'group' && !items.length) {
    return next(new ErrorResponse('Group test needs at least one child test', 400));
  }
  const test = await TestMaster.create({
    ...req.body,
    kind,
    items,
    createdBy: req.user._id,
  });
  res.status(201).json({ success: true, data: test });
});

exports.updateTest = asyncHandler(async (req, res, next) => {
  const body = { ...req.body };
  if (body.kind === 'group' || Array.isArray(body.items)) {
    body.kind = body.kind === 'single' ? 'single' : (body.kind || 'group');
    if (body.kind === 'group') {
      body.items = normalizeItems(body.items);
      if (!body.items.length) {
        return next(new ErrorResponse('Group test needs at least one child test', 400));
      }
    } else {
      body.items = [];
    }
  }
  const test = await TestMaster.findByIdAndUpdate(req.params.id, body, {
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