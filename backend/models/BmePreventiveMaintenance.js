const mongoose = require('mongoose');
const { applyOrganizationScope } = require('../plugins/organizationScope');
const Counter = require('./Counter');

const bmePmSchema = new mongoose.Schema({
  pmNumber: { type: String, unique: true },
  equipment: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  workOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'BmeWorkOrder' },
  scheduleType: {
    type: String,
    enum: ['Every 30 Days', 'Every 90 Days', 'Every 6 Months', 'Every Year', 'Custom'],
    default: 'Every 90 Days',
  },
  intervalDays: { type: Number, default: 90 },
  scheduledDate: { type: Date, required: true },
  performedDate: Date,
  startTime: Date,
  endTime: Date,
  engineer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  engineerName: String,
  checklist: [{
    label: String,
    done: { type: Boolean, default: false },
    result: String,
    remarks: String,
  }],
  result: { type: String, enum: ['Pass', 'Fail', 'Conditional', 'Pending'], default: 'Pending' },
  remarks: String,
  attachments: [{ name: String, url: String }],
  signature: String,
  status: {
    type: String,
    enum: ['Scheduled', 'In Progress', 'Completed', 'Overdue', 'Cancelled'],
    default: 'Scheduled',
  },
  nextDueDate: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

bmePmSchema.pre('save', async function (next) {
  if (!this.pmNumber) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'bmePm' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.pmNumber = `PM-${String(counter.seq).padStart(6, '0')}`;
  }
  next();
});

bmePmSchema.index({ equipment: 1, scheduledDate: 1 });
bmePmSchema.index({ status: 1 });
bmePmSchema.index({ nextDueDate: 1 });

applyOrganizationScope(bmePmSchema);

module.exports = mongoose.model('BmePreventiveMaintenance', bmePmSchema);
