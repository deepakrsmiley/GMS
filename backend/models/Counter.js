const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

counterSchema.statics.keyFor = function (name, organizationId) {
  const { getContextOrganizationId } = require('../middleware/tenantContext');
  const orgId = organizationId || getContextOrganizationId();
  return orgId ? `${name}:${orgId}` : name;
};

counterSchema.statics.getNextSeq = async function (name, organizationId) {
  const key = this.keyFor(name, organizationId);
  const counter = await this.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
