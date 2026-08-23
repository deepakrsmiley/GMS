const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { sanitizePermissions } = require('../config/permissions');

// Helper to write audit logs
const createAuditLog = async (userId, action, description, req) => {
  try {
    await ActivityLog.create({
      user: userId,
      action,
      module: 'Staff Management',
      description,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'Unknown',
    });
  } catch (err) {
    // silent fail
  }
};

exports.getStaff = asyncHandler(async (req, res) => {
  res.status(200).json(res.advancedResults);
});

exports.getStaffMember = asyncHandler(async (req, res, next) => {
  const staff = await User.findById(req.params.id).populate('department');
  if (!staff) return next(new ErrorResponse('Staff member not found', 404));
  res.status(200).json({ success: true, data: staff });
});

const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Drop malformed entries (e.g. unchecked checkboxes submitting `day: false`)
// so schema enum validation never rejects the whole save.
const sanitizeStaffBody = (body) => {
  if (body.availability !== undefined) {
    body.availability = Array.isArray(body.availability)
      ? body.availability.filter((a) => a && VALID_DAYS.includes(a.day))
      : [];
  }
  if (body.department === '') delete body.department;
  ['consultationFee', 'followUpFee', 'experience'].forEach((field) => {
    if (field in body && (body[field] === '' || body[field] === null || Number.isNaN(Number(body[field])))) {
      delete body[field];
    }
  });
  return body;
};

exports.createStaff = asyncHandler(async (req, res) => {
  if (req.body.permissions !== undefined) {
    req.body.permissions = sanitizePermissions(req.body.permissions) || [];
  }
  sanitizeStaffBody(req.body);

  const staff = await User.create(req.body);
  
  // Log user creation
  if (req.user) {
    await createAuditLog(req.user._id, 'User Creation', `Created staff user ${staff.name} (${staff.role})`, req);
  }
  
  res.status(201).json({ success: true, data: staff });
});

exports.updateStaff = asyncHandler(async (req, res, next) => {
  if (req.body.password) delete req.body.password;
  sanitizeStaffBody(req.body);

  const existingStaff = await User.findById(req.params.id);
  if (!existingStaff) return next(new ErrorResponse('Staff member not found', 404));
  
  const oldRole = existingStaff.role;
  const newRole = req.body.role;
  const permissionsChanged = req.body.permissions !== undefined;

  if (permissionsChanged) {
    req.body.permissions = sanitizePermissions(req.body.permissions) || [];
  }

  const staff = await User.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('department');

  // Log role changes and other updates
  if (req.user) {
    if (newRole && oldRole !== newRole) {
      await createAuditLog(req.user._id, 'Role Change', `Changed role of ${staff.name} from '${oldRole}' to '${newRole}'`, req);
    } else if (permissionsChanged) {
      await createAuditLog(req.user._id, 'Permission Change', `Updated permissions for staff user ${staff.name} (${staff.permissions?.length || 0} permission(s) assigned)`, req);
    } else {
      await createAuditLog(req.user._id, 'User Update', `Updated details for staff user ${staff.name}`, req);
    }
  }

  res.status(200).json({ success: true, data: staff });
});

exports.toggleStaffStatus = asyncHandler(async (req, res, next) => {
  const staff = await User.findById(req.params.id);
  if (!staff) return next(new ErrorResponse('Staff member not found', 404));
  staff.isActive = !staff.isActive;
  await staff.save({ validateBeforeSave: false });
  
  if (req.user) {
    await createAuditLog(req.user._id, 'User Status Toggle', `Toggled active status of user ${staff.name} to ${staff.isActive}`, req);
  }
  
  res.status(200).json({ success: true, data: { isActive: staff.isActive } });
});

exports.deleteStaff = asyncHandler(async (req, res, next) => {
  const staff = await User.findById(req.params.id);
  if (!staff) return next(new ErrorResponse('Staff member not found', 404));

  if (req.user && String(req.user._id) === String(staff._id)) {
    return next(new ErrorResponse('You cannot delete your own account', 400));
  }

  if (staff.role === 'Super Admin') {
    const superAdminCount = await User.countDocuments({ role: 'Super Admin' });
    if (superAdminCount <= 1) {
      return next(new ErrorResponse('Cannot delete the last Super Admin account', 400));
    }
  }

  const name = staff.name;
  const role = staff.role;
  await staff.deleteOne();

  if (req.user) {
    await createAuditLog(req.user._id, 'User Deletion', `Deleted staff user ${name} (${role})`, req);
  }

  res.status(200).json({ success: true, message: 'Staff member deleted' });
});

exports.getDoctors = asyncHandler(async (req, res) => {
  const filter = { role: { $in: ['Doctor', 'doctor'] }, isActive: true };
  if (req.query.department) filter.department = req.query.department;
  const doctors = await User.find(filter)
    .select('name specialization department qualification consultationFee followUpFee morningSessionStart morningSessionEnd eveningSessionStart eveningSessionEnd availability')
    .populate('department', 'name');
  res.status(200).json({ success: true, data: doctors });
});
