const mongoose = require('mongoose');
const { applyOrganizationScope } = require('../plugins/organizationScope');

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, uppercase: true, trim: true },
  description: String,
  head: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  location: String,
  phone: String,
  isActive: { type: Boolean, default: true },
  consultationFee: { type: Number, default: 200 },
  color: { type: String, default: '#4F46E5' },
}, { timestamps: true });

applyOrganizationScope(departmentSchema);

departmentSchema.index({ organizationId: 1, name: 1 }, { unique: true });
departmentSchema.index(
  { organizationId: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string', $gt: '' } } },
);

module.exports = mongoose.model('Department', departmentSchema);
