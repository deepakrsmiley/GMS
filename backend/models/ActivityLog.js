const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  module: { type: String, required: true },
  description: String,
  ipAddress: String,
  userAgent: String,
  relatedId: String,
  relatedModel: String,
  metadata: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

activityLogSchema.index({ user: 1 });
activityLogSchema.index({ module: 1 });
activityLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
