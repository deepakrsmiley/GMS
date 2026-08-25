const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

counterSchema.statics.getNextSeq = async function (name, organizationId) {
  const { getContextOrganizationId } = require('../middleware/tenantContext');
  const orgId = organizationId || getContextOrganizationId();
  const key = orgId ? `${name}:${orgId}` : name;
  const counter = await this.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
