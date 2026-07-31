const mongoose = require('mongoose');

// Hospital-configurable rate list for bedside IP services/equipment usage
// (Nebulizer, Ventilator, Oxygen/O2, Injection administration, Dressing, etc.)
// Nurses/doctors pick from this list when logging usage on an IP admission,
// so pricing stays consistent instead of being typed in free-hand each time.

const serviceMasterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true }, // e.g. "Nebulization", "Ventilator Support", "Oxygen (O2) Therapy"
  category: {
    type: String,
    enum: ['Equipment', 'Procedure', 'Nursing', 'Injection', 'Other'],
    default: 'Equipment',
  },
  chargeType: {
    type: String,
    enum: ['per_use', 'per_hour', 'per_day'],
    default: 'per_use',
  },
  defaultPrice: { type: Number, required: true, min: 0 },
  gstPercent: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

serviceMasterSchema.index({ category: 1 });

module.exports = mongoose.model('ServiceMaster', serviceMasterSchema);
