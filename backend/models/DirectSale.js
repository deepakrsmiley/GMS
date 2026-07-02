const mongoose = require('mongoose');
const Counter = require('./Counter');

const saleItemSchema = new mongoose.Schema({
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicineName: { type: String, required: true },
  batchNumber: { type: String },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true },
  mrp: { type: Number },
  gstPercent: { type: Number, default: 0 },
  gstAmount: { type: Number, default: 0 },
  discountPercent: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
});

const directSaleSchema = new mongoose.Schema({
  invoiceNumber: { type: String, unique: true },
  saleType: { type: String, enum: ['patient', 'walkin'], default: 'walkin' },
  // Patient-linked sale
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  opRegistration: { type: mongoose.Schema.Types.ObjectId, ref: 'OPRegistration' },
  // Walk-in sale (no patient registration)
  customerName: { type: String, trim: true },
  customerPhone: { type: String, trim: true },
  customerAddress: { type: String, trim: true },
  // Items
  items: [saleItemSchema],
  // Financials
  subtotal: { type: Number, required: true },
  totalGst: { type: Number, default: 0 },
  totalDiscount: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true },
  paidAmount: { type: Number, required: true },
  changeAmount: { type: Number, default: 0 },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Card', 'UPI', 'Insurance', 'Cheque'],
    default: 'Cash',
  },
  paymentStatus: {
    type: String,
    enum: ['paid', 'partial', 'pending'],
    default: 'paid',
  },
  notes: { type: String },
  soldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  saleDate: { type: Date, default: Date.now },
}, { timestamps: true });

// Auto-generate Invoice Number
directSaleSchema.pre('save', async function (next) {
  if (!this.invoiceNumber) {
    const seq = await Counter.getNextSeq('directSale');
    this.invoiceNumber = `INV-${String(seq).padStart(6, '0')}`;
  }
  next();
});

directSaleSchema.index({ saleDate: -1 });
directSaleSchema.index({ patient: 1 });
directSaleSchema.index({ invoiceNumber: 1 });
directSaleSchema.index({ soldBy: 1 });

module.exports = mongoose.model('DirectSale', directSaleSchema);
