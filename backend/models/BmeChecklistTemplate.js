const mongoose = require('mongoose');

const bmeChecklistTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['Preventive Maintenance', 'Calibration', 'Electrical Safety', 'Breakdown', 'Installation', 'Commissioning'],
    default: 'Preventive Maintenance',
  },
  category: { type: String, trim: true },
  manufacturer: { type: String, trim: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  items: [{
    label: { type: String, required: true },
    required: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  }],
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('BmeChecklistTemplate', bmeChecklistTemplateSchema);
