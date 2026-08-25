const mongoose = require('mongoose');
const { applyOrganizationScope } = require('../plugins/organizationScope');

// Additive model for Section 13 (Operation History) of the Patient 360 EMR.
// Does NOT touch any existing collection — only references them.
const consumableSchema = new mongoose.Schema({
  name: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
}, { _id: false });

const implantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  make: String,
  batchNumber: String,
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
}, { _id: false });

const operationSchema = new mongoose.Schema({
  operationNumber: { type: String, unique: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  ipAdmission: { type: mongoose.Schema.Types.ObjectId, ref: 'IPAdmission', required: true },
  operationName: { type: String, required: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  ot: { type: String }, // OT room / theatre number
  surgeon: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assistants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  anesthetist: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  anesthesiaType: { type: String, enum: ['general', 'spinal', 'local', 'regional', 'epidural', 'other'] },
  scheduledDate: Date,
  startTime: Date,
  endTime: Date,
  status: { type: String, enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'postponed'], default: 'scheduled' },
  preOpDiagnosis: String,
  postOpDiagnosis: String,
  procedureNotes: String,
  operationNotes: String,
  recoveryNotes: String,
  complications: String,
  implants: [implantSchema],
  consumables: [consumableSchema],
  bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
  totalCharges: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

operationSchema.index({ patient: 1 });
operationSchema.index({ ipAdmission: 1 });
operationSchema.index({ surgeon: 1 });
operationSchema.index({ startTime: -1 });

applyOrganizationScope(operationSchema);

module.exports = mongoose.model('Operation', operationSchema);
