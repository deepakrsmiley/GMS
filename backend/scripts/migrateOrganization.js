/**
 * Organization tenancy migration.
 *
 * Default is dry-run (no writes).
 *
 *   npm run migrate:organization
 *   npm run migrate:organization -- --dry-run
 *   npm run migrate:organization -- --apply --confirm YES
 *
 * Never run from server.js. Never deletes or duplicates documents.
 */
require('dotenv').config();

const mongoose = require('mongoose');

const DEFAULT_NAME = 'Sri Sanjeevi Hospital';
const DEFAULT_CODE = 'HOSP001';
const PLACEHOLDER_NAME = 'Your Hospital Name';

const HOSPITAL_COLLECTIONS = [
  'patients',
  'opregistrations',
  'ipadmissions',
  'appointments',
  'prescriptions',
  'operations',
  'labtests',
  'bills',
  'directsales',
  'shifts',
  'departments',
  'wards',
  'beds',
  'rooms',
  'medicines',
  'stockmovements',
  'suppliers',
  'servicemasters',
  'testmasters',
  'brandings',
  'documents',
  'activitylogs',
  'chatmessages',
  'notifications',
  'changerequests',
  'assets',
  'assetcomplaints',
  'bmevendors',
  'bmechecklisttemplates',
  'bmeworkorders',
  'bmepreventivemaintenances',
  'bmecalibrations',
  'bmeelectricalsafeties',
  'bmespareparts',
  'bmecontracts',
  'bmemovements',
  'bmelifecycleevents',
];

const COUNTER_KEYS = [
  'patient', 'bill', 'lab', 'admission', 'directSale', 'operation', 'changeRequest',
];

const missingOrgFilter = {
  $or: [
    { organizationId: { $exists: false } },
    { organizationId: null },
  ],
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const dryRun = !apply || args.includes('--dry-run');
  const confirm = args.includes('--confirm') && args.some((a, i) => a === '--confirm' && args[i + 1] === 'YES');
  const updateIndexes = args.includes('--update-indexes');
  return { apply, dryRun: !apply, confirm, updateIndexes };
};

const countMissing = async (coll) => coll.countDocuments(missingOrgFilter);
const countWithOrg = async (coll) => coll.countDocuments({
  organizationId: { $exists: true, $ne: null },
});

const resolveHospitalAName = (branding) => {
  const fromDb = String(branding?.hospitalName || '').trim();
  if (fromDb && fromDb !== PLACEHOLDER_NAME) return fromDb;
  return DEFAULT_NAME;
};

const printTable = (rows) => {
  console.log('');
  console.log('collection'.padEnd(32), 'total'.padStart(8), 'hasOrg'.padStart(8), 'missing'.padStart(8), 'wouldUpdate'.padStart(12));
  console.log('-'.repeat(70));
  rows.forEach((r) => {
    console.log(
      String(r.name).padEnd(32),
      String(r.total).padStart(8),
      String(r.hasOrg).padStart(8),
      String(r.missing).padStart(8),
      String(r.wouldUpdate).padStart(12),
    );
  });
};

const seedHospitalACounters = async (db, orgId, dryRun) => {
  const counters = db.collection('counters');
  const summary = [];
  for (const name of COUNTER_KEYS) {
    const legacy = await counters.findOne({ _id: name });
    const key = `${name}:${orgId}`;
    const exists = await counters.findOne({ _id: key });
    if (legacy && !exists) {
      summary.push({ key, from: legacy.seq, action: dryRun ? 'would-copy' : 'copy' });
      if (!dryRun) {
        await counters.insertOne({ _id: key, seq: legacy.seq });
      }
    } else {
      summary.push({ key, from: exists?.seq ?? 0, action: exists ? 'exists' : 'none' });
    }
  }
  return summary;
};

