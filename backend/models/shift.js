const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
  shiftName: {
    type: String,
    enum: ['Morning', 'Afternoon', 'Night'],
    required: true,
  },
  openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  openedAt: { type: Date, default: Date.now },

  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closedAt: Date,

  status: { type: String, enum: ['open', 'closed'], default: 'open' },

  // Settlement is per-user, only for the person closing the shift
  settlement: {
    settledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    settledAt: Date,
    cashAmount: { type: Number, default: 0 },
    cardAmount: { type: Number, default: 0 },
    upiAmount: { type: Number, default: 0 },
    otherAmount: { type: Number, default: 0 },
    totalCollected: { type: Number, default: 0 },
    labRevenue: { type: Number, default: 0 },
    pharmacyRevenue: { type: Number, default: 0 },
    opRevenue: { type: Number, default: 0 },
    ipRevenue: { type: Number, default: 0 },
    totalBills: { type: Number, default: 0 },
    notes: String,
  },
}, { timestamps: true });

shiftSchema.index({ status: 1 });
shiftSchema.index({ openedBy: 1, status: 1 });
shiftSchema.index({ openedAt: -1 });

module.exports = mongoose.model('Shift', shiftSchema);