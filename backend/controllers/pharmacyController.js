const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Medicine = require('../models/Medicine');
const Prescription = require('../models/Prescription');
const DirectSale = require('../models/DirectSale');
const Patient = require('../models/Patient');
const { generatePrescriptionPDF } = require('../utils/pdfGenerator');
const {
  syncCurrentStock,
  deductFromUsableBatches,
  logStockMovement,
  validateDispensable,
  getExpiredBatches,
  mapUsableBatchesWithPrices,
  upsertBatchStock,
  normalizeBatchNumber,
  findActiveBatch,
} = require('../utils/pharmacyStockHelper');
const inventoryService = require('../services/pharmacyInventoryService');
const { istToday } = require('../utils/todayRevenue');
const { exportExcel, exportPdf } = require('../utils/pharmacyReportExporter');
const { logActivity } = require('../utils/activityLogger');

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.getMedicines = asyncHandler(async (req, res) => {
  res.status(200).json(res.advancedResults);
});

exports.getMedicine = asyncHandler(async (req, res, next) => {
  const medicine = await Medicine.findById(req.params.id).populate('supplier', 'name phone');
  if (!medicine) return next(new ErrorResponse('Medicine not found', 404));
  res.status(200).json({ success: true, data: medicine });
});

exports.createMedicine = asyncHandler(async (req, res, next) => {
  const data = { ...req.body };
  if (!data.barcode || data.barcode.trim() === '') delete data.barcode;
  else data.barcode = data.barcode.trim();

  const name = String(data.name || '').trim();
  if (!name) return next(new ErrorResponse('Drug name is required', 400));
  data.name = name;

  // Soft-block duplicate SKU — guide staff to Add Batch instead of creating again
  const existingByName = await Medicine.findOne({
    name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
    isActive: { $ne: false },
  }).select('_id name genericName currentStock category manufacturer sellingPrice mrp purchasePrice batches');

  if (existingByName) {
    return res.status(409).json({
      success: false,
      code: 'MEDICINE_EXISTS',
      message: `"${existingByName.name}" already exists. Add a new batch under it — do not create the medicine again.`,
      data: existingByName,
    });
  }

  if (data.barcode) {
    const existingBarcode = await Medicine.findOne({ barcode: data.barcode }).select('_id name barcode');
    if (existingBarcode) {
      return res.status(409).json({
        success: false,
        code: 'BARCODE_EXISTS',
        message: `Barcode already used by "${existingBarcode.name}". Open that medicine and add a batch.`,
        data: existingBarcode,
      });
    }
  }

  // Normalize optional initial batch if client sent batches[]
  if (Array.isArray(data.batches) && data.batches.length) {
    data.batches = data.batches.map((b) => ({
      ...b,
      batchNumber: normalizeBatchNumber(b.batchNumber),
    })).filter((b) => b.batchNumber);
  }

  const medicine = await Medicine.create(data);
  syncCurrentStock(medicine);
  await medicine.save();

  const initialQty = Number(medicine.currentStock || 0);
  if (initialQty > 0) {
    const firstBatch = (medicine.batches || [])[0];
    await logStockMovement({
      medicine,
      batchNumber: firstBatch?.batchNumber,
      type: 'stock_in',
      quantityBefore: 0,
      quantityAfter: medicine.currentStock,
      quantityChanged: initialQty,
      unitPrice: firstBatch?.purchasePrice || medicine.purchasePrice,
      supplier: medicine.supplier,
      userId: req.user._id,
      remarks: 'Initial stock on new medicine',
    });
  }

  await logActivity(req, {
    action: 'Medicine Created',
    module: 'Pharmacy',
    description: `${req.user?.name || 'User'} added medicine "${medicine.name}"`,
    relatedId: medicine._id,
    relatedModel: 'Medicine',
    metadata: { name: medicine.name, category: medicine.category },
  });
  res.status(201).json({ success: true, data: medicine });
});

