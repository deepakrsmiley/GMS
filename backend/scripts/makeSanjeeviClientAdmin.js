/**
 * Make non-GMS Super Admin users into Sri Sanjeevi Hospital (HOSP001) client admins.
 * Does not delete, copy, or retag patients/bills/stock.
 *
 * Keeps deepak@gms.com as GMS Super Admin.
 *
 *   node scripts/makeSanjeeviClientAdmin.js
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { HOSPITAL_A_CODE } = require('../utils/hospitalA');

const GMS_SUPER_ADMIN_EMAILS = new Set(
  [process.env.GMS_BOOTSTRAP_EMAIL, 'deepak@gms.com']
    .filter(Boolean)
    .map((email) => String(email).toLowerCase().trim()),
);

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const sanjeevi = await db.collection('organizations').findOne({ code: HOSPITAL_A_CODE });
  if (!sanjeevi) {
    console.error('HOSP001 Sri Sanjeevi Hospital was not found. No users changed.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const supers = await db.collection('users').find({ role: 'Super Admin' }).toArray();
  let converted = 0;
  for (const user of supers) {
    const email = String(user.email || '').toLowerCase().trim();
    if (GMS_SUPER_ADMIN_EMAILS.has(email)) {
      console.log(`Keep GMS Super Admin: ${email}`);
      continue;
    }
    await db.collection('users').updateOne(
      { _id: user._id },
      {
        $set: {
          role: 'Admin',
          organizationId: sanjeevi._id,
        },
        $inc: { tokenVersion: 1 },
        $unset: { lastActiveOrganizationId: '' },
      },
    );
    converted += 1;
    console.log(`Converted ${email} (${user.name}) to Sri Sanjeevi Hospital Admin. No hospital data changed.`);
  }

  if (!converted) console.log('No Sanjeevi Super Admin accounts needed conversion.');
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err.message);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
