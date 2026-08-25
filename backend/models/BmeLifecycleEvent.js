const mongoose = require('mongoose');
const { applyOrganizationScope } = require('../plugins/organizationScope');

/** Immutable lifecycle / timeline events for equipment — never delete. */
const bmeLifecycleEventSchema = new mongoose.Schema({
  equipment: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  stage: {
    type: String,
    enum: [
      'Purchase Request', 'Purchase Order', 'Received', 'Installation',
      'Commissioning', 'Department Assignment', 'In Service',
      'Preventive Maintenance', 'Calibration', 'Electrical Safety',
      'Breakdown', 'Repair', 'Upgrade', 'Transfer', 'Condemned', 'Disposed',
      'Document Upload', 'Work Order', 'AMC Visit', 'CMC Visit', 'Other',
    ],
    required: true,
  },
  title: { type: String, required: true },
  description: String,
  relatedId: mongoose.Schema.Types.ObjectId,
  relatedModel: String,
  oldValue: mongoose.Schema.Types.Mixed,
  newValue: mongoose.Schema.Types.Mixed,
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByName: String,
  occurredAt: { type: Date, default: Date.now },
}, { timestamps: true });

bmeLifecycleEventSchema.index({ equipment: 1, occurredAt: -1 });

applyOrganizationScope(bmeLifecycleEventSchema);

module.exports = mongoose.model('BmeLifecycleEvent', bmeLifecycleEventSchema);
