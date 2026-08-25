const mongoose = require('mongoose');
const { applyOrganizationScope } = require('../plugins/organizationScope');
const Counter = require('./Counter');

const bmeVendorSchema = new mongoose.Schema({
  vendorCode: { type: String, unique: true },
  name: { type: String, required: true, trim: true },
  contactPerson: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  address: { type: String, trim: true },
  equipmentCovered: [{ type: String }],
  serviceEngineers: [{
    name: String,
    phone: String,
    email: String,
  }],
  performanceRating: { type: Number, min: 1, max: 5, default: 3 },
  visitHistory: [{
    date: Date,
    purpose: String,
    equipment: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
    notes: String,
    engineer: String,
  }],
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

bmeVendorSchema.pre('save', async function (next) {
  if (!this.vendorCode) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'bmeVendor' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.vendorCode = `BV-${String(counter.seq).padStart(5, '0')}`;
  }
  next();
});

applyOrganizationScope(bmeVendorSchema);

module.exports = mongoose.model('BmeVendor', bmeVendorSchema);
