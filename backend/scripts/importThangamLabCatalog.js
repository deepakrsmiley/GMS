/**
 * Import MASSoft BloodLab catalog into Thangam hospital only.
 *
 * Dry-run:  node scripts/importThangamLabCatalog.js
 * Apply:    node scripts/importThangamLabCatalog.js --apply --confirm YES
 */
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

const TestMaster = require('../models/TestMaster');
const Organization = require('../models/Organization');
const { runWithOrganizationContext } = require('../middleware/tenantContext');

const DEFAULT_XLSX = path.normalize('C:/Users/Deepak/Desktop/Thangam_Lab_Tests_Export.xlsx');
const ORG_MATCH = /thangam/i;

const CHILD_CODE_ALIASES = {
  'cal(ion)': 'Ca++',
  pt: 'Pt / INR',
};

const GROUP_NAME_BY_CODE = {
  'dengue elisa': 'Dengue ELISA',
  'sugar prof': 'Sugar Profile (RBS + PPBS)',
  'sug prof': 'Sugar Profile',
};

const GROUP_CATEGORY = {
  ABG: 'Biochemistry',
  Bilirubin: 'Biochemistry',
  BTCT: 'Haematology',
  group: 'Haematology',
  Coag: 'Haematology',
  CBC: 'Haematology',
  Dengue: 'Serology',
  'Dengue elisa': 'Serology',
  ESR: 'Haematology',
  FT3FT4: 'Biochemistry',
  GCT: 'Biochemistry',
  'Lipid Profile': 'Biochemistry',
  LFT: 'Biochemistry',
  Mantoux: 'Microbiology',
  OGTT: 'Biochemistry',
  Pleural: 'Pathology',
  RFT: 'Biochemistry',
  Sero: 'Serology',
  ELEC: 'Biochemistry',
  'sug prof': 'Biochemistry',
  'Sugar Prof': 'Biochemistry',
  TFT: 'Biochemistry',
  'Urine Routine': 'Urine Analysis',
  WIDAL: 'Serology',
};

const dash = (value) => {
  const s = String(value ?? '').trim();
  return s;
};

const num = (value) => {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function parseArgs(argv) {
  const args = { apply: argv.includes('--apply'), confirm: null, file: DEFAULT_XLSX };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--confirm' && argv[i + 1]) args.confirm = argv[i + 1];
    if (argv[i] === '--file' && argv[i + 1]) args.file = argv[i + 1];
  }
  return args;
}

function inferCategory(name, sample, code) {
  const hay = `${name} ${sample} ${code}`.toLowerCase();
  if (/urine|upt\b|u leu|u nit|u pro|u-?ph|u glu|u ket|u blo|u pus|u rbc/.test(hay)) return 'Urine Analysis';
  if (/sputum|afb|mantoux|culture|gram stain/.test(hay)) return 'Microbiology';
  if (/hiv|hbsag|hcv|vdrl|widal|dengue|ra factor|aso\b|crp\b/.test(hay)) return 'Serology';
  if (/ecg\b/.test(hay)) return 'ECG';
  if (/usg|ultra/.test(hay)) return 'Ultrasound';
  if (/x-?ray/.test(hay)) return 'X-Ray';
  if (/ct scan|\bct\b/.test(hay)) return 'CT Scan';
  if (/\bmri\b/.test(hay)) return 'MRI';
  if (/hemoglobin|haemoglobin|wbc|rbc count|platelet|esr|pcv|hct|mcv|mch|lymph|granulocyte|blood group|bleeding|clotting|aptt|inr|ptl|hematocrit/.test(hay)) {
    return 'Haematology';
  }
  if (/pap smear|biopsy|fnac|histopath|cytolog/.test(hay)) return 'Pathology';
  return 'Biochemistry';
}

function inferSample(sample, category) {
  const s = String(sample || '').toLowerCase();
  if (s.includes('urine') || category === 'Urine Analysis') return 'urine';
  if (s.includes('stool')) return 'stool';
  if (s.includes('sputum')) return 'sputum';
  if (s.includes('swab')) return 'swab';
  if (s.includes('tissue')) return 'tissue';
  if (['X-Ray', 'Ultrasound', 'ECG', 'CT Scan', 'MRI', 'Radiology', 'Pathology'].includes(category)) return 'other';
  return 'blood';
}