exports.updateMedicine = asyncHandler(async (req, res, next) => {
  const ChangeRequest = require('../models/ChangeRequest');
  const { normalizeRole } = require('../utils/roles');

  const pending = await ChangeRequest.findOne({
    medicine: req.params.id,
    category: 'medicine_edit',
    status: 'pending',
  }).select('requestNumber');

  // While a change request is pending, direct Edit is locked for everyone
  // except Super Admin / Admin (they review & can still correct master data).
  const role = normalizeRole(req.user?.role);
  if (pending && role !== 'Super Admin' && role !== 'Admin') {
    return next(new ErrorResponse(
      `Edit locked — pending change request ${pending.requestNumber}. Wait for Super Admin approval.`,
      423,
    ));
  }

  const data = { ...req.body };
  if (!data.barcode || data.barcode.trim() === '') delete data.barcode;
  const medicine = await Medicine.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
  if (!medicine) return next(new ErrorResponse('Medicine not found', 404));
  await logActivity(req, {
    action: 'Medicine Updated',
    module: 'Pharmacy',
    description: `${req.user?.name || 'User'} updated medicine "${medicine.name}"`,
    relatedId: medicine._id,
    relatedModel: 'Medicine',
    metadata: pending ? { bypassedPendingRequest: pending.requestNumber } : undefined,
  });
  res.status(200).json({ success: true, data: medicine, editLockedBy: pending?.requestNumber || null });
});

exports.deleteMedicine = asyncHandler(async (req, res, next) => {
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) return next(new ErrorResponse('Medicine not found', 404));
  const name = medicine.name;
  await medicine.deleteOne();
  await logActivity(req, {
    action: 'Medicine Deleted',
    module: 'Pharmacy',
    description: `${req.user?.name || 'User'} deleted medicine "${name}"`,
    relatedId: req.params.id,
    relatedModel: 'Medicine',
  });
  res.status(200).json({ success: true, data: {} });
});

exports.addStock = asyncHandler(async (req, res, next) => {
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) return next(new ErrorResponse('Medicine not found', 404));

  const quantity = Number(req.body.quantity || 0);
  const batchNumber = normalizeBatchNumber(req.body.batchNumber);
  if (!batchNumber) return next(new ErrorResponse('Batch number is required', 400));
  if (quantity <= 0) return next(new ErrorResponse('Stock quantity must be greater than zero', 400));

  const qtyBefore = medicine.currentStock;
  let result;
  try {
    result = upsertBatchStock(medicine, {
      batchNumber,
      quantity,
      expiryDate: req.body.expiryDate,
      purchasePrice: req.body.purchasePrice,
      sellingPrice: req.body.sellingPrice,
      mrp: req.body.mrp,
      manufacturer: req.body.manufacturer,
      supplierInvoice: req.body.supplierInvoice,
      receivedDate: req.body.receivedDate,
      remarks: req.body.remarks,
    });
  } catch (err) {
    return next(new ErrorResponse(err.message || 'Could not add batch', err.statusCode || 400));
  }

  syncCurrentStock(medicine);
  medicine.markModified('batches');
  await medicine.save();

  await logStockMovement({
    medicine,
    batchNumber: result.batch.batchNumber,
    type: 'stock_in',
    quantityBefore: qtyBefore,
    quantityAfter: medicine.currentStock,
    quantityChanged: quantity,
    unitPrice: req.body.purchasePrice || medicine.purchasePrice,
    supplier: req.body.supplier || medicine.supplier,
    userId: req.user._id,
    remarks: result.merged
      ? (req.body.remarks || `Qty added to existing batch ${result.batch.batchNumber}`)
      : (req.body.remarks || 'Stock added'),
  });

  await logActivity(req, {
    action: result.merged ? 'Batch Stock Increased' : 'Batch Added',
    module: 'Pharmacy',
    description: `${req.user?.name || 'User'} ${result.merged ? 'increased' : 'added'} batch ${result.batch.batchNumber} on "${medicine.name}" (+${quantity})`,
    relatedId: medicine._id,
    relatedModel: 'Medicine',
    metadata: { batchNumber: result.batch.batchNumber, quantity, stockAfter: medicine.currentStock },
  });

  try {
    const { notifyPharmacyStockRisk } = require('../utils/notify');
    await notifyPharmacyStockRisk(req, medicine, {
      batchNumber: result.batch.batchNumber,
      expiryDate: result.batch.expiryDate || req.body.expiryDate,
    });
  } catch (_) { /* ignore */ }

  res.status(200).json({
    success: true,
    data: medicine,
    merged: result.merged,
    message: result.merged
      ? `Batch ${result.batch.batchNumber} already on this medicine — quantity increased (no duplicate created)`
      : `Batch ${result.batch.batchNumber} added under ${medicine.name}`,
  });
});