const main = async () => {
  const { apply, confirm, updateIndexes } = parseArgs();
  const dryRun = !apply;

  if (apply && !confirm) {
    console.error('Refusing to apply. Re-run with: npm run migrate:organization -- --apply --confirm YES');
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hms';
  console.log(dryRun ? '=== DRY RUN (no writes) ===' : '=== APPLY (missing organizationId only) ===');
  const safeUri = String(mongoUri).replace(/\/\/([^:/]+):([^@]+)@/, '//***:***@');
  console.log('MongoDB:', safeUri);

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  const branding = await db.collection('brandings').findOne({}, { sort: { updatedAt: -1 } });
  const name = resolveHospitalAName(branding);
  const code = DEFAULT_CODE;

  let org = await db.collection('organizations').findOne({ code });
  console.log('\nHospital A identity:');
  console.log('  name:', name);
  console.log('  code:', code);
  console.log('  gst:', branding?.gstNumber || '(from branding: empty)');
  console.log('  address:', branding?.address || '(from branding: empty)');
  console.log('  existing org:', org ? String(org._id) : '(will create)');

  if (!dryRun && !org) {
    const inserted = await db.collection('organizations').insertOne({
      name,
      code,
      status: 'active',
      logo: branding?.logo || '',
      address: branding?.address || '',
      phone: branding?.phone || '',
      email: branding?.email || '',
      gstNumber: branding?.gstNumber || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    org = await db.collection('organizations').findOne({ _id: inserted.insertedId });
    console.log('  created organization', String(org._id));
  }

  const orgId = org?._id || 'DRY_RUN_ORG_ID';
  const rows = [];

  for (const collName of HOSPITAL_COLLECTIONS) {
    const coll = db.collection(collName);
    let total = 0;
    let hasOrg = 0;
    let missing = 0;
    try {
      total = await coll.countDocuments();
      hasOrg = await countWithOrg(coll);
      missing = await countMissing(coll);
    } catch (err) {
      if (err.codeName === 'NamespaceNotFound' || err.code === 26) {
        rows.push({ name: collName, total: 0, hasOrg: 0, missing: 0, wouldUpdate: 0 });
        continue;
      }
      throw err;
    }
    rows.push({ name: collName, total, hasOrg, missing, wouldUpdate: missing });
    if (!dryRun && missing > 0) {
      const result = await coll.updateMany(missingOrgFilter, { $set: { organizationId: org._id } });
      console.log(`updated ${collName}: ${result.modifiedCount}`);
    }
  }

  const users = db.collection('users');
  const userTotal = await users.countDocuments();
  const hospitalMissing = await users.countDocuments({
    role: { $ne: 'Super Admin' },
    ...missingOrgFilter,
  });
  const superAdmins = await users.countDocuments({ role: 'Super Admin' });
  rows.push({
    name: 'users (non Super Admin)',
    total: userTotal - superAdmins,
    hasOrg: await users.countDocuments({
      role: { $ne: 'Super Admin' },
      organizationId: { $exists: true, $ne: null },
    }),
    missing: hospitalMissing,
    wouldUpdate: hospitalMissing,
  });
  rows.push({
    name: 'users (Super Admin, skipped)',
    total: superAdmins,
    hasOrg: await users.countDocuments({
      role: 'Super Admin',
      organizationId: { $exists: true, $ne: null },
    }),
    missing: 0,
    wouldUpdate: 0,
  });

  if (!dryRun && hospitalMissing > 0) {
    const result = await users.updateMany(
      { role: { $ne: 'Super Admin' }, $or: missingOrgFilter.$or },
      { $set: { organizationId: org._id } },
    );
    console.log(`updated users (non Super Admin): ${result.modifiedCount}`);
  }

  printTable(rows);

  const counterSummary = org?._id
    ? await seedHospitalACounters(db, org._id, dryRun)
    : [];
  if (counterSummary.length) {
    console.log('\nCounters (Hospital A sequence continuity):');
    counterSummary.forEach((c) => console.log(`  ${c.key}: ${c.action} (seq ${c.from})`));
  }

  if (apply && updateIndexes) {
    console.log('\nIndex note: --update-indexes was requested.');
    console.log('Compound unique indexes should be added only after Hospital A backfill.');
    console.log('This migration does not drop existing unique indexes unless you add a dedicated index script.');
  }

  console.log('\nSafety:');
  console.log('  deletes: 0');
  console.log('  duplicates: 0');
  console.log('  passwords: unchanged');
  console.log('  patient/bill IDs: unchanged');
  console.log(dryRun ? '\nDry-run complete. No documents were modified.' : '\nApply complete.');

  await mongoose.disconnect();
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { HOSPITAL_COLLECTIONS, missingOrgFilter, resolveHospitalAName, DEFAULT_NAME, DEFAULT_CODE };
