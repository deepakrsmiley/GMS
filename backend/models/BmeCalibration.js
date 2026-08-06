const mongoose = require('mongoose');
const Counter = require('./Counter');

const bmeCalibrationSchema = new mongoose.Schema({
  calibrationNumber: { type: String, unique: true },
  equipment: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  workOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'BmeWorkOrder' },
  calibrationDate: { type: Date, required: true },
  calibrationStandard: { type: String, trim: true },
  measuredValue: { type: String, trim: true },
  expectedValue: { type: String, trim: true },
  tolerance: { type: String, trim: true },
  result: { type: String, enum: ['Pass', 'Fail', 'Pending'], default: 'Pending' },
  engineer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  engineerName: String,
  certificateNumber: { type: String, trim: true },
  certificateUrl: String,
  nextCalibrationDate: Date,
  intervalDays: { type: Number, default: 365 },
  remarks: String,
  attachments: [{ name: String, url: String }],
  signature: String,
  status: {
    type: String,
    enum: ['Scheduled', 'Completed', 'Failed', 'Overdue', 'Cancelled'],
    default: 'Scheduled',
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

bmeCalibrationSchema.pre('save', async function (next) {
  if (!this.calibrationNumber) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'bmeCalibration' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.calibrationNumber = `CAL-${String(counter.seq).padStart(6, '0')}`;
  }
  next();
});

bmeCalibrationSchema.index({ equipment: 1 });
bmeCalibrationSchema.index({ nextCalibrationDate: 1 });
bmeCalibrationSchema.index({ status: 1 });

module.exports = mongoose.model('BmeCalibration', bmeCalibrationSchema);
