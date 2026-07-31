const mongoose = require('mongoose');

const wardSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  code: { type: String, unique: true, uppercase: true },
  type: { type: String, enum: ['general', 'icu', 'nicu', 'emergency', 'maternity', 'pediatric', 'surgical', 'medical'], default: 'general' },
  floor: Number,
  totalBeds: { type: Number, default: 0 },
  availableBeds: { type: Number, default: 0 },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  inCharge: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  description: String,
}, { timestamps: true });

module.exports = mongoose.model('Ward', wardSchema);
