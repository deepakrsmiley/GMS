const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
  batchNumber: { type: String, required: true },
  manufacturer: String,
  expiryDate: { type: Date, required: true },
  quantity: { type: Number, default: 0, min: [0, 'Batch quantity cannot be negative'] },
  purchasePrice: Number,
  sellingPrice: Number,
  mrp: Number,
  supplierInvoice: String,
  receivedDate: { type: Date, default: Date.now },
  isDisposed: { type: Boolean, default: false },
  disposedAt: Date,
  disposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

const medicineSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  genericName: String,
  barcode: { type: String, unique: true, sparse: true },
  category: { type: String, enum: ['tablet', 'capsule', 'syrup', 'injection', 'ointment', 'drops', 'inhaler', 'other'] },
  manufacturer: String,
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  unitOfMeasure: { type: String, default: 'Nos' },
  currentStock: { type: Number, default: 0, min: [0, 'Medicine stock cannot be negative'] },
  minimumStock: { type: Number, default: 10, min: [0, 'Minimum stock cannot be negative'] },
  maximumStock: Number,
  reorderLevel: { type: Number, default: 20 },
  sellingPrice: { type: Number, required: true },
  mrp: Number,
  purchasePrice: Number,
  gstPercent: { type: Number, default: 5 },
  hsnCode: String,
  location: String,
  requiresPrescription: { type: Boolean, default: false },
  isScheduledDrug: { type: Boolean, default: false },
  batches: [batchSchema],
  isActive: { type: Boolean, default: true },
  description: String,
}, { timestamps: true });

medicineSchema.index({ name: 'text', genericName: 'text' });
medicineSchema.index({ name: 1 });
medicineSchema.index({ currentStock: 1 });
medicineSchema.index({ supplier: 1 });
medicineSchema.index({ 'batches.batchNumber': 1 });
medicineSchema.index({ 'batches.expiryDate': 1 });
medicineSchema.index({ isActive: 1, currentStock: 1 });

module.exports = mongoose.model('Medicine', medicineSchema);
