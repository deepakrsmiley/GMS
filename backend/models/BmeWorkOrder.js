const mongoose = require('mongoose');
const Counter = require('./Counter');

const partUsedSchema = new mongoose.Schema({
  sparePart: { type: mongoose.Schema.Types.ObjectId, ref: 'BmeSparePart' },
  name: String,
  quantity: { type: Number, default: 1 },
  unitCost: { type: Number, default: 0 },
  batch: String,
}, { _id: false });

const bmeWorkOrderSchema = new mongoose.Schema({
  workOrderNumber: { type: String, unique: true },
  type: {
    type: String,
    enum: ['Preventive Maintenance', 'Breakdown', 'Calibration', 'Electrical Safety', 'Installation', 'Commissioning', 'Vendor Visit', 'Other'],
    required: true,
  },
  equipment: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  complaint: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetComplaint' },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  engineer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  engineerName: String,
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'BmeVendor' },
  priority: { type: String, enum: ['Critical', 'High', 'Medium', 'Low'], default: 'Medium' },
  status: {
    type: String,
    enum: ['Pending', 'Assigned', 'In Progress', 'Waiting Parts', 'Waiting Approval', 'Completed', 'Cancelled'],
    default: 'Pending',
  },
  description: String,
  checklist: [{
    label: String,
    done: { type: Boolean, default: false },
    result: String,
    remarks: String,
  }],
  partsUsed: [partUsedSchema],
  startTime: Date,
  endTime: Date,
  cost: { type: Number, default: 0 },
  attachments: [{ name: String, url: String, type: String }],
  signature: String,
  photoBefore: String,
  photoAfter: String,
  voiceNoteUrl: String,
  rootCause: String,
  correctiveAction: String,
  preventiveAction: String,
  remarks: String,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

bmeWorkOrderSchema.pre('save', async function (next) {
  if (!this.workOrderNumber) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'bmeWorkOrder' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.workOrderNumber = `WO-${String(counter.seq).padStart(6, '0')}`;
  }
  next();
});

bmeWorkOrderSchema.index({ status: 1 });
bmeWorkOrderSchema.index({ equipment: 1 });
bmeWorkOrderSchema.index({ engineer: 1 });

module.exports = mongoose.model('BmeWorkOrder', bmeWorkOrderSchema);
