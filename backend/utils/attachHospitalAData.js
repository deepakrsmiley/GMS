/**
 * Attach leftover untagged rows to Sri Sanjeevi (HOSP001).
 * Never deletes or duplicates. Only $set organizationId where it is missing.
 */
const mongoose = require('mongoose');
const logger = require('./logger');
const { HOSPITAL_A_CODE } = require('./hospitalA');
const { HOSPITAL_COLLECTIONS, missingOrgFilter } = require('../scripts/migrateOrganization');

const attachUntaggedHospitalAData = async () => {
  const db = mongoose.connection?.db;
  if (!db) return { skipped: true, reason: 'no-db' };

  let org = await db.collection('organizations').findOne({ code: HOSPITAL_A_CODE });
  if (!org) {
    org = await db.collection('organizations').findOne({ name: { $regex: 'sanjeevi', $options: 'i' } });
  }
  if (!org?._id) return { skipped: true, reason: 'no-hospital-a' };

  const summary = [];
  for (const collName of HOSPITAL_COLLECTIONS) {
    const coll = db.collection(collName);
    let missing = 0;
    try {
      missing = await coll.countDocuments(missingOrgFilter);
    } catch (err) {
      if (err.codeName === 'NamespaceNotFound' || err.code === 26) continue;
      throw err;
    }
    if (missing <= 0) continue;
    const result = await coll.updateMany(missingOrgFilter, { $set: { organizationId: org._id } });
    summary.push({ collection: collName, tagged: result.modifiedCount });
  }

  const users = db.collection('users');
  const hospitalMissing = await users.countDocuments({
    role: { $ne: 'Super Admin' },
    ...missingOrgFilter,
  });
  if (hospitalMissing > 0) {
    const result = await users.updateMany(
      { role: { $ne: 'Super Admin' }, $or: missingOrgFilter.$or },
      { $set: { organizationId: org._id } },
    );
    summary.push({ collection: 'users', tagged: result.modifiedCount });
  }

  if (summary.length) {
    const total = summary.reduce((sum, row) => sum + (row.tagged || 0), 0);
    logger.info(`Hospital A (${org.code}): attached ${total} leftover untagged row(s); nothing deleted`);
  }

  return { skipped: false, organizationId: org._id, code: org.code, summary };
};

module.exports = { attachUntaggedHospitalAData };
