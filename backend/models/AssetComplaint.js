const mongoose = require('mongoose');
const Counter = require('./Counter');

const assetComplaintSchema = new mongoose.Schema({
  complaintNumber: { type: String, unique: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  assetName: { type: String }, // denormalized for quick lookup
  assetId: { type: String },   // denormalized asset ID string
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reportedByName: { type: String },
  complaintDate: { type: Date, default: Date.now },
  problemDescription: { type: String, required: [true, 'Problem description is required'] },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium',
  },
  // Maintenance Tracking
  assignedTechnician: { type: String, trim: true },
  vendorName: { type: String, trim: true },
  repairStartDate: { type: Date },
  expectedCompletionDate: { type: Date },
  actualCompletionDate: { type: Date },
  repairCost: { type: Number, default: 0 },
  repairNotes: { type: String },
  status: {
    type: String,
    enum: ['Open', 'Assigned', 'In Progress', 'Waiting for Parts', 'Vendor Service', 'Completed', 'Closed'],
    default: 'Open',
  },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closedAt: { type: Date },
}, { timestamps: true });

// Auto-generate Complaint Number
assetComplaintSchema.pre('save', async function (next) {
  if (!this.complaintNumber) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'assetComplaint' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.complaintNumber = `CMP-${String(counter.seq).padStart(6, '0')}`;
  }
  next();
});

assetComplaintSchema.index({ status: 1 });
assetComplaintSchema.index({ priority: 1 });
assetComplaintSchema.index({ asset: 1 });
assetComplaintSchema.index({ complaintDate: -1 });

module.exports = mongoose.model('AssetComplaint', assetComplaintSchema);
