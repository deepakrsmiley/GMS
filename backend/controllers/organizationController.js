const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Organization = require('../models/Organization');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Bill = require('../models/Bill');
const ActivityLog = require('../models/ActivityLog');
const sendTokenResponse = require('../utils/sendToken');
const { isSuperAdmin } = require('../utils/roles');
const { sanitizeEnabledModules, ALL_MODULE_IDS } = require('../config/hospitalModules');
const { organizationSnapshot, isPlatformOrg, isClientOrg, KIND_CLIENT, PLATFORM_CODE } = require('../utils/hospitalA');
const { runWithOrganizationContext } = require('../middleware/tenantContext');
const { istDayBounds, kolkataToday } = require('../utils/istDay');
const { aggregateTodayRevenue } = require('../utils/todayRevenue');

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
  kind: isPlatformOrg(org) ? 'platform' : 'client',
  createdAt: org.createdAt,
  updatedAt: org.updatedAt,
});

const skipOrg = { skipOrganizationFilter: true };

const logGmsAction = async (req, action, description, extra = {}) => {
  try {
    await runWithOrganizationContext({ skipOrganizationFilter: true }, async () => {
      await ActivityLog.create({
        user: req.user?._id,
        action,
        module: 'GMS',
        description,
        ipAddress: req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '',
        userAgent: String(req.headers?.['user-agent'] || '').slice(0, 400),
        relatedId: extra.relatedId ? String(extra.relatedId) : undefined,
        relatedModel: extra.relatedModel || 'Organization',
        metadata: extra.metadata,
        organizationId: extra.organizationId || undefined,
      });
    });
  } catch (_) { /* never block hospital operations on audit failure */ }
};

const countForOrg = async (Model, orgId, extra = {}) =>
  Model.countDocuments({ organizationId: orgId, ...extra }).setOptions(skipOrg);

exports.listOrganizations = asyncHandler(async (req, res) => {
  const orgs = await Organization.find().sort({ name: 1 });
  res.status(200).json({ success: true, count: orgs.length, data: orgs.map(orgJson) });
});

exports.platformOverview = asyncHandler(async (req, res) => {
  const orgs = await Organization.find().sort({ name: 1 }).lean();
  const clients = orgs.filter(isClientOrg);
  const day = istDayBounds(kolkataToday());

  const hospitals = [];
  for (const org of clients) {
    const [patients, users, todayBills, todayRevenue] = await Promise.all([
      countForOrg(Patient, org._id),
      User.countDocuments({ organizationId: org._id, role: { $ne: 'Super Admin' } }).setOptions(skipOrg),
      countForOrg(Bill, org._id, { createdAt: { $gte: day.from, $lt: day.to } }),
      aggregateTodayRevenue(Bill, { organizationId: org._id }, { skipOrganizationFilter: true }),
    ]);
    hospitals.push({
      ...orgJson(org),
      patients,
      users,
      todayBills,
      todayRevenue,
    });
  }

  const recentActions = await ActivityLog.find({ module: 'GMS' })
    .sort({ createdAt: -1 })
    .limit(15)
    .populate({ path: 'user', select: 'name email', options: skipOrg })
    .setOptions(skipOrg);

  res.status(200).json({
    success: true,
    data: {
      totalHospitals: hospitals.length,
      activeHospitals: hospitals.filter((h) => h.status === 'active').length,
      totalPatients: hospitals.reduce((sum, h) => sum + (h.patients || 0), 0),
      todayBills: hospitals.reduce((sum, h) => sum + (h.todayBills || 0), 0),
      todayRevenue: hospitals.reduce((sum, h) => sum + (h.todayRevenue || 0), 0),
      hospitals,
      recentActions,
    },
  });
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
  if (!name) return next(new ErrorResponse('Client hospital name is required', 400));
  if (!code) return next(new ErrorResponse('Client hospital code is required', 400));
  if (code === PLATFORM_CODE || String(req.body.kind || '').toLowerCase() === 'platform') {
    return next(new ErrorResponse('GMS is the Super Admin organization. Add hospitals as clients, not as GMS.', 400));
  }

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
    kind: KIND_CLIENT,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  let admin = null;
  const adminBody = req.body.admin;
  if (adminBody && adminBody.name && adminBody.email && adminBody.password) {
    const adminEmail = String(adminBody.email).toLowerCase().trim();
    const taken = await User.findOne({ email: adminEmail, organizationId: org._id });
    if (taken) {
      return next(new ErrorResponse('This email is already used by staff in this hospital. Use a different email.', 400));
    }
    admin = await User.create({
      name: String(adminBody.name).trim(),
      email: adminEmail,
      password: adminBody.password,
      phone: adminBody.phone || '',
      role: 'Admin',
      organizationId: org._id,
      isActive: true,
    });
  }

  await logGmsAction(req, 'Hospital Created', `Created client hospital ${org.name} (${org.code})`, {
    relatedId: org._id,
    organizationId: org._id,
    metadata: { copiedSanjeeviData: false, adminEmail: admin?.email || null },
  });
  if (admin) {
    await logGmsAction(req, 'User Created', `Created hospital admin ${admin.email} for ${org.name}`, {
      relatedId: admin._id,
      relatedModel: 'User',
      organizationId: org._id,
    });
  }

  res.status(201).json({
    success: true,
    data: {
      ...orgJson(org),
      admin: admin
        ? { _id: admin._id, name: admin.name, email: admin.email, role: admin.role }
        : null,
    },
  });
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
    if (isPlatformOrg(org)) {
      return next(new ErrorResponse('GMS platform code cannot be changed', 400));
    }
    const code = sanitizeCode(req.body.code);
    if (code === PLATFORM_CODE) {
      return next(new ErrorResponse('GMS is reserved for the Super Admin organization', 400));
    }
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
  await logGmsAction(req, 'Hospital Updated', `Updated hospital ${org.name} (${org.code})`, {
    relatedId: org._id,
    organizationId: org._id,
  });
  res.status(200).json({ success: true, data: orgJson(org) });
});