// ─── NEW: REDUCE OR ADJUST STOCK DIRECTLY ───────────────────────────────────
exports.adjustStock = asyncHandler(async (req, res, next) => {
  const { quantity, type, remarks } = req.body;
  
  // Validate inputs
  if (quantity === undefined || quantity === null) {
    return next(new ErrorResponse('Quantity is required', 400));
  }
  
  if (Number(quantity) === 0) {
    return next(new ErrorResponse('Quantity must not be zero', 400));
  }

  if (!['reduce', 'increase'].includes(type)) {
    return next(new ErrorResponse('Type must be "reduce" or "increase"', 400));
  }

  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) return next(new ErrorResponse('Medicine not found', 404));

  const qtyNumber = Number(quantity);
  const qtyBefore = medicine.currentStock;

  if (type === 'reduce') {
    if (qtyNumber < 0) {
      return next(new ErrorResponse('For reduce operation, quantity must be positive', 400));
    }

    // Always adjust a specific batch when 2+ batches exist (hospital-safe)
    const batchKey = normalizeBatchNumber(req.body.batchNumber);
    const activeBatches = (medicine.batches || []).filter((b) => !b.isDisposed && Number(b.quantity) > 0);

    if (activeBatches.length > 1 && !batchKey) {
      return next(new ErrorResponse(
        'This medicine has multiple batches. Select which batch to reduce.',
        400,
      ));
    }

    let reducedBatchNo = batchKey;
    if (batchKey) {
      const batch = findActiveBatch(medicine, batchKey);
      if (!batch) {
        return next(new ErrorResponse(`Batch "${batchKey}" not found on this medicine`, 404));
      }
      if (Number(batch.quantity) < qtyNumber) {
        return next(new ErrorResponse(
          `Batch ${batch.batchNumber} has only ${batch.quantity} units (requested ${qtyNumber})`,
          400,
        ));
      }
      batch.quantity -= qtyNumber;
      reducedBatchNo = batch.batchNumber;
    } else {
      // Single / no named batch — FEFO across usable stock
      if (medicine.currentStock < qtyNumber) {
        return next(new ErrorResponse(
          `Insufficient stock! Available: ${medicine.currentStock}, Requested: ${qtyNumber}`,
          400,
        ));
      }
      const { primaryBatch, unallocated } = deductFromUsableBatches(medicine, qtyNumber);
      if (unallocated > 0) {
        return next(new ErrorResponse(
          `Only ${qtyNumber - unallocated} units of non-expired stock available`,
          400,
        ));
      }
      reducedBatchNo = primaryBatch;
    }

    syncCurrentStock(medicine);
    medicine.markModified('batches');
    await medicine.save();

    await logStockMovement({
      medicine,
      batchNumber: reducedBatchNo,
      type: 'stock_adjustment_reduce',
      quantityBefore: qtyBefore,
      quantityAfter: medicine.currentStock,
      quantityChanged: -qtyNumber,
      unitPrice: medicine.sellingPrice,
      userId: req.user._id,
      remarks: remarks || `Stock reduced by ${qtyNumber} from batch ${reducedBatchNo || 'FEFO'}`,
    });

    await logActivity(req, {
      action: 'Stock Reduced',
      module: 'Pharmacy',
      description: `${req.user?.name || 'User'} reduced ${qtyNumber} of "${medicine.name}" (batch ${reducedBatchNo || 'FEFO'})`,
      relatedId: medicine._id,
      relatedModel: 'Medicine',
      metadata: { type: 'reduce', quantity: qtyNumber, batchNumber: reducedBatchNo, stockAfter: medicine.currentStock },
    });

    try {
      const { notifyPharmacyStockRisk } = require('../utils/notify');
      await notifyPharmacyStockRisk(req, medicine);
    } catch (_) { /* ignore */ }

    res.status(200).json({
      success: true,
      data: medicine,
      message: `Reduced ${qtyNumber} from batch ${reducedBatchNo || 'stock'}`,
    });
  } else {
    // For increase: merge into existing batch or create new one (same as Add Batch)
    const { batchNumber, expiryDate, purchasePrice, sellingPrice, mrp } = req.body;
    let result;
    try {
      result = upsertBatchStock(medicine, {
        batchNumber,
        quantity: qtyNumber,
        expiryDate,
        purchasePrice,
        sellingPrice,
        mrp,
        remarks: remarks || 'Stock increased',
      });
    } catch (err) {
      return next(new ErrorResponse(err.message || 'Could not increase stock', err.statusCode || 400));
    }

    syncCurrentStock(medicine);
    medicine.markModified('batches');
    await medicine.save();

    await logStockMovement({
      medicine,
      batchNumber: result.batch.batchNumber,
      type: 'stock_adjustment_increase',
      quantityBefore: qtyBefore,
      quantityAfter: medicine.currentStock,
      quantityChanged: qtyNumber,
      unitPrice: purchasePrice || medicine.purchasePrice,
      userId: req.user._id,
      remarks: remarks || `Stock increased by ${qtyNumber} units`,
    });

    await logActivity(req, {
      action: 'Stock Increased',
      module: 'Pharmacy',
      description: `${req.user?.name || 'User'} increased ${qtyNumber} of "${medicine.name}" (batch ${result.batch.batchNumber})`,
      relatedId: medicine._id,
      relatedModel: 'Medicine',
      metadata: { type: 'increase', quantity: qtyNumber, batchNumber: result.batch.batchNumber, stockAfter: medicine.currentStock },
    });

    res.status(200).json({
      success: true,
      data: medicine,
      merged: result.merged,
      message: result.merged
        ? `Batch ${result.batch.batchNumber} qty increased by ${qtyNumber}`
        : `Stock increased by ${qtyNumber} units (new batch ${result.batch.batchNumber})`,
    });
  }
});
// ────────────────────────────────────────────────────────────────────────────

