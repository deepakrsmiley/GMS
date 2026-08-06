const mongoose = require('mongoose');
const Counter = require('./Counter');

const bmeElectricalSafetySchema = new mongoose.Schema({
  testNumber: { type: String, unique: true },
  equipment: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  workOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'BmeWorkOrder' },
  testDate: { type: Date, required: true },
  earthResistance: String,
  leakageCurrent: String,
  insulationResistance: String,
  result: { type: String, enum: ['Pass', 'Fail', 'Pending'], default: 'Pending' },
  engineer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  engineerName: String,
  certificateNumber: String,
  certificateUrl: String,
  nextTestDate: Date,
  intervalDays: { type: Number, default: 365 },
  remarks: String,
  checklist: [{ label: String, done: Boolean, result: String }],
  signature: String,
  status: {
    type: String,
    enum: ['Scheduled', 'Completed', 'Failed', 'Overdue', 'Cancelled'],
    default: 'Scheduled',
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

bmeElectricalSafetySchema.pre('save', async function (next) {
  if (!this.testNumber) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'bmeElectricalSafety' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.testNumber = `EST-${String(counter.seq).padStart(6, '0')}`;
  }
  next();
});

module.exports = mongoose.model('BmeElectricalSafety', bmeElectricalSafetySchema);
