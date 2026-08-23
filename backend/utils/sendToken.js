const { toAvatarDataUri } = require('./userAvatar');
const { resolveEffectivePermissions } = require('../config/permissions');
const { normalizeRole } = require('./roles');

const sendTokenResponse = (user, statusCode, res) => {
  const token = user.getSignedJwtToken();
  const isLocalhost = (process.env.CLIENT_URL || '').includes('localhost');
  const isProduction = process.env.NODE_ENV === 'production' && !isLocalhost;

  const cookieOptions = {
    expires: new Date(Date.now() + (process.env.JWT_COOKIE_EXPIRE || 7) * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  };

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
      },
    });
};

module.exports = sendTokenResponse;
