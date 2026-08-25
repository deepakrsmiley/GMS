/**
 * Read-only hospital tenant counts. Never writes.
 *
 *   npm run verify:hospital-counts
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { HOSPITAL_A_CODE, PLATFORM_CODE } = require('../utils/hospitalA');

const COLLECTIONS = [
  'patients', 'bills', 'opregistrations', 'ipadmissions', 'appointments',
  'prescriptions', 'medicines', 'users',
];

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const orgs = await db.collection('organizations').find({}, { projection: { name: 1, code: 1, kind: 1 } }).toArray();
  console.log('Organizations:');
  orgs.forEach((o) => console.log(`  ${o.code}  ${o.name}  kind=${o.kind || 'n/a'}  _id=${o._id}`));

  const hospA = orgs.find((o) => String(o.code).toUpperCase() === HOSPITAL_A_CODE);
  for (const org of orgs) {
    if (String(org.code).toUpperCase() === PLATFORM_CODE) continue;
    console.log(`\n${org.name} (${org.code})`);
    for (const name of COLLECTIONS) {
      try {
        const n = await db.collection(name).countDocuments({ organizationId: org._id });
        console.log(`  ${name}: ${n}`);
      } catch (_) {
        console.log(`  ${name}: (missing)`);
      }
    }
  }

  if (hospA) {
    const untaggedPatients = await db.collection('patients').countDocuments({
      $or: [{ organizationId: { $exists: false } }, { organizationId: null }],
    });
    console.log(`\nUntagged leftover patients: ${untaggedPatients}`);
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err.message);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
