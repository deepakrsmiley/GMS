const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  code: { type: String, unique: true, uppercase: true },
  description: String,
  head: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  location: String,
  phone: String,
  isActive: { type: Boolean, default: true },
  consultationFee: { type: Number, default: 200 },
  color: { type: String, default: '#4F46E5' },
}, { timestamps: true });

module.exports = mongoose.model('Department', departmentSchema);
