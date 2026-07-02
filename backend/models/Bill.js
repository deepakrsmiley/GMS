const mongoose = require('mongoose');

  const BILL_CATEGORIES = ['Consultation', 'Pharmacy', 'Laboratory', 'Admission', 'Room', 'ICU', 'Procedure', 'Nursing', 'Miscellaneous'];
  const BILL_ITEM_TYPES = ['consultation', 'procedure', 'medicine', 'lab', 'room', 'nursing', 'admission', 'other'];

  const billItemSchema = new mongoose.Schema({
    category: { type: String, enum: BILL_CATEGORIES },
    type: { type: String, enum: BILL_ITEM_TYPES, required: true },
    description: { type: String, required: true },
    name: String,
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, required: true },
    gstPercent: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId },
    referenceModel: { type: String, enum: ['OPRegistration', 'IPAdmission', 'LabTest', 'Prescription', 'Patient', 'Medicine'] },
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
    batch: String,
    batchNumber: String,
    genericName: String,
    mrp: Number,
    mfgDate: Date,
    expiryDate: Date,
    hsnCode: String,
    unitOfMeasure: { type: String, default: 'Nos' },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
  });

  const paymentSchema = new mongoose.Schema({
    amount: { type: Number, required: true, min: [0, 'Payment amount cannot be negative'] },
    mode: { type: String, enum: ['cash', 'card', 'upi', 'cheque', 'insurance', 'online'] },
    reference: String,
    paidAt: { type: Date, default: Date.now },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  });

  const billEditHistorySchema = new mongoose.Schema({
    billNumber: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    editTime: { type: Date, default: Date.now },
    actionType: { type: String, required: true },
    field: String,
    previousValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    reason: { type: String, required: true },
  }, { _id: true });

  const billPrintHistorySchema = new mongoose.Schema({
    printCount: { type: Number, required: true },
    printedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    printedByName: String,
    printedAt: { type: Date, default: Date.now },
    reason: { type: String, default: 'Bill reprint' },
    format: { type: String, enum: ['invoice', 'thermal'], default: 'invoice' },
  }, { _id: true });

  const billSchema = new mongoose.Schema({
    billNumber: { type: String, unique: true },
    billType: { type: String, enum: ['op', 'ip', 'pharmacy', 'lab', 'package', 'unified'], default: 'unified' },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    opRegistration: { type: mongoose.Schema.Types.ObjectId, ref: 'OPRegistration' },
    ipAdmission: { type: mongoose.Schema.Types.ObjectId, ref: 'IPAdmission' },
    items: [billItemSchema],
    subtotal: { type: Number, default: 0 },
    totalGST: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0, min: [0, 'Paid amount cannot be negative'] },
    dueAmount: { type: Number, default: 0 },
    advanceAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'pending', 'partial', 'paid', 'cancelled', 'refunded'], default: 'pending' },
    paymentMode: { type: String, enum: ['cash', 'card', 'upi', 'cheque', 'insurance', 'online', 'multiple'] },
    payments: [paymentSchema],
    insuranceClaim: {
      provider: String,
      claimNumber: String,
      approvedAmount: Number,
      status: { type: String, enum: ['pending', 'approved', 'rejected', 'partial'] },
    },
    notes: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    originalData: mongoose.Schema.Types.Mixed,
    editHistory: [billEditHistorySchema],
    printHistory: [billPrintHistorySchema],
    printCount: { type: Number, default: 0 },
  }, { timestamps: true });

  billSchema.pre('save', function (next) {
  this.subtotal = this.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  this.totalGST = this.items.reduce(
    (sum, item) => sum + (item.gstAmount || 0),
    0
  );

  this.discountAmount =
    (this.subtotal + this.totalGST) * (this.discount / 100);

  this.totalAmount = Number(
    (this.subtotal + this.totalGST - this.discountAmount).toFixed(2)
  );

  const totalAmountRounded = Number(
    (this.totalAmount || 0).toFixed(2)
  );

  // Auto-clamp paidAmount so reducing medicine qty never throws an error.
  // If the bill total drops below what was already paid, cap paidAmount at
  // the new total (treating the excess as a credit / overpayment handled
  // separately by the accounts department).
  if ((this.paidAmount || 0) > totalAmountRounded) {
    this.paidAmount = totalAmountRounded;
  }

  const totalPaid = Number(
    ((this.paidAmount || 0) + (this.advanceAmount || 0)).toFixed(2)
  );

  this.dueAmount = Number(
    Math.max(totalAmountRounded - totalPaid, 0).toFixed(2)
  );

  if (this.status !== 'cancelled' && this.status !== 'refunded') {
    if (this.dueAmount === 0) {
      this.status = 'paid';
    } else if (
      (this.paidAmount || 0) > 0 ||
      (this.advanceAmount || 0) > 0
    ) {
      this.status = 'partial';
    } else {
      this.status = 'pending';
    }
  }

  next();
});

  billSchema.index({ patient: 1 });
  billSchema.index({ status: 1 });
  billSchema.index({ createdAt: -1 });
  billSchema.index({ billType: 1, createdAt: -1 });

  module.exports = mongoose.model('Bill', billSchema);