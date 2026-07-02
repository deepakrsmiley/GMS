const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['info', 'success', 'warning', 'error', 'queue', 'lab', 'pharmacy', 'emergency'], default: 'info' },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  recipientRole: String,
  isRead: { type: Boolean, default: false },
  readAt: Date,
  link: String,
  relatedId: String,
  relatedModel: String,
}, { timestamps: true });

notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
