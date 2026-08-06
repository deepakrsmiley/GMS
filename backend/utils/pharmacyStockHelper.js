const StockMovement = require('../models/StockMovement');

const isBatchUsable = (batch) =>
  batch.quantity > 0 && !batch.isDisposed && new Date(batch.expiryDate) >= new Date();

const getUsableBatches = (medicine) =>
  (medicine.batches || []).filter(isBatchUsable);

const getAvailableStock = (medicine) =>
  getUsableBatches(medicine).reduce((sum, b) => sum + b.quantity, 0);

const getExpiredBatches = (medicine) =>
  (medicine.batches || []).filter((b) => b.quantity > 0 && !b.isDisposed && new Date(b.expiryDate) < new Date());

const syncCurrentStock = (medicine) => {
  medicine.currentStock = getAvailableStock(medicine);
  return medicine.currentStock;
};

const sortBatchesFEFO = (batches = []) =>
  [...batches].sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

const normalizeBatchNumber = (batchNumber) =>
  String(batchNumber || '').trim().replace(/\s+/g, ' ');

const sameBatchNumber = (a, b) =>
  normalizeBatchNumber(a).toLowerCase() === normalizeBatchNumber(b).toLowerCase();

/** Find non-disposed batch by batch number (case-insensitive, trimmed). */
const findActiveBatch = (medicine, batchNumber) =>
  (medicine.batches || []).find(
    (b) => !b.isDisposed && sameBatchNumber(b.batchNumber, batchNumber),
  );

/**
 * Add qty to an existing batch or create a new one under the medicine.
 * Same batch number → merge (no duplicate / already-exists error).
 * Returns { batch, merged }.
 */
const upsertBatchStock = (medicine, {
  batchNumber,
  quantity,
  expiryDate,
  purchasePrice,
  sellingPrice,
  mrp,
  manufacturer,
  supplierInvoice,
  receivedDate,
  remarks,
} = {}) => {
  const qty = Number(quantity) || 0;
  const normalized = normalizeBatchNumber(batchNumber);
  if (!normalized) {
    const err = new Error('Batch number is required');
    err.statusCode = 400;
    throw err;
  }
  if (qty <= 0) {
    const err = new Error('Stock quantity must be greater than zero');
    err.statusCode = 400;
    throw err;
  }

  const existing = findActiveBatch(medicine, normalized);
  if (existing) {
    existing.quantity = (Number(existing.quantity) || 0) + qty;
    if (purchasePrice != null && purchasePrice !== '') existing.purchasePrice = Number(purchasePrice);
    if (sellingPrice != null && sellingPrice !== '') existing.sellingPrice = Number(sellingPrice);
    if (mrp != null && mrp !== '') existing.mrp = Number(mrp);
    if (manufacturer) existing.manufacturer = manufacturer;
    if (supplierInvoice) existing.supplierInvoice = supplierInvoice;
    // Keep original expiry unless missing; do not silently overwrite lot identity
    if (!existing.expiryDate && expiryDate) existing.expiryDate = new Date(expiryDate);
    return { batch: existing, merged: true };
  }

  if (!expiryDate) {
    const err = new Error('Expiry date is required for a new batch');
    err.statusCode = 400;
    throw err;
  }
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) {
    const err = new Error('Invalid expiry date');
    err.statusCode = 400;
    throw err;
  }
  if (expiry < new Date()) {
    const err = new Error('Cannot add stock with expired batch');
    err.statusCode = 400;
    throw err;
  }

  const batch = {
    batchNumber: normalized,
    quantity: qty,
    expiryDate: expiry,
    purchasePrice: purchasePrice != null && purchasePrice !== '' ? Number(purchasePrice) : medicine.purchasePrice,
    sellingPrice: sellingPrice != null && sellingPrice !== '' ? Number(sellingPrice) : medicine.sellingPrice,
    mrp: mrp != null && mrp !== '' ? Number(mrp) : medicine.mrp,
    manufacturer: manufacturer || medicine.manufacturer,
    supplierInvoice,
    receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
    remarks,
  };
  medicine.batches.push(batch);
  return { batch: medicine.batches[medicine.batches.length - 1], merged: false };
};