exports.setOrganizationStatus = asyncHandler(async (req, res, next) => {
  const org = await Organization.findById(req.params.id);
  if (!org) return next(new ErrorResponse('Organization not found', 404));
  if (isPlatformOrg(org)) {
    return next(new ErrorResponse('GMS Super Admin organization cannot be deactivated', 400));
  }
  const status = req.body.status === 'inactive' ? 'inactive' : 'active';
  org.status = status;
  org.updatedBy = req.user._id;
  await org.save();
  await logGmsAction(
    req,
    status === 'active' ? 'Hospital Activated' : 'Hospital Deactivated',
    `${status === 'active' ? 'Activated' : 'Deactivated'} hospital ${org.name} (${org.code})`,
    { relatedId: org._id, organizationId: org._id, metadata: { status } },
  );
  res.status(200).json({ success: true, data: orgJson(org) });
});

exports.createHospitalAdmin = asyncHandler(async (req, res, next) => {
  const org = await Organization.findById(req.params.id);
  if (!org) return next(new ErrorResponse('Organization not found', 404));
  if (isPlatformOrg(org)) {
    return next(new ErrorResponse('Create hospital logins on a client hospital, not on GMS', 400));
  }

  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return next(new ErrorResponse('Name, email and password are required', 400));
  }

  const adminEmail = String(email).toLowerCase().trim();
  const taken = await User.findOne({ email: adminEmail, organizationId: org._id });
  if (taken) {
    return next(new ErrorResponse('This email is already used by staff in this hospital. Use a different email.', 400));
  }

  const admin = await User.create({
    name: String(name).trim(),
    email: adminEmail,
    password,
    phone: phone || '',
    role: 'Admin',
    organizationId: org._id,
    isActive: true,
  });

  await logGmsAction(req, 'User Created', `Created hospital admin ${admin.email} for ${org.name}`, {
    relatedId: admin._id,
    relatedModel: 'User',
    organizationId: org._id,
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
    return next(new ErrorResponse('GMS Super Admin stays on the GMS organization', 400));
  }
  if (isPlatformOrg(org)) {
    return next(new ErrorResponse('Hospital staff cannot be assigned to the GMS platform organization', 400));
  }

  user.organizationId = org._id;
  await user.save({ validateBeforeSave: false });
  await logGmsAction(req, 'User Assigned', `Assigned ${user.email} to ${org.name}`, {
    relatedId: user._id,
    relatedModel: 'User',
    organizationId: org._id,
  });

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
  if (isPlatformOrg(org)) {
    return next(new ErrorResponse('GMS is the Super Admin organization, not a hospital client', 400));
  }

  if (isSuperAdmin(req.user.role)) {
    req.user.lastActiveOrganizationId = org._id;
    await req.user.save({ validateBeforeSave: false });
  }

  await logGmsAction(req, 'Hospital Accessed', `Opened hospital ${org.name} (${org.code})`, {
    relatedId: org._id,
    organizationId: org._id,
  });

  sendTokenResponse(req.user, 200, res, {
    activeOrganizationId: org._id,
    organization: organizationSnapshot(org),
    req,
  });
});

exports.clearHospitalContext = asyncHandler(async (req, res) => {
  if (isSuperAdmin(req.user.role)) {
    req.user.lastActiveOrganizationId = undefined;
    await req.user.save({ validateBeforeSave: false });
  }
  await logGmsAction(req, 'Hospital Accessed', 'Returned to GMS Global Super Admin');
  sendTokenResponse(req.user, 200, res, {
    organization: null,
    req: { organization: null, organizationId: null },
  });
});
