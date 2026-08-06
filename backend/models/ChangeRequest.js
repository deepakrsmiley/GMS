const mongoose = require('mongoose');

/**
 * Staff change / edit requests reviewed by Super Admin (or Admin).
 * Additive workflow — direct privileged edits (e.g. EDIT_MEDICINE) stay available.
 */
const fieldChangeSchema = new mongoose.Schema({
  field: { type: String, required: true }, // e.g. gstPercent, sellingPrice
  fieldLabel: String, // e.g. "GST %"
  currentValue: String,
  requestedValue: String,
}, { _id: false });

const changeRequestSchema = new mongoose.Schema({
  requestNumber: { type: String, unique: true },
  category: {
    type: String,
    enum: [
      'medicine_edit',
      'patient_data',
      'billing',
      'lab',
      'ip_admission',
      'pharmacy',
      'staff_access',
      'masters',
      'other',
    ],
    default: 'other',
    required: true,
  },
  title: { type: String, required: true, trim: true },
  /** What is wrong? */
  whatIsWrong: { type: String, required: true, trim: true },
  /** What should be changed? (free text summary) */
  requestedChange: { type: String, required: true, trim: true },
  reason: { type: String, required: true, trim: true },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },

  // Medicine-specific (optional)
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicineName: String,
  /** When set, fieldChanges apply to this batch subdocument (not medicine master) */
  batchId: { type: mongoose.Schema.Types.ObjectId },
  batchNumber: String,
  fieldChanges: [fieldChangeSchema],

  // Optional link to any other record
  relatedId: String,
  relatedModel: String,

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'applied'],
    default: 'pending',
  },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNotes: String,
  /** When medicine fields were auto-applied on approve */
  appliedAt: Date,
  appliedChanges: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

changeRequestSchema.index({ status: 1, createdAt: -1 });
changeRequestSchema.index({ requestedBy: 1, createdAt: -1 });
changeRequestSchema.index({ category: 1 });

module.exports = mongoose.model('ChangeRequest', changeRequestSchema);
