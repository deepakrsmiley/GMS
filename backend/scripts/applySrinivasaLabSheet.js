/**
 * Apply the lab-sheet corrections for Srinivasa only.
 * Other hospitals are not changed.
 *
 * Dry-run: node scripts/applySrinivasaLabSheet.js
 * Apply:   node scripts/applySrinivasaLabSheet.js --apply --confirm YES
 */
require('dotenv').config();

const path = require('path');
const { pathToFileURL } = require('url');
const mongoose = require('mongoose');
const TestMaster = require('../models/TestMaster');
const Organization = require('../models/Organization');

const toItems = (tests) => (tests || [])
  .filter((row) => row && row.testName)
  .map((row, index) => ({
    testCode: '',
    testName: String(row.testName).trim(),
    unit: row.unit || '',
    normalRange: row.normalRange || '',
    method: row.method || '',
    sample: '',
    sortOrder: index,
    isSection: !!row.isSection,
  }));

const bilirubinRange = (name) => {
  const text = String(name || '').trim().toLowerCase();
  if (/u-bili|urine/.test(text)) return null;
  if (/indirect bilirubin/.test(text) || /^i\.?\s*b$/.test(text)) return '0.2–0.8';
  if (/direct bilirubin/.test(text) || /^d\.?\s*b$/.test(text)) return '0.0–0.3';
  if (/total bilirubin/.test(text) || /^t\.?\s*b$/.test(text)) return '0.1–1.2';
  return null;
};

const fixName = (name) => String(name || '').replace(/post\s+pra[nr]di[ae]n/gi, 'Post Prandial');

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
  const { LAB_PROFILES, CBC_22_TESTS } = await import(profilesUrl);

  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, { family: 4 });
  const orgs = await Organization.find().select('name code').lean();
  const srinivasa = orgs.find((org) => /srinivasa/i.test(`${org.name} ${org.code}`));
  if (!srinivasa) throw new Error('Srinivasa organization not found');

  const otherBefore = await TestMaster.countDocuments({
    organizationId: { $ne: srinivasa._id },
  }).setOptions({ skipOrganizationFilter: true });

  const rows = await TestMaster.find({ organizationId: srinivasa._id })
    .setOptions({ skipOrganizationFilter: true });

  const hemogram = toItems(CBC_22_TESTS);
  const lipid = toItems(LAB_PROFILES['Lipid Profile'].tests);
  const screening = toItems(LAB_PROFILES['Health Screening Package'].tests);
  const replaceItems = new Map([
    ['complete blood count', hemogram],
    ['cbc (complete blood count)', hemogram],
    ['cbc', hemogram],
    ['lipid profile', lipid],
  ]);

  const notes = [];
  for (const row of rows) {
    const key = String(row.name || '').trim().toLowerCase();
    let changed = false;
    const nextName = fixName(row.name);
    if (nextName !== row.name) {
      row.name = nextName;
      changed = true;
      notes.push(`rename ${key} -> ${nextName}`);
    }
    if (/post prandial/i.test(row.name) && row.normalRange !== '<140') {
      row.normalRange = '<140';
      changed = true;
    }
    const ownBilirubin = bilirubinRange(row.name);
    if (ownBilirubin && row.kind !== 'group' && row.normalRange !== ownBilirubin) {
      row.normalRange = ownBilirubin;
      row.unit = row.unit || 'mg/dL';
      changed = true;
    }
    if (replaceItems.has(key)) {
      row.kind = 'group';
      row.items = replaceItems.get(key);
      if (!row.category) row.category = key.includes('lipid') ? 'Biochemistry' : 'Haematology';
      changed = true;
      notes.push(`parameters ${row.name} (${row.items.length})`);
    } else if (Array.isArray(row.items) && row.items.length) {
      row.items.forEach((item) => {
        const itemName = fixName(item.testName);
        if (itemName !== item.testName) {
          item.testName = itemName;
          changed = true;
        }
        if (/post prandial/i.test(item.testName) && item.normalRange !== '<140') {
          item.normalRange = '<140';
          item.unit = item.unit || 'mg/dL';
          changed = true;
        }
        const range = bilirubinRange(item.testName);
        if (range && row.category !== 'Urine Analysis' && item.normalRange !== range) {
          item.normalRange = range;
          item.unit = item.unit || 'mg/dL';
          changed = true;
        }
      });
      if (changed) row.markModified('items');
    }
    if (changed && apply) await row.save();
    else if (changed) notes.push(`would save ${row.name}`);
  }

  const existingPackage = rows.find((row) => String(row.name).trim().toLowerCase() === 'health screening package');
  if (!existingPackage) {
    notes.push('create Health Screening Package at 1700');
    if (apply) {
      await TestMaster.create({
        organizationId: srinivasa._id,
        name: 'Health Screening Package',
        kind: 'group',
        category: 'Biochemistry',
        sampleType: 'blood',
        price: 1700,
        doctorPrice: 0,
        items: screening,
        description: 'CBC, ESR, sugar profile, lipid profile, RFT, LFT, bilirubin, and urine routine.',
        isActive: true,
      });
    }
  } else {
    existingPackage.kind = 'group';
    existingPackage.price = 1700;
    existingPackage.items = screening;
    existingPackage.category = existingPackage.category || 'Biochemistry';
    notes.push('update Health Screening Package to 1700');
    if (apply) await existingPackage.save();
  }

  const otherAfter = await TestMaster.countDocuments({
    organizationId: { $ne: srinivasa._id },
  }).setOptions({ skipOrganizationFilter: true });
  if (otherBefore !== otherAfter) {
    throw new Error(`Other hospitals changed: ${otherBefore} -> ${otherAfter}`);
  }

  console.log(apply ? 'Applied' : 'Dry run');
  notes.forEach((line) => console.log('-', line));
  console.log('Other hospitals unchanged:', otherAfter);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