exports.searchMedicines = asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(200).json({ success: true, data: [] });
  }

  const searchQuery = q.trim().substring(0, 100);
  const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const medicines = await Medicine.find({
    $or: [
      { name: { $regex: escaped, $options: 'i' } },
      { genericName: { $regex: escaped, $options: 'i' } },
      { barcode: searchQuery },
    ],
    isActive: true,
    currentStock: { $gt: 0 },
  })
    .sort({ name: 1 })
    .limit(25)
    .select('name genericName category currentStock sellingPrice gstPercent unitOfMeasure mrp hsnCode batches');

  const data = medicines
    .map((m) => {
      const doc = m.toObject();
      syncCurrentStock(m);
      doc.currentStock = m.currentStock;
      doc.hasExpiredStock = getExpiredBatches(m).length > 0;
      doc.usableBatches = mapUsableBatchesWithPrices(m);
      return doc;
    })
    .filter((m) => m.currentStock > 0)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  res.status(200).json({ success: true, count: data.length, data });
});

exports.getLowStockMedicines = asyncHandler(async (req, res) => {
  const data = await inventoryService.getLowStockList();
  res.status(200).json({ success: true, count: data.length, data });
});

exports.getOutOfStockMedicines = asyncHandler(async (req, res) => {
  const data = await inventoryService.getOutOfStockList();
  res.status(200).json({ success: true, count: data.length, data });
});

exports.getExpiringMedicines = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const data = await inventoryService.getExpiringList(days);
  res.status(200).json({ success: true, count: data.length, data });
});

exports.getExpiredMedicines = asyncHandler(async (req, res) => {
  const data = await inventoryService.getExpiredList();
  res.status(200).json({ success: true, count: data.length, data });
});

