/**
 * Copy Thangam lab test master into Srinivasa hospital only.
 * Existing Srinivasa tests (same name) are left as they are.
 *
 * Dry-run: node scripts/copyThangamLabCatalogToSrinivasa.js
 * Apply:   node scripts/copyThangamLabCatalogToSrinivasa.js --apply --confirm YES
 */
require('dotenv').config();

const mongoose = require('mongoose');
const TestMaster = require('../models/TestMaster');
const Organization = require('../models/Organization');

const stripCopy = (doc, organizationId) => {
  const row = { ...doc };
  delete row._id;
  delete row.__v;
  delete row.createdAt;
  delete row.updatedAt;
  delete row.createdBy;
  row.organizationId = organizationId;
  return row;
};

async function main() {
  const apply = process.argv.includes('--apply');
  const confirm = process.argv.includes('--confirm')
    && process.argv[process.argv.indexOf('--confirm') + 1] === 'YES';
  if (apply && !confirm) {
    console.error('Refusing to write. Use: --apply --confirm YES');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, { family: 4 });
  const orgs = await Organization.find().lean();
  const thangam = orgs.find((org) => /thangam/i.test(`${org.name} ${org.code}`));
  const srinivasa = orgs.find((org) => /srinivasa/i.test(`${org.name} ${org.code}`));
  if (!thangam) throw new Error('Thangam organization not found');
  if (!srinivasa) throw new Error('Srinivasa organization not found');
  console.log(`From: ${thangam.name} (${thangam.code})`);
  console.log(`To:   ${srinivasa.name} (${srinivasa.code})`);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);

  const source = await TestMaster.find({ organizationId: thangam._id })
    .setOptions({ skipOrganizationFilter: true })
    .lean();
  const existing = await TestMaster.find({ organizationId: srinivasa._id })
    .setOptions({ skipOrganizationFilter: true })
    .lean();
  const beforeOthers = await TestMaster.countDocuments({
    organizationId: { $nin: [srinivasa._id] },
  }).setOptions({ skipOrganizationFilter: true });

  const names = new Set(existing.map((row) => String(row.name || '').trim().toLowerCase()));
  const toInsert = [];
  const skipped = [];
  source.forEach((row) => {
    const key = String(row.name || '').trim().toLowerCase();
    if (!key || names.has(key)) {
      skipped.push(row.name);
      return;
    }
    names.add(key);
    toInsert.push(stripCopy(row, srinivasa._id));
  });

  console.log(`Thangam tests: ${source.length}`);
  console.log(`Srinivasa tests before: ${existing.length}`);
  console.log(`Will add: ${toInsert.length}`);
  console.log(`Skipped (already in Srinivasa): ${skipped.join(', ') || 'none'}`);
  const ogtt = toInsert.find((row) => String(row.testCode || '').toLowerCase() === 'ogtt');
  if (ogtt) {
    console.log(`OGTT time parameters: ${(ogtt.items || []).map((item) => item.testName).join(' | ')}`);
  }

  if (apply) {
    if (toInsert.length) {
      await TestMaster.insertMany(toInsert, { ordered: true });
    }
    const after = await TestMaster.countDocuments({ organizationId: srinivasa._id })
      .setOptions({ skipOrganizationFilter: true });
    const afterOthers = await TestMaster.countDocuments({
      organizationId: { $nin: [srinivasa._id] },
    }).setOptions({ skipOrganizationFilter: true });
    console.log(`Srinivasa tests after: ${after}`);
    if (afterOthers !== beforeOthers) {
      throw new Error('Another hospital lab catalog changed');
    }
    console.log('Other hospitals unchanged.');
  } else {
    console.log('\nDry-run only. To write:');
    console.log('  node scripts/copyThangamLabCatalogToSrinivasa.js --apply --confirm YES');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
