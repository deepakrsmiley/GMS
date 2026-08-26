const mongoose = require('mongoose');
const { applyOrganizationScope } = require('../plugins/organizationScope');

const wardSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, uppercase: true, trim: true },
  type: { type: String, enum: ['general', 'icu', 'nicu', 'emergency', 'maternity', 'pediatric', 'surgical', 'medical'], default: 'general' },
  floor: Number,
  totalBeds: { type: Number, default: 0 },
  availableBeds: { type: Number, default: 0 },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  inCharge: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  description: String,
}, { timestamps: true });

applyOrganizationScope(wardSchema);

wardSchema.index({ organizationId: 1, name: 1 }, { unique: true });
wardSchema.index(
  { organizationId: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string', $gt: '' } } },
);

module.exports = mongoose.model('Ward', wardSchema);