exports.getInventoryActivity = asyncHandler(async (req, res) => {
  const data = await inventoryService.getStockMovements({ limit: parseInt(req.query.limit) || 30 });
  res.status(200).json({ success: true, data });
});

exports.getPharmacyDashboard = asyncHandler(async (req, res) => {
  const data = await inventoryService.getDashboardData();
  res.status(200).json({ success: true, data });
});

exports.disposeExpiredBatch = asyncHandler(async (req, res, next) => {
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) return next(new ErrorResponse('Medicine not found', 404));

  const batch = medicine.batches.id(req.params.batchId);
  if (!batch) return next(new ErrorResponse('Batch not found', 404));
  if (batch.isDisposed) return next(new ErrorResponse('Batch already disposed', 400));

  const qtyBefore = medicine.currentStock;
  const disposeQty = batch.quantity;
  batch.isDisposed = true;
  batch.disposedAt = new Date();
  batch.disposedBy = req.user._id;
  batch.quantity = 0;
  syncCurrentStock(medicine);
  medicine.markModified('batches');
  await medicine.save();

  await logStockMovement({
    medicine,
    batchNumber: batch.batchNumber,
    type: 'dispose',
    quantityBefore: qtyBefore,
    quantityAfter: medicine.currentStock,
    quantityChanged: -disposeQty,
    unitPrice: batch.purchasePrice || medicine.purchasePrice,
    userId: req.user._id,
    remarks: req.body.remarks || 'Expired medicine disposed',
  });

  res.status(200).json({ success: true, data: medicine, message: 'Batch marked as disposed' });
});

/**
 * Edit a single batch in place: batch no, expiry, qty, sell/MRP/purchase, etc.
 * PUT /pharmacy/:id/batches/:batchId
 */
