/**
 * Drops leftover unique index `user_1` on patients (old schema).
 * That index rejects every new patient because user is always null.
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hms';
  await mongoose.connect(mongoUri, { family: 4 });

  const dbName = mongoose.connection.name;
  console.log(`Connected to DB: ${dbName}`);

  const indexes = await mongoose.connection.db.collection('patients').indexes();
  console.log('Current patient indexes:', indexes.map((i) => i.name).join(', '));

  const hasUserIndex = indexes.some((i) => i.name === 'user_1' || (i.key && i.key.user === 1));
  if (!hasUserIndex) {
    console.log('No stale user index found — nothing to drop.');
  } else {
    await mongoose.connection.db.collection('patients').dropIndex('user_1');
    console.log('Dropped index: user_1');
  }

  await mongoose.connection.close();
  console.log('Done.');
}

main().catch(async (err) => {
  console.error(err.message || err);
  try { await mongoose.connection.close(); } catch (_) { /* ignore */ }
  process.exit(1);
});
