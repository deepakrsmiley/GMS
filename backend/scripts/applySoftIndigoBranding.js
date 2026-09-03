/**
 * Set Soft Indigo primary colour on all hospital branding records.
 *
 *   node scripts/applySoftIndigoBranding.js --apply --confirm YES
 */
require('dotenv').config();
const mongoose = require('mongoose');

const PRIMARY = '#4338ca';
const LAB_PRIMARY = '#4338ca';
const LAB_SECONDARY = '#818cf8';
const LAB_TITLE = '#4338ca';

async function main() {
  const apply = process.argv.includes('--apply');
  const confirmIdx = process.argv.indexOf('--confirm');
  const confirm = confirmIdx >= 0 ? process.argv[confirmIdx + 1] : null;

  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, { family: 4 });
  const col = mongoose.connection.db.collection('brandings');
  const orgs = await mongoose.connection.db.collection('organizations')
    .find({}, { projection: { name: 1, code: 1 } }).toArray();

  const before = await col.find({}, { projection: { hospitalName: 1, primaryColor: 1, organizationId: 1 } }).toArray();
  console.log(`Branding docs: ${before.length}`);
  before.forEach((b) => {
    const org = orgs.find((o) => String(o._id) === String(b.organizationId));
    console.log(`  ${org?.name || b.hospitalName || '—'}  ${b.primaryColor || '(none)'} → ${PRIMARY}`);
  });

  if (!apply) {
    console.log('\nDry-run only. Run with --apply --confirm YES');
    await mongoose.disconnect();
    return;
  }
  if (confirm !== 'YES') {
    console.error('Refusing to write without --confirm YES');
    process.exit(1);
  }

  const result = await col.updateMany(
    {},
    {
      $set: {
        primaryColor: PRIMARY,
        'labReport.primaryColor': LAB_PRIMARY,
        'labReport.secondaryColor': LAB_SECONDARY,
        'labReport.reportTitleColor': LAB_TITLE,
        'labReport.tableHeaderBackgroundColor': '#e0e7ff',
        'labReport.borderColor': '#c7d2fe',
      },
    },
  );

  // Ensure every client hospital has a branding doc
  for (const org of orgs) {
    if (String(org.code).toUpperCase() === 'GMS') continue;
    const exists = await col.findOne({ organizationId: org._id });
    if (!exists) {
      await col.insertOne({
        organizationId: org._id,
        hospitalName: org.name,
        primaryColor: PRIMARY,
        tagline: 'Healthcare Excellence',
        footerNote: 'Thank you for choosing our hospital.',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`Created branding for ${org.name}`);
    }
  }

  console.log(`Updated branding docs: matched=${result.matchedCount} modified=${result.modifiedCount}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
