const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Department = require('../models/Department');
const User = require('../models/User');

// @desc    Get all departments
// @route   GET /api/departments
exports.getDepartments = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.active === 'true') filter.isActive = true;

  const departments = await Department.find(filter)
    .select('name code description isActive consultationFee color location head')
    .populate('head', 'name')
    .sort('name');

  // Attach doctor count
  const withCounts = await Promise.all(
    departments.map(async (dept) => {
      const doctorCount = await User.countDocuments({ department: dept._id, role: 'Doctor', isActive: true });
      return { ...dept.toObject(), doctorCount };
    })
  );

  res.status(200).json({ success: true, count: withCounts.length, data: withCounts });
});

// @desc    Get single department
// @route   GET /api/departments/:id
exports.getDepartment = asyncHandler(async (req, res, next) => {
  const department = await Department.findById(req.params.id).populate('head', 'name');
  if (!department) return next(new ErrorResponse('Department not found', 404));
  res.status(200).json({ success: true, data: department });
});

// @desc    Create department
// @route   POST /api/departments
exports.createDepartment = asyncHandler(async (req, res) => {
  const department = await Department.create(req.body);
  res.status(201).json({ success: true, data: department });
});

// @desc    Update department
// @route   PUT /api/departments/:id
exports.updateDepartment = asyncHandler(async (req, res, next) => {
  const department = await Department.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );
  if (!department) return next(new ErrorResponse('Department not found', 404));
  res.status(200).json({ success: true, data: department });
});

// @desc    Toggle department status
// @route   PUT /api/departments/:id/toggle
exports.toggleDepartmentStatus = asyncHandler(async (req, res, next) => {
  const department = await Department.findById(req.params.id);
  if (!department) return next(new ErrorResponse('Department not found', 404));
  department.isActive = !department.isActive;
  await department.save();
  res.status(200).json({ success: true, data: { isActive: department.isActive } });
});

// @desc    Delete department
// @route   DELETE /api/departments/:id
exports.deleteDepartment = asyncHandler(async (req, res, next) => {
  const department = await Department.findById(req.params.id);
  if (!department) return next(new ErrorResponse('Department not found', 404));
  // Check if any doctors linked
  const doctorCount = await User.countDocuments({ department: req.params.id });
  if (doctorCount > 0) {
    return next(new ErrorResponse(`Cannot delete department with ${doctorCount} linked doctor(s). Reassign them first.`, 400));
  }
  await department.deleteOne();
  res.status(200).json({ success: true, message: 'Department deleted' });
});
