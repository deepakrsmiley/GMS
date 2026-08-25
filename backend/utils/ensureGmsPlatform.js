/**
 * Ensure GMS exists as the Super Admin / platform organization.
 * Hospital clients (Sri Sanjeevi, Srinivasa, later hospitals) stay clients.
 * Never deletes, copies, or retags clinical data.
 */
const logger = require('./logger');
const {
  PLATFORM_CODE,
  KIND_PLATFORM,
  KIND_CLIENT,
} = require('./hospitalA');

const ensureGmsPlatform = async () => {
  const Organization = require('../models/Organization');
  const User = require('../models/User');

  let platform = await Organization.findOne({
    $or: [{ code: PLATFORM_CODE }, { kind: KIND_PLATFORM }],
  });

  if (!platform) {
    platform = await Organization.create({
      name: 'Galactic Medical Systems',
      code: PLATFORM_CODE,
      kind: KIND_PLATFORM,
      status: 'active',
    });
    logger.info('Created GMS platform organization (Super Admin). Hospital client data was not moved.');
  } else {
    let changed = false;
    if (platform.kind !== KIND_PLATFORM) {
      platform.kind = KIND_PLATFORM;
      changed = true;
    }
    if (String(platform.code || '').toUpperCase() !== PLATFORM_CODE) {
      const clash = await Organization.findOne({ code: PLATFORM_CODE, _id: { $ne: platform._id } });
      if (!clash) {
        platform.code = PLATFORM_CODE;
        changed = true;
      }
    }
    if (changed) await platform.save();
  }

  const clientResult = await Organization.updateMany(
    { _id: { $ne: platform._id }, kind: { $ne: KIND_CLIENT } },
    { $set: { kind: KIND_CLIENT } },
  );

  const superAdminResult = await User.updateMany(
    {
      role: 'Super Admin',
      $or: [
        { organizationId: { $exists: false } },
        { organizationId: null },
        { organizationId: { $ne: platform._id } },
      ],
    },
    { $set: { organizationId: platform._id } },
  );

  const clearedLast = await User.updateMany(
    { role: 'Super Admin', lastActiveOrganizationId: platform._id },
    { $unset: { lastActiveOrganizationId: 1 } },
  );

  logger.info(
    `GMS platform ready (${platform.code}). Clients tagged: ${clientResult.modifiedCount || 0}. Super Admins bound: ${superAdminResult.modifiedCount || 0}. Last-active platform cleared: ${clearedLast.modifiedCount || 0}.`,
  );

  return platform;
};

module.exports = { ensureGmsPlatform };
