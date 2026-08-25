const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    match: [/^[A-Z0-9_-]{3,20}$/, 'Organization code must be 3-20 letters, numbers, underscore or hyphen'],
  },
  kind: {
    type: String,
    enum: ['platform', 'client'],
    default: 'client',
    index: true,
  },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  logo: { type: String, trim: true },
  address: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  gstNumber: { type: String, trim: true },
  invoicePrefix: { type: String, trim: true },
  receiptPrefix: { type: String, trim: true },
  enabledModules: [{ type: String, trim: true }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

organizationSchema.index({ status: 1, name: 1 });

module.exports = mongoose.model('Organization', organizationSchema);
