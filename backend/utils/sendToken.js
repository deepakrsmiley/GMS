const { toAvatarDataUri } = require('./userAvatar');
const { resolveEffectivePermissions } = require('../config/permissions');
const { normalizeRole, isSuperAdmin } = require('./roles');
const { sanitizeEnabledModules } = require('../config/hospitalModules');

const organizationSnapshot = (user, req) => {
  const populated = user.organizationId && user.organizationId.name
    ? user.organizationId
    : null;
  const fromReq = req?.organization || populated;
  if (!fromReq) {
    return {
      organizationId: user.organizationId?._id || user.organizationId || req?.organizationId || null,
      organization: null,
    };
  }
  return {
    organizationId: fromReq._id || user.organizationId,
    organization: {
      _id: fromReq._id,
      name: fromReq.name,
      code: fromReq.code,
      status: fromReq.status,
      logo: fromReq.logo || '',
      enabledModules: sanitizeEnabledModules(fromReq.enabledModules),
    },
  };
};

const sendTokenResponse = (user, statusCode, res, extras = {}) => {
  const token = user.getSignedJwtToken(extras);
  const isLocalhost = (process.env.CLIENT_URL || '').includes('localhost');
  const isProduction = process.env.NODE_ENV === 'production' && !isLocalhost;

  const cookieOptions = {
    expires: new Date(Date.now() + (process.env.JWT_COOKIE_EXPIRE || 7) * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  };

  const org = organizationSnapshot(user, extras.req);
  const superAdmin = isSuperAdmin(user.role);

  res
    .status(statusCode)
    .cookie('token', token, cookieOptions)
    .json({
      success: true,
      token,
      data: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        department: user.department,
        avatar: toAvatarDataUri(user),
        permissions: resolveEffectivePermissions(normalizeRole(user.role), user.permissions),
        organizationId: superAdmin ? (extras.activeOrganizationId || org.organizationId) : org.organizationId,
        organization: extras.organization || org.organization,
      },
    });
};

module.exports = sendTokenResponse;
