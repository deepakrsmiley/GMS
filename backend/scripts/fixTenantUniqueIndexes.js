/**
 * One-shot repair for leftover global unique indexes that block Hospital B staff.
 * Safe to re-run. Does not modify documents.
 *
 *   node scripts/fixTenantUniqueIndexes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { ensureTenantUniqueIndexes } = require('../utils/tenantUniqueIndexes');

const logger = {
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
};

const main = async () => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hms';
  await mongoose.connect(mongoUri);
  console.log('Connected:', mongoose.connection.host, mongoose.connection.name);
  await ensureTenantUniqueIndexes(mongoose, logger);
  console.log('Done. Restart the backend if it is already running.');
  await mongoose.disconnect();
};

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
