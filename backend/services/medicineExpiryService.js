const mongoose = require('mongoose');
const Medicine = require('../models/Medicine');
const Supplier = require('../models/Supplier');

// ────────────────────────────────────────────────────────────────────────────
// Medicine Expiry Report — aggregation service
// New module for Inventory → Pharmacy → Medicine Expiry Report.
// Does NOT modify any existing pharmacy/inventory queries or behaviour.
// ────────────────────────────────────────────────────────────────────────────

const GROUP_CAP = 20000; // safety cap on rows pulled into memory for a grouped/export view
const DEFAULT_WINDOW_DAYS = 90; // sensible default when user applies no date/status filter

const SORT_MAP = {
  name_asc: { name: 1 },
  name_desc: { name: -1 },
  expiry_asc: { 'batches.expiryDate': 1 },
  expiry_desc: { 'batches.expiryDate': -1 },
  category: { category: 1, name: 1 },
  manufacturer: { effectiveManufacturer: 1, name: 1 },
  supplier: { supplier: 1, name: 1 },
  stock: { 'batches.quantity': -1 },
  mrp: { mrpValue: -1 },
  purchase_rate: { purchaseRate: -1 },
};

const isValidObjectId = (id) => id && mongoose.Types.ObjectId.isValid(id);

/**
 * Builds the shared aggregation pipeline (everything up to, but not including,
 * sort/paginate/group), based on the filters supported by the module.
 */
function buildBasePipeline(filters = {}) {
  const {
    fromDate, toDate, category, supplier, manufacturer, batch, search, status,
  } = filters;

  const matchStage = { isActive: true };
  if (category) matchStage.category = category;
  if (isValidObjectId(supplier)) matchStage.supplier = new mongoose.Types.ObjectId(supplier);

  const pipeline = [
    { $match: matchStage },
    { $unwind: '$batches' },
    { $match: { 'batches.isDisposed': { $ne: true } } },
  ];

  if (batch) {
    pipeline.push({ $match: { 'batches.batchNumber': { $regex: escapeRegex(batch), $options: 'i' } } });
  }

  pipeline.push({
    $addFields: {
      effectiveManufacturer: { $ifNull: ['$batches.manufacturer', '$manufacturer'] },
      purchaseRate: { $ifNull: ['$batches.purchasePrice', '$purchasePrice'] },
      mrpValue: { $ifNull: ['$batches.mrp', '$mrp'] },
      daysRemaining: {
        $ceil: {
          $divide: [{ $subtract: ['$batches.expiryDate', '$$NOW'] }, 1000 * 60 * 60 * 24],
        },
      },
    },
  });

  pipeline.push({
    $addFields: {
      stockValue: { $multiply: ['$batches.quantity', { $ifNull: ['$purchaseRate', 0] }] },
      rowStatus: {
        $switch: {
          branches: [
            { case: { $lt: ['$daysRemaining', 0] }, then: 'expired' },
            { case: { $eq: ['$batches.quantity', 0] }, then: 'zero_stock' },
            { case: { $lte: ['$daysRemaining', 30] }, then: 'near_expiry' },
            { case: { $lte: ['$daysRemaining', 60] }, then: 'expiring_soon' },
            { case: { $lte: ['$batches.quantity', '$minimumStock'] }, then: 'low_stock' },
          ],
          default: 'healthy',
        },
      },
    },
  });

  // Date-range filter (applies on top of, and independent from, status)
  const dateMatch = {};
  if (fromDate) dateMatch.$gte = new Date(fromDate);
  if (toDate) {
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    dateMatch.$lte = to;
  }
  if (Object.keys(dateMatch).length) {
    pipeline.push({ $match: { 'batches.expiryDate': dateMatch } });
  } else if (!status) {
    // No explicit date range and no status filter → default to a sane window
    // (expired items + everything expiring within DEFAULT_WINDOW_DAYS) so the
    // report stays fast and useful even on 100,000+ record catalogs.
    pipeline.push({ $match: { daysRemaining: { $lte: DEFAULT_WINDOW_DAYS } } });
  }

  if (status && status !== 'all') {
    pipeline.push({ $match: { rowStatus: status } });
  }

  if (manufacturer) {
    pipeline.push({ $match: { effectiveManufacturer: { $regex: escapeRegex(manufacturer), $options: 'i' } } });
  }

  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    pipeline.push({
      $match: {
        $or: [
          { name: rx },
          { genericName: rx },
          { barcode: rx },
          { 'batches.batchNumber': rx },
        ],
      },
    });
  }

  return pipeline;
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const rowProjection = {
  $project: {
    _id: 0,
    medicineId: '$_id',
    medicineName: '$name',
    genericName: 1,
    category: 1,
    batchNumber: '$batches.batchNumber',
    manufacturer: '$effectiveManufacturer',
    supplier: 1,
    expiryDate: '$batches.expiryDate',
    daysRemaining: 1,
    purchaseRate: 1,
    mrp: '$mrpValue',
    currentStock: '$batches.quantity',
    unit: '$unitOfMeasure',
    stockValue: 1,
    status: '$rowStatus',
  },
};

