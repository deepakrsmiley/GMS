const mongoose = require('mongoose');
const { applyOrganizationScope } = require('../plugins/organizationScope');

const purchaseItemSchema = new mongoose.Schema({
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  medicineName: { type: String, required: true },
  batchNumber: { type: String, required: true },
  expiryDate: { type: Date, required: true },
  quantity: { type: Number, required: true, min: 0 },
  freeQuantity: { type: Number, default: 0, min: 0 },
  purchaseRate: { type: Number, required: true, min: 0 },
  sellingPrice: { type: Number, min: 0 },
  discountAmount: { type: Number, default: 0 },
  overallDiscountShare: { type: Number, default: 0 },
  gstPercent: { type: Number, default: 0 },
  grossAmount: { type: Number, default: 0 },
  taxableAmount: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  lineTotal: { type: Number, default: 0 },
  returnedQuantity: { type: Number, default: 0, min: 0 },
  effectiveUnitCost: { type: Number, default: 0 },
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

const purchaseSchema = new mongoose.Schema({
  purchaseNumber: { type: String, required: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
  supplierName: String,
  supplierInvoiceNumber: { type: String, required: true, trim: true },
  purchaseDate: { type: Date, required: true, index: true },
  dueDate: Date,
  paymentType: {
    type: String,
    enum: ['cash', 'credit', 'upi', 'card', 'cheque', 'neft'],
    default: 'credit',
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partial', 'paid'],
    default: 'unpaid',
    index: true,
  },
  amountPaid: { type: Number, default: 0 },
  appliedCredit: { type: Number, default: 0 },
  referenceNumber: String,
  notes: String,
  gstMode: { type: String, enum: ['intra', 'inter'], default: 'intra' },
  items: [purchaseItemSchema],
  grossPurchaseValue: { type: Number, default: 0 },
  itemDiscountTotal: { type: Number, default: 0 },
  overallDiscount: { type: Number, default: 0 },
  taxableAmount: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  cgstTotal: { type: Number, default: 0 },
  sgstTotal: { type: Number, default: 0 },
  igstTotal: { type: Number, default: 0 },
  netPurchaseValue: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  totalQuantity: { type: Number, default: 0 },
  returnStatus: { type: String, enum: ['none', 'partial', 'full'], default: 'none', index: true },
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

purchaseSchema.index({ purchaseNumber: 1, organizationId: 1 }, { unique: true });
purchaseSchema.index({ supplier: 1, supplierInvoiceNumber: 1, status: 1 });
purchaseSchema.index({ purchaseDate: -1 });

applyOrganizationScope(purchaseSchema);

module.exports = mongoose.model('Purchase', purchaseSchema);
