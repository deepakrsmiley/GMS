/**
 * Replace Sri Sanjeevi CBC parameters with the hematology-analyzer list.
 * Other hospitals are not changed. Completed reports are not changed.
 *
 * Dry-run: node scripts/applySanjeeviCbc.js
 * Apply:   node scripts/applySanjeeviCbc.js --apply --confirm YES
 */
require('dotenv').config();

const path = require('path');
const { pathToFileURL } = require('url');
const mongoose = require('mongoose');
const TestMaster = require('../models/TestMaster');
const LabTest = require('../models/LabTest');
const Organization = require('../models/Organization');

const toItems = (tests) => (tests || [])
  .filter((row) => row && row.testName)
  .map((row, index) => ({
    testCode: '',
    testName: String(row.testName).trim(),
    unit: row.unit || '',
    normalRange: row.normalRange || '',
    method: '',
    sample: '',
    sortOrder: index,
    isSection: false,
  }));

const isCbcProfile = (name) => /cbc|complete blood count|hemogram/i.test(String(name || ''));

const hasEnteredValue = (value) => String(value ?? '').trim() !== '';

const replaceOrderCbc = (order, items) => {
  const tests = Array.isArray(order.tests) ? order.tests : [];
  const kept = [];
  let insertAt = -1;
  let price = 0;
  let profileName = 'CBC (Complete Blood Count)';
  const removedNames = new Set();
  tests.forEach((row) => {
    const profile = row?.profileName || '';
    const ownName = row?.testName || '';
    const belongs = isCbcProfile(profile) || (!profile && isCbcProfile(ownName));
    if (!belongs) {
      kept.push(row);
      return;
    }
    if (insertAt < 0) insertAt = kept.length;
    if (isCbcProfile(profile)) profileName = profile;
    price += Number(row.price) || 0;
    if (ownName) removedNames.add(ownName);
  });
  if (insertAt < 0) return null;

  const entered = (order.results || []).some((row) =>
    removedNames.has(row.testName) && hasEnteredValue(row.value));
  if (entered) return null;

  const nextTests = items.map((item, index) => ({
    testName: item.testName,
    profileName,
    price: index === 0 ? price : 0,
    unit: item.unit || '',
    normalRange: item.normalRange || '',
    method: '',
    isSection: false,
    status: 'pending',
  }));
  kept.splice(insertAt, 0, ...nextTests);
  const results = (order.results || []).filter((row) => !removedNames.has(row.testName));
  return { tests: kept, results };
};

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
  const { SANJEEVI_CBC_TESTS } = await import(profilesUrl);
  const items = toItems(SANJEEVI_CBC_TESTS);

  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, { family: 4 });
  const orgs = await Organization.find().select('name code').lean();
  const sanjeevi = orgs.find((org) => /sanjeevi/i.test(`${org.name} ${org.code}`));
  if (!sanjeevi) throw new Error('Sri Sanjeevi organization not found');

  const otherBefore = await TestMaster.countDocuments({
    organizationId: { $ne: sanjeevi._id },
  }).setOptions({ skipOrganizationFilter: true });
  const otherCbcBefore = await TestMaster.find({
    organizationId: { $ne: sanjeevi._id },
    name: /cbc|complete blood count|hemogram/i,
  }).select('name organizationId items.testName').setOptions({ skipOrganizationFilter: true }).lean();

  const masters = await TestMaster.find({
    organizationId: sanjeevi._id,
    name: /^(cbc|cbc \(complete blood count\)|complete blood count)$/i,
  }).setOptions({ skipOrganizationFilter: true });

  console.log(`Hospital: ${sanjeevi.name} (${sanjeevi.code})`);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`CBC packages: ${masters.map((row) => row.name).join(', ') || 'none'}`);
  console.log(`New parameters (${items.length}): ${items.map((row) => row.testName).join(', ')}`);

  for (const master of masters) {
    const previous = (master.items || []).map((item) => item.testName).join(', ');
    console.log(`Replace ${master.name}: ${previous}`);
    if (apply) {
      master.kind = 'group';
      master.category = master.category || 'Haematology';
      master.sampleType = master.sampleType || 'blood';
      master.items = items;
      master.markModified('items');
      await master.save();
    }
  }

  const openOrders = await LabTest.find({
    organizationId: sanjeevi._id,
    status: { $in: ['pending', 'sample_collected', 'processing'] },
  }).setOptions({ skipOrganizationFilter: true });

  let ordersUpdated = 0;
  let ordersSkipped = 0;
  for (const order of openOrders) {
    const next = replaceOrderCbc(order, items);
    if (!next) {
      const hasCbc = (order.tests || []).some((row) => isCbcProfile(row.profileName) || isCbcProfile(row.testName));
      if (hasCbc) ordersSkipped += 1;
      continue;
    }
    ordersUpdated += 1;
    if (apply) {
      order.tests = next.tests;
      order.results = next.results;
      order.markModified('tests');
      order.markModified('results');
      await order.save();
    }
  }
  console.log(`Open CBC orders updated: ${ordersUpdated}`);
  console.log(`Open CBC orders left unchanged (results already entered): ${ordersSkipped}`);

  const otherAfter = await TestMaster.countDocuments({
    organizationId: { $ne: sanjeevi._id },
  }).setOptions({ skipOrganizationFilter: true });
  const otherCbcAfter = await TestMaster.find({
    organizationId: { $ne: sanjeevi._id },
    name: /cbc|complete blood count|hemogram/i,
  }).select('name organizationId items.testName').setOptions({ skipOrganizationFilter: true }).lean();

  if (otherBefore !== otherAfter) {
    throw new Error(`Other hospitals changed: ${otherBefore} -> ${otherAfter}`);
  }
  const beforeKey = JSON.stringify(otherCbcBefore);
  const afterKey = JSON.stringify(otherCbcAfter);
  if (beforeKey !== afterKey) {
    throw new Error('Another hospital CBC list changed');
  }
  console.log(`Other hospitals unchanged (${otherAfter} tests).`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
