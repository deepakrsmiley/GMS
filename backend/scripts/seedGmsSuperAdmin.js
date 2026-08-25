/**
 * Create the GMS Global Super Admin login.
 *
 * Does NOT read, copy, delete, or retag hospital operational data.
 *
 * Password must come from the environment (never commit it):
 *
 *   GMS_BOOTSTRAP_EMAIL=deepak@gms.com
 *   GMS_BOOTSTRAP_NAME=Deepak
 *   GMS_BOOTSTRAP_PASSWORD=********
 *   npm run seed:gms-admin
 *
 * Idempotent: if the email already exists as Super Admin, only GMS org binding is ensured.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { ensureGmsPlatform } = require('../utils/ensureGmsPlatform');

const email = String(process.env.GMS_BOOTSTRAP_EMAIL || '').toLowerCase().trim();
const name = String(process.env.GMS_BOOTSTRAP_NAME || 'Deepak').trim();
const password = String(process.env.GMS_BOOTSTRAP_PASSWORD || '');

const run = async () => {
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    console.error('Set GMS_BOOTSTRAP_EMAIL to a valid email.');
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error('Set GMS_BOOTSTRAP_PASSWORD (min 8 characters). Do not put it in source files.');
    process.exit(1);
  }
  if (!process.env.MONGO_URI && !process.env.MONGODB_URI) {
    console.error('MONGO_URI is not set.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const platform = await ensureGmsPlatform();
  const User = require('../models/User');

  const existing = await User.findOne({ email }).select('+password');
  if (existing) {
    if (existing.role !== 'Super Admin') {
      console.error(`Refusing to change ${email}: existing role is ${existing.role} (not Super Admin).`);
      await mongoose.disconnect();
      process.exit(1);
    }
    existing.organizationId = platform._id;
    existing.isActive = true;
    if (process.env.GMS_BOOTSTRAP_RESET_PASSWORD === 'YES') {
      existing.password = password;
    }
    await existing.save();
    console.log(`GMS Super Admin already exists (${email}). Bound to GMS platform. No hospital data changed.`);
    await mongoose.disconnect();
    return;
  }

  await User.create({
    name,
    email,
    password,
    role: 'Super Admin',
    organizationId: platform._id,
    isActive: true,
  });

  console.log(`Created GMS Global Super Admin ${email} on platform ${platform.code}. Hospital records were not modified.`);
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err.message);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
