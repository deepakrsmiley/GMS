const mongoose = require('mongoose');
const { applyOrganizationScope } = require('../plugins/organizationScope');
const { LAB_TYPES } = require('./LabTest');

// Hospital-configurable price list for lab tests/profiles (CBC, LFT, RFT, etc.)
// Lab technicians (and everyone else who creates a lab order) pick a test/profile
// name and the price is pulled from here automatically instead of being typed by
// hand every time. Matches the same pattern as ServiceMaster (IP equipment rates).
const testMasterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true }, // e.g. "CBC (Complete Blood Count)"
  category: {
    type: String,
    enum: LAB_TYPES,
    default: 'Biochemistry',
  },
  sampleType: {
    type: String,
    enum: ['blood', 'urine', 'stool', 'swab', 'sputum', 'tissue', 'other'],
    default: 'blood',
  },
  price: { type: Number, required: true, min: 0 }, // e.g. CBC = 500
  gstPercent: { type: Number, default: 0 },
  description: String,
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

testMasterSchema.index({ category: 1 });
testMasterSchema.index({ name: 'text' });

applyOrganizationScope(testMasterSchema);

module.exports = mongoose.model('TestMaster', testMasterSchema);