exports.updateBatch = asyncHandler(async (req, res, next) => {
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) return next(new ErrorResponse('Medicine not found', 404));

  const batch = medicine.batches.id(req.params.batchId);
  if (!batch) return next(new ErrorResponse('Batch not found', 404));
  if (batch.isDisposed) {
    return next(new ErrorResponse('Cannot edit a disposed batch', 400));
  }

  const body = req.body || {};
  const qtyBefore = medicine.currentStock;
  const oldBatchNo = batch.batchNumber;
  const oldQty = Number(batch.quantity) || 0;
  const changes = [];

  if (body.batchNumber != null && String(body.batchNumber).trim() !== '') {
    const nextNo = normalizeBatchNumber(body.batchNumber);
    if (!nextNo) return next(new ErrorResponse('Batch number is required', 400));
    const clash = (medicine.batches || []).find(
      (b) => !b.isDisposed
        && String(b._id) !== String(batch._id)
        && normalizeBatchNumber(b.batchNumber).toLowerCase() === nextNo.toLowerCase(),
    );
    if (clash) {
      return next(new ErrorResponse(
        `Batch "${nextNo}" already exists on this medicine`,
        400,
      ));
    }
    if (nextNo !== batch.batchNumber) {
      changes.push(`batch ${oldBatchNo} → ${nextNo}`);
      batch.batchNumber = nextNo;
    }
  }

  if (body.expiryDate != null && body.expiryDate !== '') {
    const expiry = new Date(body.expiryDate);
    if (Number.isNaN(expiry.getTime())) {
      return next(new ErrorResponse('Invalid expiry date', 400));
    }
    const prev = batch.expiryDate ? new Date(batch.expiryDate).toISOString().slice(0, 10) : '';
    const next = expiry.toISOString().slice(0, 10);
    if (prev !== next) {
      changes.push(`expiry ${prev || '—'} → ${next}`);
      batch.expiryDate = expiry;
    }
  }

  if (body.quantity != null && body.quantity !== '') {
    const qty = Number(body.quantity);
    if (!Number.isFinite(qty) || qty < 0) {
      return next(new ErrorResponse('Quantity must be zero or greater', 400));
    }
    if (qty !== oldQty) {
      changes.push(`qty ${oldQty} → ${qty}`);
      batch.quantity = qty;
    }
  }

  const priceFields = [
    ['sellingPrice', 'sell'],
    ['mrp', 'MRP'],
    ['purchasePrice', 'purchase'],
  ];
  for (const [field, label] of priceFields) {
    if (body[field] != null && body[field] !== '') {
      const val = Number(body[field]);
      if (!Number.isFinite(val) || val < 0) {
        return next(new ErrorResponse(`${label} price must be zero or greater`, 400));
      }
      if (Number(batch[field]) !== val) {
        changes.push(`${label} ${batch[field] ?? '—'} → ${val}`);
        batch[field] = val;
      }
    } else if (body[field] === null || body[field] === '') {
      // allow clearing optional prices by sending empty string
      if (body[field] === '' && batch[field] != null) {
        changes.push(`${label} cleared`);
        batch[field] = null;
      }
    }
  }

  if (body.manufacturer != null) {
    const next = String(body.manufacturer).trim();
    if (next !== (batch.manufacturer || '')) {
      changes.push('manufacturer updated');
      batch.manufacturer = next || undefined;
    }
  }

  if (body.supplierInvoice != null) {
    const next = String(body.supplierInvoice).trim();
    if (next !== (batch.supplierInvoice || '')) {
      changes.push('invoice updated');
      batch.supplierInvoice = next || undefined;
    }
  }

  if (body.receivedDate != null && body.receivedDate !== '') {
    const rd = new Date(body.receivedDate);
    if (Number.isNaN(rd.getTime())) {
      return next(new ErrorResponse('Invalid received date', 400));
    }
    batch.receivedDate = rd;
    changes.push('received date updated');
  }

  if (!changes.length) {
    return res.status(200).json({
      success: true,
      data: medicine,
      message: 'No changes to save',
    });
  }

  syncCurrentStock(medicine);
  medicine.markModified('batches');
  await medicine.save();

  const qtyDelta = medicine.currentStock - qtyBefore;
  if (qtyDelta !== 0) {
    await logStockMovement({
      medicine,
      batchNumber: batch.batchNumber,
      type: 'adjustment',
      quantityBefore: qtyBefore,
      quantityAfter: medicine.currentStock,
      quantityChanged: qtyDelta,
      unitPrice: batch.purchasePrice || medicine.purchasePrice,
      userId: req.user._id,
      remarks: body.remarks || `Batch edited: ${changes.join('; ')}`,
    });
  }

  await logActivity(req, {
    action: 'Batch Updated',
    module: 'Pharmacy',
    description: `${req.user?.name || 'User'} edited batch ${batch.batchNumber} on "${medicine.name}" (${changes.join('; ')})`,
    relatedId: medicine._id,
    relatedModel: 'Medicine',
    metadata: {
      batchId: batch._id,
      batchNumber: batch.batchNumber,
      changes,
      stockAfter: medicine.currentStock,
    },
  });

  try {
    const { notifyPharmacyStockRisk } = require('../utils/notify');
    await notifyPharmacyStockRisk(req, medicine, {
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
    });
  } catch (_) { /* ignore */ }

  res.status(200).json({
    success: true,
    data: medicine,
    message: `Batch ${batch.batchNumber} updated`,
  });
});

exports.sendInventoryNotification = asyncHandler(async (req, res) => {
  const { type, medicineName, message, roles = ['Pharmacist', 'Admin'] } = req.body;
  const { notifyRoles } = require('../utils/notify');
  const notifications = await notifyRoles(req, {
    roles: [...new Set([...roles, 'Super Admin'])],
    title: `Pharmacy Alert: ${type || 'Inventory'}`,
    message: message || `${medicineName} requires attention`,
    type: 'pharmacy',
    link: '/pharmacy?tab=inventory',
    relatedModel: 'Medicine',
  });
  res.status(200).json({ success: true, count: notifications.length, message: 'Notifications sent' });
});

exports.exportReport = asyncHandler(async (req, res, next) => {
  const reportData = await inventoryService.getReportData(req.params.type, {
    date: req.query.date,
  });
  if (!reportData) return next(new ErrorResponse('Invalid report type', 400));

  const format = (req.query.format || 'pdf').toLowerCase();
  if (format === 'json') return res.status(200).json({ success: true, ...reportData });
  if (format === 'excel' || format === 'xlsx') return exportExcel(req.params.type, reportData, res);
  return exportPdf(req.params.type, reportData, res);
});

