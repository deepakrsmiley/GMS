const mongoose = require('mongoose');
const { applyOrganizationScope } = require('../plugins/organizationScope');

const returnItemSchema = new mongoose.Schema({
  purchaseItemId: { type: mongoose.Schema.Types.ObjectId, required: true },
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  medicineName: { type: String, required: true },
  batchNumber: { type: String, required: true },
  expiryDate: Date,
  originalQuantity: { type: Number, default: 0 },
  availableQuantity: { type: Number, default: 0 },
  returnQuantity: { type: Number, required: true, min: 0 },
  purchaseRate: { type: Number, required: true, min: 0 },
  sellingPrice: { type: Number, default: 0 },
  returnValue: { type: Number, required: true, min: 0 },
  remainingQuantity: { type: Number, default: 0 },
  remainingStockValue: { type: Number, default: 0 },
});

const auditSchema = new mongoose.Schema({
  action: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  role: String,
  at: { type: Date, default: Date.now },
  ipAddress: String,
  userAgent: String,
  note: String,
}, { _id: false });

const purchaseReturnSchema = new mongoose.Schema({
  returnNumber: { type: String, required: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
  supplierName: String,
  purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true, index: true },
  originalInvoice: { type: String, required: true },
  purchaseNumber: String,
  returnDate: { type: Date, required: true, index: true },
  reason: { type: String, required: true },
  notes: String,
  items: [returnItemSchema],
  totalReturnQuantity: { type: Number, default: 0 },
  totalReturnValue: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active', index: true },
  cancelReason: String,
  cancelledAt: Date,
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: String,
  createdByRole: String,
  ipAddress: String,
  userAgent: String,
  audit: [auditSchema],
}, { timestamps: true });

purchaseReturnSchema.index({ returnNumber: 1, organizationId: 1 }, { unique: true });
purchaseReturnSchema.index({ returnDate: -1 });

applyOrganizationScope(purchaseReturnSchema);

module.exports = mongoose.model('PurchaseReturn', purchaseReturnSchema);
