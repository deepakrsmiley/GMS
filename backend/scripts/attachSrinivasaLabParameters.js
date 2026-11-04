/**
 * Store built-in lab parameters on Srinivasa packages that were saved
 * as a name and price only. Other hospitals are not changed.
 * Packages that already have parameter rows are left as they are.
 *
 * Dry-run: node scripts/attachSrinivasaLabParameters.js
 * Apply:   node scripts/attachSrinivasaLabParameters.js --apply --confirm YES
 */
require('dotenv').config();

const path = require('path');
const { pathToFileURL } = require('url');
const mongoose = require('mongoose');
const TestMaster = require('../models/TestMaster');
const Organization = require('../models/Organization');

const toItems = (tests) => (tests || [])
  .filter((row) => row && row.testName)
  .map((row, idx) => ({
    testCode: '',
    testName: String(row.testName).trim(),
    unit: row.unit || '',
    normalRange: row.normalRange || '',
    method: row.method || '',
    sample: '',
    sortOrder: idx,
    isSection: !!row.isSection,
  }));

async function main() {
  const apply = process.argv.includes('--apply');
  const confirm = process.argv.includes('--confirm')
    && process.argv[process.argv.indexOf('--confirm') + 1] === 'YES';
  if (apply && !confirm) {
    console.error('Refusing to write. Use: --apply --confirm YES');
    process.exit(1);
  }

  const profilesUrl = pathToFileURL(
    path.resolve(__dirname, '../../frontend/src/constants/labProfiles.js'),
  ).href;
  const { LAB_PROFILES } = await import(profilesUrl);
  const byName = new Map(
    Object.entries(LAB_PROFILES)
      .filter(([, profile]) => profile && !Array.isArray(profile) && Array.isArray(profile.tests))
      .map(([name, profile]) => [name.trim().toLowerCase(), { name, tests: profile.tests }]),
  );

  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, { family: 4 });
  const orgs = await Organization.find().lean();
  const srinivasa = orgs.find((org) => /srinivasa/i.test(`${org.name} ${org.code}`));
  if (!srinivasa) throw new Error('Srinivasa organization not found');

  const beforeOthers = await TestMaster.countDocuments({
    organizationId: { $ne: srinivasa._id },
  }).setOptions({ skipOrganizationFilter: true });

  const rows = await TestMaster.find({ organizationId: srinivasa._id, kind: 'group' })
    .setOptions({ skipOrganizationFilter: true });

  const updates = [];
  const skippedHasItems = [];
  const skippedNoProfile = [];
  rows.forEach((row) => {
    const existing = (row.items || []).filter((item) => item && item.testName);
    if (existing.length) {
      skippedHasItems.push(row.name);
      return;
    }
    const profile = byName.get(String(row.name || '').trim().toLowerCase());
    if (!profile) {
      skippedNoProfile.push(row.name);
      return;
    }
    const items = toItems(profile.tests);
    if (!items.length) {
      skippedNoProfile.push(row.name);
      return;
    }
    updates.push({ id: row._id, name: row.name, items });
  });

  console.log(`Hospital: ${srinivasa.name} (${srinivasa.code})`);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Packages that will get parameters: ${updates.length}`);
  updates.forEach((row) => {
    console.log(`  ${row.name}: ${row.items.length} — ${row.items.map((item) => item.testName).join(', ')}`);
  });
  console.log(`Already had parameters: ${skippedHasItems.length}`);
  console.log(`No matching parameter list: ${skippedNoProfile.join(', ') || 'none'}`);

  if (apply) {
    for (const row of updates) {
      await TestMaster.updateOne(
        { _id: row.id, organizationId: srinivasa._id },
        { $set: { items: row.items } },
      ).setOptions({ skipOrganizationFilter: true });
    }
    const afterOthers = await TestMaster.countDocuments({
      organizationId: { $ne: srinivasa._id },
    }).setOptions({ skipOrganizationFilter: true });
    if (afterOthers !== beforeOthers) {
      throw new Error('Another hospital lab catalog changed');
    }
    const emptyLeft = await TestMaster.countDocuments({
      organizationId: srinivasa._id,
      kind: 'group',
      $or: [{ items: { $size: 0 } }, { items: { $exists: false } }],
    }).setOptions({ skipOrganizationFilter: true });
    console.log(`Other hospitals unchanged (${afterOthers} tests).`);
    console.log(`Srinivasa groups still without parameters: ${emptyLeft}`);
  } else {
    console.log('\nDry-run only. To write:');
    console.log('  node scripts/attachSrinivasaLabParameters.js --apply --confirm YES');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