exports.dispensePrescription = asyncHandler(async (req, res, next) => {
  const prescription = await Prescription.findById(req.params.id).populate('medicines.medicine');
  if (!prescription) return next(new ErrorResponse('Prescription not found', 404));

  let dispensedCount = 0;
  const errors = [];

  for (const item of prescription.medicines) {
    if (item.dispensed) {
      dispensedCount += 1;
      continue;
    }

    const quantity = Number(item.quantity || 0);
    if (!quantity) {
      errors.push(`Missing quantity for ${item.medicineName || 'medicine'}`);
      continue;
    }

    if (item.medicine) {
      const medicine = await Medicine.findById(item.medicine._id);
      if (!medicine) {
        errors.push(`Medicine not found: ${item.medicineName}`);
        continue;
      }

      const check = validateDispensable(medicine, quantity);
      if (!check.ok) {
        errors.push(check.reason);
        continue;
      }

      const qtyBefore = medicine.currentStock;
      const { primaryBatch, unallocated } = deductFromUsableBatches(medicine, quantity);
      if (unallocated > 0) {
        errors.push(`${medicine.name}: insufficient non-expired stock`);
        continue;
      }

      syncCurrentStock(medicine);
      medicine.markModified('batches');
      await medicine.save();

      await logStockMovement({
        medicine,
        batchNumber: primaryBatch,
        type: 'dispense',
        quantityBefore: qtyBefore,
        quantityAfter: medicine.currentStock,
        quantityChanged: -quantity,
        unitPrice: medicine.sellingPrice,
        referenceId: prescription._id,
        referenceModel: 'Prescription',
        userId: req.user._id,
        remarks: `Prescription dispensed`,
      });
    }

    item.dispensed = true;
    dispensedCount += 1;
  }

  if (dispensedCount === prescription.medicines.length) prescription.status = 'dispensed';
  else if (dispensedCount > 0) prescription.status = 'partially_dispensed';
  else return next(new ErrorResponse(`Prescription could not be dispensed. ${errors.join('; ')}`, 400));

  prescription.dispensedBy = req.user._id;
  prescription.dispensedAt = new Date();
  await prescription.save();

  res.status(200).json({
    success: true,
    message: prescription.status === 'partially_dispensed' ? `Partially dispensed. ${errors.join('; ')}` : 'Prescription dispensed',
    data: prescription,
  });
});

exports.printPrescription = asyncHandler(async (req, res, next) => {
  const prescription = await Prescription.findById(req.params.id)
    .populate('patient', 'patientId name age gender phone address rchId')
    .populate('doctor', 'name specialization')
    .populate('medicines.medicine', 'name')
    .populate({
      path: 'opRegistration',
      select: 'tokenNumber tokenDate chiefComplaint vitals diagnosis examinationFindings investigationsAdvised department',
      populate: { path: 'department', select: 'name' },
    });
  if (!prescription) return next(new ErrorResponse('Prescription not found', 404));
  await generatePrescriptionPDF(prescription, res);
});

// ─── Direct Sale ───────────────────────────────────────────────