function uniqueName(base, code, used) {
  const clean = dash(base) || dash(code) || 'Untitled';
  if (!used.has(clean.toLowerCase())) {
    used.add(clean.toLowerCase());
    return clean;
  }
  const withCode = `${clean} (${dash(code) || '2'})`;
  if (!used.has(withCode.toLowerCase())) {
    used.add(withCode.toLowerCase());
    return withCode;
  }
  let i = 2;
  while (used.has(`${clean} ${i}`.toLowerCase())) i += 1;
  const next = `${clean} ${i}`;
  used.add(next.toLowerCase());
  return next;
}

function sheetRows(wb, name) {
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error(`Excel sheet missing: ${name}`);
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function readCatalog(file) {
  if (!fs.existsSync(file)) throw new Error(`Excel not found: ${file}`);
  const wb = XLSX.readFile(file);
  const singles = sheetRows(wb, '1_Single_Tests').map((r) => ({
    testCode: dash(r['Test Code']),
    testName: dash(r['Test Name']),
    unit: dash(r.Unit),
    sample: dash(r.Sample),
    normalRange: dash(r['Normal Range']),
    method: dash(r.Method),
    price: num(r['Customer Price']),
    doctorPrice: num(r['Doctor Price']),
  })).filter((r) => r.testCode || r.testName);

  const groups = sheetRows(wb, '2_Group_Tests').map((r) => ({
    groupName: dash(r['Group Name (click this in HMS)'] || r['Group Name']),
    groupCode: dash(r['Group Code']),
    price: num(r['Customer Price (package)'] || r['Customer Price']),
    doctorPrice: num(r['Doctor Price']),
  })).filter((r) => r.groupCode);

  const items = sheetRows(wb, '3_Group_Items').map((r) => ({
    groupName: dash(r['Group Name']),
    groupCode: dash(r['Group Code']),
    order: num(r.Order) || 0,
    testCode: dash(r['Child Test Code']),
    testName: dash(r['Child Test Name']),
    unit: dash(r.Unit),
    sample: dash(r.Sample),
    normalRange: dash(r['Normal Range']),
    method: dash(r.Method),
    subHead: dash(r['Sub Head']),
    matchStatus: dash(r['Match Status']),
  }));

  return { singles, groups, items };
}

function buildDocuments(catalog) {
  const usedNames = new Set();
  const docs = [];
  const singleByCode = new Map();
  catalog.singles.forEach((s) => {
    if (s.testCode) singleByCode.set(s.testCode.toLowerCase(), s);
  });

  const itemsByGroup = new Map();
  catalog.items.forEach((item) => {
    const key = item.groupCode;
    if (!itemsByGroup.has(key)) itemsByGroup.set(key, []);
    itemsByGroup.get(key).push(item);
  });

  catalog.groups.forEach((group) => {
    const displayName = GROUP_NAME_BY_CODE[group.groupCode.toLowerCase()]
      || (group.groupName && group.groupName !== '-' ? group.groupName : group.groupCode);
    const name = uniqueName(displayName, group.groupCode, usedNames);
    const category = GROUP_CATEGORY[group.groupCode] || inferCategory(name, '', group.groupCode);
    const rawItems = (itemsByGroup.get(group.groupCode) || []).sort((a, b) => a.order - b.order);
    const items = [];
    rawItems.forEach((item, idx) => {
      if (!item.testCode && item.subHead) {
        items.push({
          testCode: '',
          testName: item.subHead,
          unit: '',
          normalRange: '',
          method: '',
          sample: '',
          sortOrder: idx,
          isSection: true,
        });
        return;
      }
      if (!item.testCode) return;
      const alias = CHILD_CODE_ALIASES[item.testCode.toLowerCase()];
      const lookupCode = (alias || item.testCode).toLowerCase();
      const single = singleByCode.get(lookupCode)
        || [...singleByCode.values()].find((s) => s.testCode.toLowerCase() === lookupCode);
      items.push({
        testCode: alias || item.testCode,
        testName: item.testName || single?.testName || item.subHead || item.testCode,
        unit: item.unit || single?.unit || '',
        normalRange: item.normalRange || single?.normalRange || '',
        method: item.method || single?.method || '',
        sample: item.sample || single?.sample || '',
        sortOrder: idx,
        isSection: false,
      });
    });
    docs.push({
      name,
      testCode: group.groupCode,
      kind: 'group',
      category,
      sampleType: inferSample(items.find((i) => i.sample)?.sample, category),
      price: group.price,
      doctorPrice: group.doctorPrice,
      items,
      description: `MASSoft group ${group.groupCode}`,
      isActive: true,
    });
  });

  catalog.singles.forEach((s) => {
    const category = inferCategory(s.testName, s.sample, s.testCode);
    docs.push({
      name: uniqueName(s.testName, s.testCode, usedNames),
      testCode: s.testCode,
      kind: 'single',
      category,
      sampleType: inferSample(s.sample, category),
      price: s.price,
      doctorPrice: s.doctorPrice,
      unit: s.unit,
      normalRange: s.normalRange,
      method: s.method,
      items: [],
      description: `MASSoft ${s.testCode}`,
      isActive: true,
    });
  });

  return docs;
}

async function upsertDocs(docs, org, apply) {
  const stats = { create: 0, update: 0, groups: 0, singles: 0 };
  const existing = await TestMaster.find({ organizationId: org._id }).setOptions({ skipOrganizationFilter: true });
  const byCode = new Map();
  const byName = new Map();
  existing.forEach((row) => {
    if (row.testCode) byCode.set(`${row.kind}:${String(row.testCode).toLowerCase()}`, row);
    byName.set(String(row.name).toLowerCase(), row);
  });

  for (const doc of docs) {
    if (doc.kind === 'group') stats.groups += 1;
    else stats.singles += 1;
    const found = byCode.get(`${doc.kind}:${String(doc.testCode || '').toLowerCase()}`)
      || byName.get(doc.name.toLowerCase());
    const payload = { ...doc, organizationId: org._id };
    if (found) {
      stats.update += 1;
      if (apply) {
        await TestMaster.updateOne(
          { _id: found._id },
          { $set: payload },
          { skipOrganizationFilter: true },
        );
      }
    } else {
      stats.create += 1;
      if (apply) await TestMaster.create(payload);
    }
  }
  return stats;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`File: ${args.file}`);
  console.log(`Mode: ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
  if (args.apply && args.confirm !== 'YES') {
    console.error('Refusing to write. Use: --apply --confirm YES');
    process.exit(1);
  }

  const catalog = readCatalog(args.file);
  const docs = buildDocuments(catalog);
  console.log(`Excel singles: ${catalog.singles.length}`);
  console.log(`Excel groups: ${catalog.groups.length}`);
  console.log(`Excel group lines: ${catalog.items.length}`);
  console.log(`Documents to upsert: ${docs.length} (${docs.filter((d) => d.kind === 'group').length} groups, ${docs.filter((d) => d.kind === 'single').length} singles)`);

  const cbc = docs.find((d) => d.testCode === 'CBC');
  if (cbc) console.log(`CBC check: ${cbc.name} ₹${cbc.price} children=${cbc.items.length} -> ${cbc.items.map((i) => i.testName).join(', ')}`);

  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, { family: 4 });
  const org = await Organization.findOne({
    $or: [
      { name: ORG_MATCH },
      { code: ORG_MATCH },
    ],
  });
  if (!org) throw new Error('Thangam organization not found');
  console.log(`Target: ${org.name} (${org.code})  _id=${org._id}`);

  const before = await TestMaster.countDocuments({ organizationId: org._id }).setOptions({ skipOrganizationFilter: true });
  const otherBefore = await TestMaster.countDocuments({ organizationId: { $ne: org._id } }).setOptions({ skipOrganizationFilter: true });
  console.log(`Thangam tests before: ${before}`);
  console.log(`Other hospitals tests (must stay): ${otherBefore}`);

  const stats = await runWithOrganizationContext(
    {
      organizationId: org._id,
      organization: org,
      organizationCode: org.code,
      isSuperAdmin: true,
      skipOrganizationFilter: true,
    },
    () => upsertDocs(docs, org, args.apply),
  );

  const after = await TestMaster.countDocuments({ organizationId: org._id }).setOptions({ skipOrganizationFilter: true });
  const otherAfter = await TestMaster.countDocuments({ organizationId: { $ne: org._id } }).setOptions({ skipOrganizationFilter: true });

  console.log('\nSummary');
  console.log(`  Groups: ${stats.groups}`);
  console.log(`  Singles: ${stats.singles}`);
  console.log(`  Create: ${stats.create}  Update: ${stats.update}`);
  console.log(`  Thangam tests after: ${after}`);
  console.log(`  Other hospitals tests after: ${otherAfter}`);
  if (otherAfter !== otherBefore) {
    throw new Error('Other hospital TestMaster count changed — aborting concern');
  }

  if (!args.apply) {
    console.log('\nDry-run only. To write:');
    console.log('  node scripts/importThangamLabCatalog.js --apply --confirm YES');
  } else {
    console.log('\nImport applied to Thangam only.');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
