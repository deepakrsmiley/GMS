const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema({
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true, index: true },
  medicineName: { type: String, required: true, index: true },
  batchNumber: String,
  type: {
    type: String,
    enum: ['stock_in', 'dispense', 'bill_deduct', 'dispose', 'adjustment', 'expiry_alert', 'reorder', 'sale', 'stock_adjustment_reduce', 'stock_adjustment_increase'],
    required: true,
    index: true,
  },
  quantityBefore: { type: Number, default: 0 },
  quantityAfter: { type: Number, default: 0 },
  quantityChanged: { type: Number, required: true },
  unitPrice: { type: Number, default: 0 },
  totalValue: { type: Number, default: 0 },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  referenceId: mongoose.Schema.Types.ObjectId,
  referenceModel: String,
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  remarks: String,
  transactionDate: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

stockMovementSchema.index({ transactionDate: -1 });
stockMovementSchema.index({ medicine: 1, transactionDate: -1 });
stockMovementSchema.index({ type: 1, transactionDate: -1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);