exports.createDirectSale = asyncHandler(async (req, res, next) => {
  const { items, saleType, customerName, customerPhone, patientId, paymentMethod, paidAmount, totalDiscount, notes } = req.body;

  if (!items || !items.length) return next(new ErrorResponse('At least one item is required', 400));

  let subtotal = 0;
  let totalGst = 0;
  const processedItems = [];

  for (const item of items) {
    const medicine = await Medicine.findById(item.medicine);
    if (!medicine) return next(new ErrorResponse(`Medicine not found: ${item.medicineName || item.medicine}`, 404));

    const check = validateDispensable(medicine, item.quantity);
    if (!check.ok) return next(new ErrorResponse(`${medicine.name}: ${check.reason}`, 400));

    const qtyBefore = medicine.currentStock;
    const { primaryBatch, unallocated } = deductFromUsableBatches(medicine, item.quantity);
    if (unallocated > 0) return next(new ErrorResponse(`${medicine.name}: insufficient stock`, 400));

    syncCurrentStock(medicine);
    medicine.markModified('batches');
    await medicine.save();

    const unitPrice = item.unitPrice || medicine.sellingPrice;
    const gstPercent = item.gstPercent !== undefined ? item.gstPercent : medicine.gstPercent;
    const lineSubtotal = unitPrice * item.quantity;
    const discAmt = (lineSubtotal * (item.discountPercent || 0)) / 100;
    const taxableAmt = lineSubtotal - discAmt;
    const gstAmt = (taxableAmt * gstPercent) / 100;
    const lineTotal = taxableAmt + gstAmt;

    subtotal += lineSubtotal;
    totalGst += gstAmt;

    processedItems.push({
      medicine: medicine._id,
      medicineName: medicine.name,
      batchNumber: primaryBatch,
      quantity: item.quantity,
      unitPrice,
      mrp: medicine.mrp,
      gstPercent,
      gstAmount: gstAmt,
      discountPercent: item.discountPercent || 0,
      discountAmount: discAmt,
      totalAmount: lineTotal,
    });

    await logStockMovement({
      medicine,
      batchNumber: primaryBatch,
      type: 'sale',
      quantityBefore: qtyBefore,
      quantityAfter: medicine.currentStock,
      quantityChanged: -item.quantity,
      unitPrice,
      userId: req.user._id,
      remarks: `Direct sale${customerName ? ` to ${customerName}` : ''}`,
    });
  }

  const discountTotal = totalDiscount || 0;
  const grandTotal = subtotal + totalGst - discountTotal;
  const paid = paidAmount !== undefined ? Number(paidAmount) : grandTotal;

  const saleData = {
    saleType: saleType || 'walkin',
    items: processedItems,
    subtotal,
    totalGst,
    totalDiscount: discountTotal,
    grandTotal,
    paidAmount: paid,
    changeAmount: Math.max(0, paid - grandTotal),
    paymentMethod: paymentMethod || 'Cash',
    paymentStatus: paid >= grandTotal ? 'paid' : paid > 0 ? 'partial' : 'pending',
    soldBy: req.user._id,
    notes,
  };

  if (saleType === 'patient' && patientId) {
    saleData.patient = patientId;
  } else {
    saleData.customerName = customerName || 'Walk-in Customer';
    saleData.customerPhone = customerPhone;
  }

  const sale = await DirectSale.create(saleData);
  await sale.populate('soldBy', 'name');

  res.status(201).json({ success: true, data: sale, message: 'Sale created successfully' });
});

exports.getDirectSales = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.date) {
    const d = new Date(req.query.date);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    filter.saleDate = { $gte: d, $lt: next };
  }
  if (req.query.paymentMethod) filter.paymentMethod = req.query.paymentMethod;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [sales, total] = await Promise.all([
    DirectSale.find(filter)
      .populate('patient', 'name patientId')
      .populate('soldBy', 'name')
      .sort('-saleDate')
      .skip(skip)
      .limit(limit),
    DirectSale.countDocuments(filter),
  ]);

  res.status(200).json({ success: true, count: total, pages: Math.ceil(total / limit), data: sales });
});

exports.getDirectSaleById = asyncHandler(async (req, res, next) => {
  const sale = await DirectSale.findById(req.params.id)
    .populate('patient', 'name patientId phone')
    .populate('soldBy', 'name')
    .populate('items.medicine', 'name genericName');
  if (!sale) return next(new ErrorResponse('Sale not found', 404));
  res.status(200).json({ success: true, data: sale });
});

exports.getTodayPharmacySales = asyncHandler(async (req, res) => {
  const { from, to } = istToday();

  const result = await DirectSale.aggregate([
    { $match: { saleDate: { $gte: from, $lt: to } } },
    { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
  ]);

  res.status(200).json({
    success: true,
    data: { total: result[0]?.total || 0, count: result[0]?.count || 0 },
  });
});