const mongoose = require('mongoose');
const { applyOrganizationScope } = require('../plugins/organizationScope');
const Counter = require('./Counter');

const bmeSparePartSchema = new mongoose.Schema({
  partCode: { type: String, unique: true },
  name: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: [
      'Battery', 'Fuse', 'Probe', 'Cable', 'Sensor', 'Display', 'Motherboard',
      'PCB', 'Power Supply', 'Motor', 'Valve', 'Fan', 'Other',
    ],
    default: 'Other',
  },
  manufacturer: { type: String, trim: true },
  compatibleEquipment: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }],
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'BmeVendor' },
  supplierName: String,
  batch: { type: String, trim: true },
  stock: { type: Number, default: 0 },
  reorderLevel: { type: Number, default: 5 },
  unitCost: { type: Number, default: 0 },
  expiry: Date,
  location: String,
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

bmeSparePartSchema.pre('save', async function (next) {
  if (!this.partCode) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'bmeSparePart' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.partCode = `SP-${String(counter.seq).padStart(5, '0')}`;
  }
  next();
});

bmeSparePartSchema.index({ stock: 1 });
bmeSparePartSchema.index({ category: 1 });

applyOrganizationScope(bmeSparePartSchema);

module.exports = mongoose.model('BmeSparePart', bmeSparePartSchema);