/**
 * Paginated flat list (used when no grouping is requested). True server-side
 * pagination — safe for 100,000+ medicine records.
 */
exports.getFlatReport = async (filters) => {
  const pipeline = buildBasePipeline(filters);
  const sortStage = SORT_MAP[filters.sort] || SORT_MAP.expiry_asc;
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(parseInt(filters.limit, 10) || 25, 500);
  const skip = (page - 1) * limit;

  const [result] = await Medicine.aggregate([
    ...pipeline,
    {
      $facet: {
        data: [{ $sort: sortStage }, { $skip: skip }, { $limit: limit }, rowProjection],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]);

  const total = result?.totalCount?.[0]?.count || 0;
  const rows = await attachSupplierNames(result?.data || []);

  return {
    rows,
    page,
    limit,
    total,
    pages: Math.max(Math.ceil(total / limit), 1),
  };
};

/**
 * Full grouped dataset (Category / Supplier / Manufacturer). Medicines are
 * ALWAYS alphabetically sorted within each group. Used for the grouped grid
 * view as well as PDF/Excel export, so category & grand totals are always
 * computed over the complete filtered set (not just one page).
 */
exports.getGroupedReport = async (filters) => {
  const groupBy = filters.groupBy && filters.groupBy !== 'none' ? filters.groupBy : 'category';
  const groupFieldMap = {
    category: '$category',
    supplier: '$supplier',
    manufacturer: '$effectiveManufacturer',
  };
  const groupField = groupFieldMap[groupBy] || groupFieldMap.category;

  const pipeline = buildBasePipeline(filters);

  const rows = await Medicine.aggregate([
    ...pipeline,
    { $sort: { name: 1 } }, // medicines ALWAYS alphabetical within a group
    { $limit: GROUP_CAP },
    {
      $project: {
        groupKey: groupField,
        medicineId: '$_id',
        medicineName: '$name',
        genericName: 1,
        category: 1,
        batchNumber: '$batches.batchNumber',
        manufacturer: '$effectiveManufacturer',
        supplier: 1,
        expiryDate: '$batches.expiryDate',
        daysRemaining: 1,
        purchaseRate: 1,
        mrp: '$mrpValue',
        currentStock: '$batches.quantity',
        unit: '$unitOfMeasure',
        stockValue: 1,
        status: '$rowStatus',
      },
    },
  ]);

  const withSupplierNames = await attachSupplierNames(rows);

  const groupMap = new Map();
  withSupplierNames.forEach((row) => {
    const key = row.groupKey === undefined || row.groupKey === null || row.groupKey === ''
      ? 'Uncategorized'
      : (groupBy === 'supplier' ? (row.supplierName || 'Unassigned') : row.groupKey);
    if (!groupMap.has(key)) {
      groupMap.set(key, { groupName: key, medicines: [], totalMedicines: 0, totalStock: 0, totalStockValue: 0 });
    }
    const g = groupMap.get(key);
    const { groupKey, ...medicine } = row;
    g.medicines.push(medicine);
    g.totalMedicines += 1;
    g.totalStock += medicine.currentStock || 0;
    g.totalStockValue += medicine.stockValue || 0;
  });

  const groups = Array.from(groupMap.values()).sort((a, b) => String(a.groupName).localeCompare(String(b.groupName)));

  return { groupBy, groups, truncated: rows.length >= GROUP_CAP };
};

/**
 * Summary dashboard cards — always computed over the FULL filtered set
 * (never just the current page).
 */
exports.getSummary = async (filters) => {
  const pipeline = buildBasePipeline(filters);
  const [result] = await Medicine.aggregate([
    ...pipeline,
    {
      $group: {
        _id: null,
        totalBatches: { $sum: 1 },
        medicineIds: { $addToSet: '$_id' },
        totalStock: { $sum: '$batches.quantity' },
        stockValue: { $sum: '$stockValue' },
        expiredCount: { $sum: { $cond: [{ $eq: ['$rowStatus', 'expired'] }, 1, 0] } },
        nearExpiryCount: { $sum: { $cond: [{ $eq: ['$rowStatus', 'near_expiry'] }, 1, 0] } },
        expiringSoonCount: { $sum: { $cond: [{ $eq: ['$rowStatus', 'expiring_soon'] }, 1, 0] } },
        expectedLoss: { $sum: { $cond: [{ $eq: ['$rowStatus', 'expired'] }, '$stockValue', 0] } },
      },
    },
  ]);

  if (!result) {
    return {
      totalMedicines: 0, totalBatches: 0, expiredMedicines: 0, nearExpiryMedicines: 0,
      expiringSoon: 0, currentStockValue: 0, expectedLoss: 0,
    };
  }

  return {
    totalMedicines: result.medicineIds.length,
    totalBatches: result.totalBatches,
    expiredMedicines: result.expiredCount,
    nearExpiryMedicines: result.nearExpiryCount,
    expiringSoon: result.expiringSoonCount,
    currentStockValue: result.stockValue,
    expectedLoss: result.expectedLoss,
  };
};

async function attachSupplierNames(rows) {
  const ids = [...new Set(rows.map((r) => r.supplier).filter(isValidObjectId).map(String))];
  if (!ids.length) return rows.map((r) => ({ ...r, supplierName: null }));
  const suppliers = await Supplier.find({ _id: { $in: ids } }).select('name').lean();
  const map = Object.fromEntries(suppliers.map((s) => [String(s._id), s.name]));
  return rows.map((r) => ({ ...r, supplierName: r.supplier ? map[String(r.supplier)] || null : null }));
}

/**
 * Filter dropdown metadata — distinct categories/manufacturers present in
 * the current inventory, plus the active supplier list.
 */
exports.getFilterMeta = async () => {
  const [categories, manufacturers, batchManufacturers, suppliers] = await Promise.all([
    Medicine.distinct('category', { isActive: true }),
    Medicine.distinct('manufacturer', { isActive: true, manufacturer: { $nin: [null, ''] } }),
    Medicine.distinct('batches.manufacturer', { isActive: true, 'batches.manufacturer': { $nin: [null, ''] } }),
    Supplier.find({ isActive: true }).select('name').sort('name').lean(),
  ]);

  const manufacturerSet = new Set([...manufacturers, ...batchManufacturers].filter(Boolean));

  return {
    categories: categories.filter(Boolean).sort(),
    manufacturers: Array.from(manufacturerSet).sort(),
    suppliers: suppliers.map((s) => ({ _id: s._id, name: s.name })),
  };
};

exports.SORT_MAP = SORT_MAP;