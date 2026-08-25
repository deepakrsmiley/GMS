/**
 * Build a browser-ready data URI from a User document's MongoDB-stored photo.
 */

const toNodeBuffer = (data) => {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  // mongoose Binary
  if (data.buffer && (Buffer.isBuffer(data.buffer) || data.buffer instanceof Uint8Array)) {
    return Buffer.from(data.buffer);
  }
  if (data instanceof Uint8Array) return Buffer.from(data);
  // toObject() shape: { type: 'Buffer', data: number[] }
  if (data.type === 'Buffer' && Array.isArray(data.data)) return Buffer.from(data.data);
  if (Array.isArray(data)) return Buffer.from(data);
  try {
    return Buffer.from(data);
  } catch {
    return null;
  }
};

const toAvatarDataUri = (user) => {
  if (!user) return '';
  const photo = user.profilePhoto;
  if (photo?.data && photo.contentType) {
    const buf = toNodeBuffer(photo.data);
    if (buf && buf.length) {
      return `data:${photo.contentType};base64,${buf.toString('base64')}`;
    }
  }
  const legacy = user.avatar;
  if (legacy && (String(legacy).startsWith('data:') || String(legacy).startsWith('http'))) {
    return String(legacy);
  }
  return '';
};

/**
 * Public JSON shape for user responses — includes `avatar` data URI, omits raw Buffer.
 * `permissions` is the effective set (role defaults ∪ Super Admin grants).
 */
const serializeUser = (userDoc) => {
  if (!userDoc) return null;
  const { resolveEffectivePermissions } = require('../config/permissions');
  const { normalizeRole } = require('./roles');
  const u = typeof userDoc.toObject === 'function'
    ? userDoc.toObject({ flattenMaps: true })
    : { ...userDoc };
  u.avatar = toAvatarDataUri(userDoc);
  u.permissions = resolveEffectivePermissions(normalizeRole(u.role), u.permissions);
  if (u.organizationId && typeof u.organizationId === 'object' && u.organizationId._id) {
    u.organization = {
      _id: u.organizationId._id,
      name: u.organizationId.name,
      code: u.organizationId.code,
      status: u.organizationId.status,
      logo: u.organizationId.logo || '',
    };
    u.organizationId = u.organizationId._id;
  }
  delete u.profilePhoto;
  delete u.password;
  delete u.resetPasswordOTP;
  delete u.resetPasswordOTPExpire;
  delete u.resetPasswordToken;
  delete u.resetPasswordExpire;
  return u;
};

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/**
 * Parse a data:image/...;base64,... string into { data, contentType } for MongoDB.
 */
const parseDataUriPhoto = (dataUri) => {
  if (!dataUri || typeof dataUri !== 'string') {
    return { error: 'Invalid image data' };
  }
  const match = dataUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    return { error: 'Photo must be a valid image (JPG, PNG, WEBP, GIF)' };
  }
  const contentType = match[1].toLowerCase();
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(contentType)) {
    return { error: 'Only JPG, PNG, WEBP or GIF photos are allowed' };
  }
  const data = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!data.length) return { error: 'Empty photo data' };
  if (data.length > MAX_PHOTO_BYTES) {
    return { error: 'Photo must be under 2MB' };
  }
  return { data, contentType: contentType === 'image/jpg' ? 'image/jpeg' : contentType };
};

module.exports = {
  toAvatarDataUri,
  serializeUser,
  parseDataUriPhoto,
  MAX_PHOTO_BYTES,
};
