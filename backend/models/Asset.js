const mongoose = require('mongoose');
const Counter = require('./Counter');

const assetSchema = new mongoose.Schema({
  assetId: { type: String, unique: true },
  name: { type: String, required: [true, 'Asset name is required'], trim: true },
  category: {
    type: String,
    required: true,
    enum: [
      'Laboratory Equipment',
      'Radiology Equipment',
      'OT Equipment',
      'ICU Equipment',
      'Pharmacy Equipment',
      'General Hospital Equipment',
    ],
  },
  manufacturer: { type: String, trim: true },
  modelNumber: { type: String, trim: true },
  serialNumber: { type: String, trim: true },
  purchaseDate: { type: Date },
  warrantyExpiry: { type: Date },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  location: { type: String, trim: true },
  vendorName: { type: String, trim: true },
  vendorContact: { type: String, trim: true },
  vendorEmail: { type: String, trim: true },
  cost: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['Working', 'Under Maintenance', 'Breakdown', 'Repair In Progress', 'Ready to Use', 'Decommissioned'],
    default: 'Working',
  },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Auto-generate Asset ID
assetSchema.pre('save', async function (next) {
  if (!this.assetId) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'asset' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.assetId = `AST-${String(counter.seq).padStart(6, '0')}`;
  }
  next();
});

assetSchema.index({ status: 1 });
assetSchema.index({ department: 1 });
assetSchema.index({ warrantyExpiry: 1 });
assetSchema.index({ category: 1 });

module.exports = mongoose.model('Asset', assetSchema);
