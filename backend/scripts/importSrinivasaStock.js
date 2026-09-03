/**
 * Import CURRENT STOCK Excel into Srinivasa hospital (HOSP002) pharmacy.
 *
 * Default: dry-run (no writes).
 * Apply:   node scripts/importSrinivasaStock.js --apply --confirm YES
 *
 * Rules (per user):
 * - Blank CURRENT STOCK → 0
 * - PCS RATE → sellingPrice
 * - Target org: Srinivasa hospital
 * - Duplicate medicine name → update (price + batch qty set from Excel)
 */
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

const Medicine = require('../models/Medicine');
const Supplier = require('../models/Supplier');
const Organization = require('../models/Organization');
const { syncCurrentStock, normalizeBatchNumber } = require('../utils/pharmacyStockHelper');
const { runWithOrganizationContext } = require('../middleware/tenantContext');

const DEFAULT_XLSX = path.normalize('C:/Users/Deepak/Downloads/CURRENT STOCK( 1 ).xlsx');
const ORG_CODE = 'HOSP002';

const CATEGORY_MAP = {
  TABLET: 'tablet',
  CAPSULE: 'capsule',
  RESPULES: 'inhaler',
  INHALER: 'inhaler',
  POWDER: 'powder',
  SYP: 'syrup',
  'GARGLE LIQUID': 'other',
  IVF: 'iv_fluid',
  SACHET: 'powder',
  FLUID: 'iv_fluid',
  INJECTION: 'injection',
  'GLUCOSE STRIP': 'consumables',
  GLUCOMETER: 'consumables',
  'CLOSURE DEVICE': 'surgical',
  SURGICAL: 'surgical',
  SYRINGE: 'consumables',
  'IU DEVICE': 'surgical',
  'CANNULA FIXATOR': 'surgical',
  'IV CATHETER': 'surgical',
  'IV SET': 'surgical',
  'SV SET': 'surgical',
  OINTMENT: 'ointment',
  BANDAGE: 'surgical',
  'HAIR SOLUTION': 'other',
  SPRAY: 'other',
  LOTION: 'other',
  SHAMPOO: 'other',
  SOAP: 'other',
  DROPS: 'drops',
  'NASAL SOLUTION': 'drops',
  'EYE DROPS': 'drops',
  'EAR DROPS': 'drops',
  'NASAL DROPS': 'drops',
  SUPPO: 'other',
  LIQUID: 'syrup',
};

const MONTHS = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4,
  JUN: 5, JUNE: 5, JUL: 6, JULY: 6, AUG: 7,
  SEP: 8, SEPT: 8, OCT: 9, NOV: 10, DEC: 11,
};

function parseArgs(argv) {
  const args = {
    apply: argv.includes('--apply'),
    confirm: null,
    file: DEFAULT_XLSX,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--confirm' && argv[i + 1]) args.confirm = argv[i + 1];
    if (argv[i] === '--file' && argv[i + 1]) args.file = path.normalize(argv[i + 1]);
  }
  return args;
}

function mapCategory(raw) {
  const key = String(raw || '').trim().toUpperCase();
  return CATEGORY_MAP[key] || 'other';
}

