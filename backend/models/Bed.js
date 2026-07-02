const mongoose = require('mongoose');

const bedSchema = new mongoose.Schema({
  bedNumber: { type: String, required: true },
  roomNumber: String,
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  ward: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward', required: true },
  type: { type: String, enum: ['general', 'semi_private', 'private', 'icu', 'nicu', 'emergency', 'operation'], default: 'general' },
  status: { type: String, enum: ['available', 'occupied', 'cleaning', 'maintenance', 'reserved'], default: 'available' },
  currentPatient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  currentAdmission: { type: mongoose.Schema.Types.ObjectId, ref: 'IPAdmission' },
  floor: Number,
  features: [String],
  dailyRate: { type: Number, default: 500 },
  isActive: { type: Boolean, default: true },
  lastCleaned: Date,
  notes: String,
}, { timestamps: true });

bedSchema.index({ ward: 1 });
bedSchema.index({ status: 1 });
bedSchema.index({ type: 1 });

module.exports = mongoose.model('Bed', bedSchema);
