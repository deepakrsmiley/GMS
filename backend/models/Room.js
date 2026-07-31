const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomNumber: { type: String, required: true },
  ward: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward', required: true },
  type: {
    type: String,
    enum: ['general', 'semi_private', 'private', 'icu', 'nicu', 'emergency'],
    default: 'general',
  },
  floor: { type: Number, default: 1 },
  dailyCharge: { type: Number, default: 1500 },
  bedCharge: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['available', 'occupied', 'reserved', 'maintenance'],
    default: 'available',
  },
  bed: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed' },
  bedNumber: String,
  currentPatient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  currentAdmission: { type: mongoose.Schema.Types.ObjectId, ref: 'IPAdmission' },
  admissionDate: Date,
  isActive: { type: Boolean, default: true },
  notes: String,
}, { timestamps: true });

roomSchema.index({ ward: 1, status: 1 });
roomSchema.index({ type: 1, status: 1 });
roomSchema.index({ roomNumber: 1, ward: 1 }, { unique: true });

module.exports = mongoose.model('Room', roomSchema);