function parseExpiry(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Excel serial date
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + raw * 86400000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const text = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  // OCT.2027 / JUNE.2027 / JAN-2027 / 10/2027
  let m = text.match(/^([A-Z]+)\.?(\d{4})$/);
  if (m && MONTHS[m[1]] != null) {
    return new Date(Number(m[2]), MONTHS[m[1]] + 1, 0, 23, 59, 59); // end of month
  }
  m = text.match(/^(\d{1,2})[./-](\d{4})$/);
  if (m) {
    const month = Number(m[1]) - 1;
    const year = Number(m[2]);
    if (month >= 0 && month <= 11) return new Date(year, month + 1, 0, 23, 59, 59);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseStock(raw) {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseRate(raw) {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function readExcelRows(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel not found: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: null });

  const rows = [];
  let lastName = '';
  raw.forEach((r, idx) => {
    let name = normalizeName(r['DRUG NAME']);
    if (!name) name = lastName;
    else lastName = name;
    if (!name) return;

    const batchNumber = normalizeBatchNumber(r.BATCH);
    const expiry = parseExpiry(r.EXPIRY);
    const qty = parseStock(r['CURRENT STOCK']);
    const sellingPrice = parseRate(r['PCS RATE']);
    const packing = r.PACKING != null ? String(r.PACKING).trim() : '';
    const categoryRaw = r.CATEGORY != null ? String(r.CATEGORY).trim() : '';
    const supplierName = r.SUPPLIER != null ? String(r.SUPPLIER).trim() : '';

    rows.push({
      excelRow: idx + 2,
      name,
      packing,
      categoryRaw,
      category: mapCategory(categoryRaw),
      batchNumber,
      expiry,
      qty,
      sellingPrice,
      supplierName,
    });
  });
  return rows;
}

async function ensureSupplier(cache, name, orgId, apply) {
  if (!name) return null;
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  let doc = await Supplier.findOne({
    organizationId: orgId,
    name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  });

  if (!doc && apply) {
    doc = await Supplier.create({
      name,
      phone: '0000000000',
      notes: 'Imported from CURRENT STOCK Excel',
      organizationId: orgId,
      isActive: true,
    });
  }

  const id = doc?._id || null;
  cache.set(key, id);
  return id;
}

function upsertBatchOnMedicine(medicine, row) {
  const warnings = [];
  if (!row.batchNumber) {
    if (row.qty > 0) {
      warnings.push(`row ${row.excelRow}: stock ${row.qty} but no batch — skipped batch`);
    }
    return warnings;
  }

  let expiry = row.expiry;
  if (!expiry) {
    if (row.qty > 0) {
      expiry = new Date(2099, 11, 31);
      warnings.push(`row ${row.excelRow}: missing expiry for batch ${row.batchNumber} — used 2099-12-31`);
    } else {
      warnings.push(`row ${row.excelRow}: batch ${row.batchNumber} has no expiry and qty 0 — skipped batch`);
      return warnings;
    }
  }

  const existing = (medicine.batches || []).find(
    (b) => !b.isDisposed
      && normalizeBatchNumber(b.batchNumber).toLowerCase() === row.batchNumber.toLowerCase(),
  );

  if (existing) {
    existing.quantity = row.qty;
    existing.expiryDate = expiry;
    existing.sellingPrice = row.sellingPrice;
    existing.mrp = row.sellingPrice;
    if (row.sellingPrice) existing.purchasePrice = existing.purchasePrice ?? row.sellingPrice;
  } else {
    medicine.batches.push({
      batchNumber: row.batchNumber,
      quantity: row.qty,
      expiryDate: expiry,
      sellingPrice: row.sellingPrice,
      mrp: row.sellingPrice,
      purchasePrice: row.sellingPrice,
      manufacturer: undefined,
      receivedDate: new Date(),
    });
  }
  return warnings;
}

async function importRows(rows, org, apply) {
  const stats = {
    medicinesCreate: 0,
    medicinesUpdate: 0,
    batchesUpsert: 0,
    suppliersCreate: 0,
    skipped: 0,
    warnings: [],
    withStock: 0,
    zeroStock: 0,
  };

  const supplierCache = new Map();
  // Preload existing suppliers for dry-run naming
  const existingSuppliers = await Supplier.find({ organizationId: org._id }).select('name');
  existingSuppliers.forEach((s) => supplierCache.set(s.name.toLowerCase(), s._id));

  const excelSupplierNames = [...new Set(rows.map((r) => r.supplierName).filter(Boolean))];
  for (const name of excelSupplierNames) {
    const before = supplierCache.has(name.toLowerCase());
    const id = await ensureSupplier(supplierCache, name, org._id, apply);
    if (!before && apply && id) stats.suppliersCreate += 1;
    if (!before && !apply) stats.suppliersCreate += 1; // would create
  }

  // Group by medicine name (case-insensitive)
  const byName = new Map();
  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  }

  for (const [, group] of byName) {
    const primary = group[0];
    const totalQty = group.reduce((s, r) => s + r.qty, 0);
    if (totalQty > 0) stats.withStock += 1;
    else stats.zeroStock += 1;

    const price = group.map((r) => r.sellingPrice).find((p) => p > 0) || primary.sellingPrice || 0;
    const packing = group.map((r) => r.packing).find(Boolean) || '';
    const category = group.map((r) => r.category).find(Boolean) || 'other';
    const supplierName = group.map((r) => r.supplierName).find(Boolean) || '';
    const supplierId = supplierName ? supplierCache.get(supplierName.toLowerCase()) : null;

    let medicine = await Medicine.findOne({
      organizationId: org._id,
      name: { $regex: `^${primary.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      isActive: { $ne: false },
    });

    const isNew = !medicine;
    if (isNew) {
      stats.medicinesCreate += 1;
      medicine = new Medicine({
        name: primary.name,
        category,
        sellingPrice: price,
        mrp: price,
        purchasePrice: price,
        unitOfMeasure: packing || 'Nos',
        description: packing ? `Packing: ${packing}` : undefined,
        supplier: supplierId || undefined,
        currentStock: 0,
        batches: [],
        organizationId: org._id,
        isActive: true,
        minimumStock: 10,
        reorderLevel: 20,
        gstPercent: 5,
      });
    } else {
      stats.medicinesUpdate += 1;
      medicine.sellingPrice = price;
      medicine.mrp = price;
      if (price) medicine.purchasePrice = medicine.purchasePrice ?? price;
      medicine.category = category || medicine.category;
      if (packing) {
        medicine.unitOfMeasure = packing;
        medicine.description = `Packing: ${packing}`;
      }
      if (supplierId) medicine.supplier = supplierId;
    }

    for (const row of group) {
      const beforeLen = (medicine.batches || []).length;
      const warns = upsertBatchOnMedicine(medicine, row);
      stats.warnings.push(...warns);
      const afterLen = (medicine.batches || []).length;
      if (row.batchNumber && (afterLen > beforeLen || (medicine.batches || []).some(
        (b) => normalizeBatchNumber(b.batchNumber).toLowerCase() === row.batchNumber.toLowerCase(),
      ))) {
        stats.batchesUpsert += 1;
      }
    }

    syncCurrentStock(medicine);
    if (apply) await medicine.save();
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

  const rows = readExcelRows(args.file);
  console.log(`Excel logical rows (after name fill-down): ${rows.length}`);
  console.log(`Rows with stock > 0: ${rows.filter((r) => r.qty > 0).length}`);
  console.log(`Rows with stock = 0: ${rows.filter((r) => r.qty === 0).length}`);

  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, { family: 4 });

  const org = await Organization.findOne({
    code: { $regex: `^${ORG_CODE}$`, $options: 'i' },
  });
  if (!org) {
    throw new Error(`Organization ${ORG_CODE} (Srinivasa hospital) not found`);
  }
  console.log(`Target: ${org.name} (${org.code})  _id=${org._id}`);

  const beforeCount = await Medicine.countDocuments({ organizationId: org._id });
  console.log(`Medicines before: ${beforeCount}`);

  const stats = await runWithOrganizationContext(
    {
      organizationId: org._id,
      organization: org,
      organizationCode: org.code,
      isSuperAdmin: true,
      skipOrganizationFilter: true,
    },
    () => importRows(rows, org, args.apply),
  );

  const afterCount = await Medicine.countDocuments({ organizationId: org._id });

  console.log('\nSummary');
  console.log(`  Unique medicines: create ${stats.medicinesCreate}, update ${stats.medicinesUpdate}`);
  console.log(`  Medicines with stock>0: ${stats.withStock}`);
  console.log(`  Medicines with stock=0: ${stats.zeroStock}`);
  console.log(`  Batch upserts: ${stats.batchesUpsert}`);
  console.log(`  Suppliers ${args.apply ? 'created' : 'would create'}: ${stats.suppliersCreate}`);
  console.log(`  Medicines after: ${afterCount}`);
  if (stats.warnings.length) {
    console.log(`\nWarnings (${stats.warnings.length}):`);
    stats.warnings.slice(0, 40).forEach((w) => console.log(`  - ${w}`));
    if (stats.warnings.length > 40) console.log(`  … ${stats.warnings.length - 40} more`);
  }

  if (!args.apply) {
    console.log('\nDry-run only. To write:');
    console.log('  node scripts/importSrinivasaStock.js --apply --confirm YES');
  } else {
    console.log('\nImport applied.');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
