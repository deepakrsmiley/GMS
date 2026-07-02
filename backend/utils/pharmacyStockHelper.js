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

const deductFromUsableBatches = (medicine, quantity) => {
  let remaining = quantity;
  let primaryBatch = null;
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

const validateDispensable = (medicine, quantity) => {
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

module.exports = {
  isBatchUsable,
  getUsableBatches,
  getAvailableStock,
  getExpiredBatches,
  syncCurrentStock,
  sortBatchesFEFO,
  deductFromUsableBatches,
  logStockMovement,
  validateDispensable,
};
