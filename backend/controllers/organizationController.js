const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Organization = require('../models/Organization');
const User = require('../models/User');
const sendTokenResponse = require('../utils/sendToken');
const { isSuperAdmin } = require('../utils/roles');
const { sanitizeEnabledModules, ALL_MODULE_IDS } = require('../config/hospitalModules');
const { organizationSnapshot } = require('../utils/hospitalA');

const sanitizeCode = (code) => String(code || '').trim().toUpperCase();

const orgJson = (org) => ({
  _id: org._id,
  name: org.name,
  code: org.code,
  status: org.status,
  logo: org.logo || '',
  address: org.address || '',
  phone: org.phone || '',
  email: org.email || '',
  gstNumber: org.gstNumber || '',
  invoicePrefix: org.invoicePrefix || '',
  receiptPrefix: org.receiptPrefix || '',
  enabledModules: sanitizeEnabledModules(org.enabledModules),
  createdAt: org.createdAt,
  updatedAt: org.updatedAt,
});

exports.listOrganizations = asyncHandler(async (req, res) => {
  const orgs = await Organization.find().sort({ name: 1 });
  res.status(200).json({ success: true, count: orgs.length, data: orgs.map(orgJson) });
});

exports.getOrganization = asyncHandler(async (req, res, next) => {
  const org = await Organization.findById(req.params.id);
  if (!org) return next(new ErrorResponse('Organization not found', 404));

  const [userCount] = await Promise.all([
    User.countDocuments({ organizationId: org._id }),
  ]);

  res.status(200).json({
    success: true,
    data: { ...orgJson(org), userCount },
  });
});

const countUntagged = async (collectionName) => {
  try {
    const mongoose = require('mongoose');
    return await mongoose.connection.db.collection(collectionName).countDocuments({
      $or: [{ organizationId: { $exists: false } }, { organizationId: null }],
    });
  } catch (_) {
    return 0;
  }
};

exports.createOrganization = asyncHandler(async (req, res, next) => {
  const name = String(req.body.name || '').trim();
  const code = sanitizeCode(req.body.code);
  if (!name) return next(new ErrorResponse('Organization name is required', 400));
  if (!code) return next(new ErrorResponse('Organization code is required', 400));

  const existingCount = await Organization.countDocuments();
  if (existingCount >= 1) {
    const leftover = (await countUntagged('patients'))
      + (await countUntagged('bills'))
      + (await countUntagged('departments'));
    if (leftover > 0) {
      return next(new ErrorResponse(
        'Sri Sanjeevi data is not tagged to Hospital A yet. In the backend folder run: npm run migrate:organization -- --apply --confirm YES  (this does not delete data). Then create Hospital B.',
        400,
      ));
    }
  }

  const exists = await Organization.findOne({ code });
  if (exists) return next(new ErrorResponse('Organization code already exists', 400));

  const org = await Organization.create({
    name,
    code,
    status: req.body.status === 'inactive' ? 'inactive' : 'active',
    logo: req.body.logo || '',
    address: req.body.address || '',
    phone: req.body.phone || '',
    email: String(req.body.email || '').toLowerCase().trim(),
    gstNumber: req.body.gstNumber || '',
    invoicePrefix: req.body.invoicePrefix || '',
    receiptPrefix: req.body.receiptPrefix || '',
    enabledModules: sanitizeEnabledModules(
      req.body.enabledModules == null ? ALL_MODULE_IDS : req.body.enabledModules,
    ),
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  res.status(201).json({ success: true, data: orgJson(org) });
});

exports.updateOrganization = asyncHandler(async (req, res, next) => {
  const org = await Organization.findById(req.params.id);
  if (!org) return next(new ErrorResponse('Organization not found', 404));

  const allowed = ['name', 'logo', 'address', 'phone', 'email', 'gstNumber', 'invoicePrefix', 'receiptPrefix', 'status'];
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) {
      org[field] = field === 'email' ? String(req.body[field] || '').toLowerCase().trim() : req.body[field];
    }
  });
  if (req.body.code !== undefined) {
    const code = sanitizeCode(req.body.code);
    if (code && code !== org.code) {
      const exists = await Organization.findOne({ code, _id: { $ne: org._id } });
      if (exists) return next(new ErrorResponse('Organization code already exists', 400));
      org.code = code;
    }
  }
  if (req.body.enabledModules !== undefined) {
    org.enabledModules = sanitizeEnabledModules(req.body.enabledModules);
  }
  org.updatedBy = req.user._id;
  await org.save();
  res.status(200).json({ success: true, data: orgJson(org) });
});

exports.setOrganizationStatus = asyncHandler(async (req, res, next) => {
  const org = await Organization.findById(req.params.id);
  if (!org) return next(new ErrorResponse('Organization not found', 404));
  const status = req.body.status === 'inactive' ? 'inactive' : 'active';
  org.status = status;
  org.updatedBy = req.user._id;
  await org.save();
  res.status(200).json({ success: true, data: orgJson(org) });
});

exports.createHospitalAdmin = asyncHandler(async (req, res, next) => {
  const org = await Organization.findById(req.params.id);
  if (!org) return next(new ErrorResponse('Organization not found', 404));

  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return next(new ErrorResponse('Name, email and password are required', 400));
  }

  const admin = await User.create({
    name: String(name).trim(),
    email: String(email).toLowerCase().trim(),
    password,
    phone: phone || '',
    role: 'Admin',
    organizationId: org._id,
    isActive: true,
  });

  res.status(201).json({
    success: true,
    data: {
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      organizationId: admin.organizationId,
    },
  });
});

exports.assignUserToOrganization = asyncHandler(async (req, res, next) => {
  const org = await Organization.findById(req.params.id);
  if (!org) return next(new ErrorResponse('Organization not found', 404));

  const userId = req.body.userId;
  if (!userId) return next(new ErrorResponse('userId is required', 400));

  const user = await User.findById(userId);
  if (!user) return next(new ErrorResponse('User not found', 404));
  if (isSuperAdmin(user.role)) {
    return next(new ErrorResponse('GMS Super Admin cannot be assigned to a hospital', 400));
  }

  user.organizationId = org._id;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    },
  });
});

exports.selectOrganization = asyncHandler(async (req, res, next) => {
  const org = await Organization.findById(req.params.id);
  if (!org) return next(new ErrorResponse('Organization not found', 404));
  if (org.status !== 'active') {
    return next(new ErrorResponse('Cannot select a deactivated organization', 400));
  }

  if (isSuperAdmin(req.user.role)) {
    req.user.lastActiveOrganizationId = org._id;
    await req.user.save({ validateBeforeSave: false });
  }

  sendTokenResponse(req.user, 200, res, {
    activeOrganizationId: org._id,
    organization: organizationSnapshot(org),
    req,
  });
});