/**
 * Deduct stock. If preferredBatchNumber is set, deduct only from that batch
 * (needed when pharmacy picks a specific batch with its own price).
 */
const deductFromUsableBatches = (medicine, quantity, preferredBatchNumber = null) => {
  let remaining = quantity;
  let primaryBatch = null;

  if (preferredBatchNumber) {
    const preferred = getUsableBatches(medicine).find(
      (b) => sameBatchNumber(b.batchNumber, preferredBatchNumber),
    );
    if (!preferred || preferred.quantity < quantity) {
      return {
        primaryBatch: preferredBatchNumber,
        unallocated: quantity - (preferred?.quantity || 0),
      };
    }
    preferred.quantity -= quantity;
    return { primaryBatch: preferred.batchNumber, unallocated: 0 };
  }

  const sorted = sortBatchesFEFO(getUsableBatches(medicine));
  for (const batch of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    batch.quantity -= take;
    remaining -= take;
    if (!primaryBatch) primaryBatch = batch.batchNumber;
  }

  return { primaryBatch, unallocated: remaining };
};

const logStockMovement = async ({
  medicine,
  batchNumber,
  type,
  quantityBefore,
  quantityAfter,
  quantityChanged,
  unitPrice = 0,
  supplier,
  referenceId,
  referenceModel,
  userId,
  remarks,
}) => {
  const movement = await StockMovement.create({
    medicine: medicine._id,
    medicineName: medicine.name,
    batchNumber,
    type,
    quantityBefore,
    quantityAfter,
    quantityChanged,
    unitPrice,
    totalValue: Math.abs(quantityChanged) * (unitPrice || medicine.sellingPrice || 0),
    supplier: supplier || medicine.supplier,
    referenceId,
    referenceModel,
    addedBy: userId,
    updatedBy: userId,
    remarks,
    transactionDate: new Date(),
  });
  return movement;
};

const validateDispensable = (medicine, quantity, preferredBatchNumber = null) => {
  if (preferredBatchNumber) {
    const preferred = getUsableBatches(medicine).find(
      (b) => sameBatchNumber(b.batchNumber, preferredBatchNumber),
    );
    if (!preferred) {
      return {
        ok: false,
        reason: `${medicine.name}: batch ${preferredBatchNumber} not available (expired, disposed, or empty)`,
      };
    }
    if (preferred.quantity < quantity) {
      return {
        ok: false,
        reason: `${medicine.name} batch ${preferredBatchNumber}: only ${preferred.quantity} in stock (requested ${quantity})`,
      };
    }
    return { ok: true, available: preferred.quantity };
  }

  const available = getAvailableStock(medicine);
  if (available < quantity) {
    const expiredQty = getExpiredBatches(medicine).reduce((s, b) => s + b.quantity, 0);
    if (expiredQty > 0 && medicine.currentStock >= quantity) {
      return { ok: false, reason: `${medicine.name} has expired stock. Cannot dispense expired medicines.` };
    }
    return { ok: false, reason: `${medicine.name}: only ${available} usable in stock (requested ${quantity})` };
  }
  return { ok: true, available };
};

/** Normalize usable batches with effective sell / MRP / purchase for APIs & UI. */
const mapUsableBatchesWithPrices = (medicine) =>
  sortBatchesFEFO(getUsableBatches(medicine)).map((b) => ({
    _id: b._id,
    batchNumber: b.batchNumber,
    expiryDate: b.expiryDate,
    quantity: b.quantity,
    purchasePrice: b.purchasePrice != null ? b.purchasePrice : medicine.purchasePrice,
    sellingPrice: b.sellingPrice != null ? b.sellingPrice : medicine.sellingPrice,
    mrp: b.mrp != null ? b.mrp : medicine.mrp,
    receivedDate: b.receivedDate,
    manufacturer: b.manufacturer || medicine.manufacturer,
  }));

module.exports = {
  isBatchUsable,
  getUsableBatches,
  getAvailableStock,
  getExpiredBatches,
  syncCurrentStock,
  sortBatchesFEFO,
  normalizeBatchNumber,
  sameBatchNumber,
  findActiveBatch,
  upsertBatchStock,
  deductFromUsableBatches,
  logStockMovement,
  validateDispensable,
  mapUsableBatchesWithPrices,
};
