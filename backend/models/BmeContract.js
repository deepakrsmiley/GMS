const mongoose = require('mongoose');
const Counter = require('./Counter');

const bmeContractSchema = new mongoose.Schema({
  contractNumber: { type: String, unique: true },
  type: { type: String, enum: ['AMC', 'CMC'], required: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'BmeVendor', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  coverage: { type: String, trim: true },
  responseTimeHours: { type: Number, default: 24 },
  visitFrequency: { type: String, trim: true },
  machinesCovered: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }],
  cost: { type: Number, default: 0 },
  sla: { type: String, trim: true },
  status: {
    type: String,
    enum: ['Active', 'Expiring Soon', 'Expired', 'Cancelled'],
    default: 'Active',
  },
  expiryNotifiedDays: [{ type: Number }], // track which thresholds already notified
  remarks: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

bmeContractSchema.pre('save', async function (next) {
  if (!this.contractNumber) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'bmeContract' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const prefix = this.type === 'CMC' ? 'CMC' : 'AMC';
    this.contractNumber = `${prefix}-${String(counter.seq).padStart(5, '0')}`;
  }
  next();
});

bmeContractSchema.index({ endDate: 1 });
bmeContractSchema.index({ type: 1, status: 1 });

module.exports = mongoose.model('BmeContract', bmeContractSchema);
