const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Organization = require('../models/Organization');
const { isSuperAdmin } = require('../utils/roles');
const {
  bindOrganizationContext,
  setRequestOrganizationContext,
  getOrganizationContext,
  getContextOrganizationId,
} = require('./tenantContext');
const { legacyMissingOrgFilter, legacyOrOrgFilter } = require('../plugins/organizationScope');
const { isHospitalA, HOSPITAL_A_CODE, isPlatformOrg, isClientOrg } = require('../utils/hospitalA');

const toIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

const untaggedRowsBelongToOrg = (org, oldestOrg) => {
  if (!org) return false;
  if (isHospitalA(org)) return true;
  if (!oldestOrg) return false;
  return String(org._id) === String(oldestOrg._id);
};

const stripClientOrganizationId = (req, _res, next) => {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    delete req.body.organizationId;
  }
  if (req.query && typeof req.query === 'object') {
    delete req.query.organizationId;
  }
  if (req.params && typeof req.params === 'object') {
    // Never treat a route param named organizationId as tenant authority for hospital users.
    // Super Admin org routes use :id for the target organization, not this field.
    delete req.params.organizationId;
  }
  next();
};

const resolveOrganizationContext = async (user, decoded = {}) => {
  const superAdmin = isSuperAdmin(user.role);

  if (!superAdmin) {
    const orgRef = user.organizationId;
    const orgId = orgRef?._id || orgRef || null;
    if (orgId) {
      const org = orgRef && orgRef.code
        ? orgRef
        : await Organization.findById(orgId).lean();
      if (!org) {
        throw new ErrorResponse('Organization not found for this user', 401);
      }
      if (org.status !== 'active') {
        throw new ErrorResponse('Organization is deactivated. Contact GMS Super Admin.', 401);
      }
      if (isPlatformOrg(org)) {
        throw new ErrorResponse('Hospital staff belong to a client hospital, not the GMS platform organization', 401);
      }
      return {
        organizationId: org._id,
        organization: org,
        organizationCode: org.code,
        isSuperAdmin: false,
        // Sri Sanjeevi staff must still see leftover untagged live rows.
        legacyUnscoped: isHospitalA(org),
        mustSelectOrganization: false,
      };
    }
    return {
      organizationId: null,
      organization: null,
      organizationCode: null,
      isSuperAdmin: false,
      legacyUnscoped: true,
      mustSelectOrganization: false,
    };
  }

  const selectedId = decoded.activeOrganizationId || null;
  const orgs = await Organization.find().sort({ createdAt: 1 }).lean();

  if (selectedId && mongoose.Types.ObjectId.isValid(selectedId)) {
    const org = orgs.find((item) => String(item._id) === String(selectedId))
      || await Organization.findById(selectedId).lean();
    if (org && isClientOrg(org)) {
      return {
        organizationId: org._id,
        organization: org,
        organizationCode: org.code,
        isSuperAdmin: true,
        legacyUnscoped: isHospitalA(org, orgs),
        mustSelectOrganization: false,
      };
    }
  }

  // GMS Super Admin with no client selected: empty platform, not a hospital.
  return {
    organizationId: null,
    organization: null,
    organizationCode: null,
    isSuperAdmin: true,
    legacyUnscoped: false,
    mustSelectOrganization: true,
  };
};

const attachOrganizationContext = asyncHandler(async (req, res, next) => {
  if (!req.user) return next();
  const context = await resolveOrganizationContext(req.user, req.authToken || {});
  setRequestOrganizationContext(req, context);
  await bindOrganizationContext(context, res, next);
});

const authorizeSuperAdmin = (req, res, next) => {
  if (!isSuperAdmin(req.user?.role)) {
    return next(new ErrorResponse('Only GMS Super Admin can manage organizations', 403));
  }
  next();
};

const getRequestOrganizationId = (req) => {
  if (req?.organizationId) return req.organizationId;
  if (isSuperAdmin(req?.user?.role)) {
    return getContextOrganizationId();
  }
  return req?.user?.organizationId || getContextOrganizationId();
};

const orgFilter = (req, extra = {}) => {
  const ctx = req?.tenant || getOrganizationContext();
  const orgId = req?.organizationId || ctx?.organizationId;
  if (orgId && ctx?.legacyUnscoped) {
    const scope = legacyOrOrgFilter(orgId);
    return Object.keys(extra).length ? { $and: [extra, scope] } : scope;
  }
  if (orgId) return { organizationId: orgId, ...extra };
  if (ctx?.legacyUnscoped) {
    return {
      $and: [
        extra,
        legacyMissingOrgFilter,
      ],
    };
  }
  return { _id: null, ...extra };
};

const userOrgFilter = (req, extra = {}) => {
  const orgId = getRequestOrganizationId(req);
  const ctx = req?.tenant || getOrganizationContext();
  if (orgId && ctx?.legacyUnscoped) {
    return { ...extra, ...legacyOrOrgFilter(orgId) };
  }
  if (orgId) {
    return { organizationId: orgId, ...extra };
  }
  if (ctx?.legacyUnscoped) {
    return {
      ...extra,
      ...legacyMissingOrgFilter,
    };
  }
  return { _id: null, ...extra };
};

const withOrganization = (req, data = {}) => {
  const payload = { ...(data && typeof data.toObject === 'function' ? data.toObject() : data) };
  delete payload.organizationId;
  const orgId = getRequestOrganizationId(req);
  if (orgId) payload.organizationId = orgId;
  return payload;
};

const orgById = (req, id, extra = {}) => {
  const orgId = getRequestOrganizationId(req);
  const ctx = req?.tenant || getOrganizationContext();
  const query = { _id: id, ...extra };
  if (orgId && ctx?.legacyUnscoped) {
    Object.assign(query, legacyOrOrgFilter(orgId));
  } else if (orgId) {
    query.organizationId = orgId;
  } else if (ctx?.legacyUnscoped) {
    Object.assign(query, legacyMissingOrgFilter);
  } else {
    query._id = null;
  }
  return query;
};

const uploadsFolder = (req, suffix = 'files') => {
  const code = req.organizationCode || HOSPITAL_A_CODE;
  return `hms/${code}/${suffix}`;
};

const orgRoom = {
  chat: (orgId) => (orgId ? `org:${toIdString(orgId)}:chat` : 'hospital:chat'),
  role: (orgId, role) => (orgId ? `org:${toIdString(orgId)}:role:${role}` : `role:${role}`),
  branding: (orgId) => (orgId ? `org:${toIdString(orgId)}:branding` : 'branding:updated'),
  all: (orgId) => (orgId ? `org:${toIdString(orgId)}` : 'hospital'),
  user: (userId) => `user:${userId}`,
};

module.exports = {
  stripClientOrganizationId,
  resolveOrganizationContext,
  attachOrganizationContext,
  authorizeSuperAdmin,
  setRequestOrganizationContext,
  getRequestOrganizationId,
  orgFilter,
  userOrgFilter,
  withOrganization,
  orgById,
  uploadsFolder,
  orgRoom,
  toIdString,
  untaggedRowsBelongToOrg,
};
