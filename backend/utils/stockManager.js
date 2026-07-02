const Medicine = require('../models/Medicine');
const ErrorResponse = require('./errorResponse');
const {
  validateDispensable,
  deductFromUsableBatches,
  syncCurrentStock,
  logStockMovement,
} = require('./pharmacyStockHelper');

const getMedicineItems = (items = []) =>
  items.filter((item) => item.type === 'medicine' && item.medicine);

const deductFromBatches = (medicine, quantity) => deductFromUsableBatches(medicine, quantity);

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
  for (const item of getMedicineItems(items)) {
    const quantity = Number(item.quantity || 0);
    if (quantity <= 0) throw new ErrorResponse('Medicine quantity must be greater than zero', 400);

    const medicine = await Medicine.findById(item.medicine).select('name currentStock isActive batches sellingPrice purchasePrice supplier');
    if (!medicine || !medicine.isActive) {
      throw new ErrorResponse(`Medicine not found for ${item.description || 'bill item'}`, 404);
    }
    syncCurrentStock(medicine);
    const check = validateDispensable(medicine, quantity);
    if (!check.ok) throw new ErrorResponse(check.reason, 400);
  }
};

const deductMedicineStock = async (items, userId = null) => {
  const deducted = [];

  for (const item of getMedicineItems(items)) {
    const quantity = Number(item.quantity || 0);
    const medicine = await Medicine.findById(item.medicine);

    if (!medicine) {
      throw new ErrorResponse('Medicine stock changed while billing. Please refresh and try again.', 409);
    }

    syncCurrentStock(medicine);
    const check = validateDispensable(medicine, quantity);
    if (!check.ok) throw new ErrorResponse(check.reason, 400);

    const qtyBefore = medicine.currentStock;
    const { primaryBatch, unallocated } = deductFromBatches(medicine, quantity);
    if (unallocated > 0) {
      throw new ErrorResponse(`${medicine.name}: insufficient non-expired stock`, 409);
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
        unitPrice: medicine.sellingPrice,
        userId,
        remarks: 'Billed medicine deduction',
      });
    }

    item.batch = primaryBatch || item.batch;
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

const restoreMedicineStock = async (deducted = []) => {
  for (const entry of deducted) {
    const medicine = await Medicine.findById(entry.medicine);
    if (!medicine) continue;

    medicine.currentStock += entry.quantity;
    restoreToBatch(medicine, entry.batch, entry.quantity);
    medicine.markModified('batches');
    await medicine.save({ validateBeforeSave: true });
  }
};

const restoreBillItemsStock = async (items = []) => {
  const entries = getMedicineItems(items).map((item) => ({
    medicine: item.medicine,
    quantity: Number(item.quantity || 0),
    batch: item.batch,
  }));
  await restoreMedicineStock(entries);
};

module.exports = {
  getMedicineItems,
  validateMedicineStock,
  deductMedicineStock,
  restoreMedicineStock,
  restoreBillItemsStock,
};
