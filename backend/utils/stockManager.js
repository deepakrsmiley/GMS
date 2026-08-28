const Medicine = require('../models/Medicine');
const ErrorResponse = require('./errorResponse');
const {
  validateDispensable,
  deductFromUsableBatches,
  syncCurrentStock,
  logStockMovement,
} = require('./pharmacyStockHelper');

// Stock is taken at the source for these bill lines:
// - Prescription: pharmacy dispense
// - IPAdmission: ward medication log (ipController.addMedication)
// Billing must charge them without deducting (or restoring) inventory again.
const STOCK_PRE_DEDUCTED_REFS = new Set(['Prescription', 'IPAdmission']);

const isStockPreDeducted = (item) =>
  STOCK_PRE_DEDUCTED_REFS.has(item?.referenceModel);

const getMedicineItems = (items = []) =>
  items.filter((item) => item.type === 'medicine' && item.medicine);

const stockableMedicineItems = (items = []) =>
  getMedicineItems(items).filter((item) => !isStockPreDeducted(item));

const deductFromBatches = (medicine, quantity, preferredBatchNumber = null) =>
  deductFromUsableBatches(medicine, quantity, preferredBatchNumber);

const restoreToBatch = (medicine, batchNumber, quantity) => {
  if (!batchNumber) return;
  const batch = medicine.batches.find((b) => b.batchNumber === batchNumber);
  if (batch) {
    batch.quantity += quantity;
  } else {
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);
    medicine.batches.push({
      batchNumber,
      quantity,
      expiryDate: expiry,
      receivedDate: new Date(),
    });
  }
};

const validateMedicineStock = async (items) => {
  for (const item of stockableMedicineItems(items)) {
    const quantity = Number(item.quantity || 0);
    if (quantity <= 0) throw new ErrorResponse('Medicine quantity must be greater than zero', 400);

    const medicine = await Medicine.findById(item.medicine).select('name currentStock isActive batches sellingPrice purchasePrice supplier');
    if (!medicine || !medicine.isActive) {
      throw new ErrorResponse(`Medicine not found for ${item.description || 'bill item'}`, 404);
    }
    syncCurrentStock(medicine);
    const preferredBatch = item.batch || item.batchNumber || null;
    const check = validateDispensable(medicine, quantity, preferredBatch);
    if (!check.ok) throw new ErrorResponse(check.reason, 400);
  }
};

const deductMedicineStock = async (items, userId = null) => {
  const deducted = [];

  for (const item of stockableMedicineItems(items)) {
    const quantity = Number(item.quantity || 0);
    const medicine = await Medicine.findById(item.medicine);

    if (!medicine) {
      throw new ErrorResponse('Medicine stock changed while billing. Please refresh and try again.', 409);
    }

    syncCurrentStock(medicine);
    const preferredBatch = item.batch || item.batchNumber || null;
    const check = validateDispensable(medicine, quantity, preferredBatch);
    if (!check.ok) throw new ErrorResponse(check.reason, 400);

    const qtyBefore = medicine.currentStock;
    const { primaryBatch, unallocated } = deductFromBatches(medicine, quantity, preferredBatch);
    if (unallocated > 0) {
      throw new ErrorResponse(
        preferredBatch
          ? `${medicine.name} batch ${preferredBatch}: insufficient stock`
          : `${medicine.name}: insufficient non-expired stock`,
        409,
      );
    }

    syncCurrentStock(medicine);
    medicine.markModified('batches');
    await medicine.save({ validateBeforeSave: true });

    if (userId) {
      await logStockMovement({
        medicine,
        batchNumber: primaryBatch,
        type: 'bill_deduct',
        quantityBefore: qtyBefore,
        quantityAfter: medicine.currentStock,
        quantityChanged: -quantity,
        unitPrice: item.unitPrice || medicine.sellingPrice,
        userId,
        remarks: preferredBatch
          ? `Billed medicine deduction (batch ${preferredBatch})`
          : 'Billed medicine deduction',
      });
    }

    item.batch = primaryBatch || item.batch;
    item.batchNumber = item.batchNumber || primaryBatch || item.batch;
    item.name = item.name || medicine.name;

    deducted.push({
      medicine: item.medicine,
      quantity,
      batch: primaryBatch,
      name: medicine.name,
    });
  }

  return deducted;
};

const restoreMedicineStock = async (deducted = [], meta = {}) => {
  const { userId, remarks, referenceId, referenceModel } = meta;
  for (const entry of deducted) {
    const medicine = await Medicine.findById(entry.medicine);
    if (!medicine) continue;

    const qtyBefore = medicine.currentStock;
    restoreToBatch(medicine, entry.batch, entry.quantity);
    syncCurrentStock(medicine);
    medicine.markModified('batches');
    await medicine.save({ validateBeforeSave: true });

    if (userId) {
      await logStockMovement({
        medicine,
        batchNumber: entry.batch,
        type: 'stock_adjustment_increase',
        quantityBefore: qtyBefore,
        quantityAfter: medicine.currentStock,
        quantityChanged: Number(entry.quantity || 0),
        userId,
        referenceId,
        referenceModel: referenceModel || 'Bill',
        remarks: remarks || 'Stock restored from bill',
      });
    }
  }
};

const restoreBillItemsStock = async (items = [], meta = {}) => {
  const entries = stockableMedicineItems(items).map((item) => ({
    medicine: item.medicine,
    quantity: Number(item.quantity || 0),
    batch: item.batch || item.batchNumber,
  }));
  await restoreMedicineStock(entries, meta);
};

module.exports = {
  isStockPreDeducted,
  getMedicineItems,
  stockableMedicineItems,
  validateMedicineStock,
  deductMedicineStock,
  restoreMedicineStock,
  restoreBillItemsStock,
};
