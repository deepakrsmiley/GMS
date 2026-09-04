/**
 * Replace Srinivasa hospital (HOSP002) referring-doctor display names only.
 * Does not create users, change emails/passwords, or touch other hospitals.
 *
 * Apply: node scripts/updateSrinivasaDoctors.js --apply --confirm YES
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Organization = require('../models/Organization');

const ORG_CODE = 'HOSP002';

const UPDATES = [
  {
    email: 'drkarthick@gms.com',
    name: 'Dr.S.Karthick Ms.,(Gen.Surg).,FMAS,DMAS.,FIAGES',
    specialization: '',
    qualification: 'MS (Gen.Surg), FMAS, DMAS, FIAGES',
  },
  {
    email: 'sowmiya@gms.com',
    name: 'Dr.B.Sowmiya M.S.,(OBG).,FRM.',
    specialization: '',
    qualification: 'MS (OBG), FRM',
  },
];

const apply = process.argv.includes('--apply');
const confirm = (() => {
  const i = process.argv.indexOf('--confirm');
  return i >= 0 ? process.argv[i + 1] : null;
})();

(async () => {
  if (apply && confirm !== 'YES') {
    console.error('Refusing to write. Use: --apply --confirm YES');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hms');

  const org = await Organization.findOne({ code: { $regex: `^${ORG_CODE}$`, $options: 'i' } });
  if (!org) throw new Error('Srinivasa hospital (HOSP002) not found');
  if (!/srinivasa/i.test(org.name)) {
    throw new Error(`Refusing: org ${org.code} is "${org.name}", expected Srinivasa`);
  }

  console.log(`Target: ${org.name} (${org.code})  _id=${org._id}`);
  console.log(apply ? 'Mode: APPLY' : 'Mode: DRY-RUN');

  for (const spec of UPDATES) {
    const doctor = await User.findOne({
      organizationId: org._id,
      role: { $in: ['Doctor', 'doctor'] },
      email: spec.email,
    }).select('name email specialization qualification organizationId');

    if (!doctor) {
      console.log(`[MISSING] ${spec.email} — not in Srinivasa, skipped`);
      continue;
    }

    console.log(`[${apply ? 'UPDATE' : 'WOULD UPDATE'}] ${doctor.email}`);
    console.log(`  was: ${doctor.name}`);
    console.log(`  now: ${spec.name}`);

    if (apply) {
      await User.updateOne(
        { _id: doctor._id, organizationId: org._id },
        {
          $set: {
            name: spec.name,
            specialization: spec.specialization,
            qualification: spec.qualification,
          },
        },
      );
    }
  }

  const after = await User.find({
    organizationId: org._id,
    role: { $in: ['Doctor', 'doctor'] },
  }).select('name email specialization qualification').lean();
  console.log('\nSrinivasa doctors now:');
  after.forEach((d) => console.log(`  - ${d.name}  <${d.email}>`));

  const other = await User.find({
    organizationId: { $ne: org._id },
    role: { $in: ['Doctor', 'doctor'] },
  }).select('name email organizationId').populate('organizationId', 'name code').lean();
  console.log('\nOther-hospital doctors (unchanged):');
  other.forEach((d) => console.log(`  - ${d.organizationId?.name || d.organizationId} | ${d.name} <${d.email}>`));

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
