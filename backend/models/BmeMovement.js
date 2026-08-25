const mongoose = require('mongoose');
const { applyOrganizationScope } = require('../plugins/organizationScope');
const Counter = require('./Counter');

const locationSnapshot = {
  hospital: String,
  building: String,
  floor: String,
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  departmentName: String,
  room: String,
  ward: String,
  bed: String,
  location: String,
};

const bmeMovementSchema = new mongoose.Schema({
  movementNumber: { type: String, unique: true },
  equipment: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  from: locationSnapshot,
  to: locationSnapshot,
  reason: { type: String, required: true, trim: true },
  movedAt: { type: Date, default: Date.now },
  engineer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  engineerName: String,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedByName: String,
  receivedBy: { type: String, trim: true },
  remarks: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

bmeMovementSchema.pre('save', async function (next) {
  if (!this.movementNumber) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'bmeMovement' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.movementNumber = `MOV-${String(counter.seq).padStart(6, '0')}`;
  }
  next();
});

bmeMovementSchema.index({ equipment: 1, movedAt: -1 });

applyOrganizationScope(bmeMovementSchema);

module.exports = mongoose.model('BmeMovement', bmeMovementSchema);
