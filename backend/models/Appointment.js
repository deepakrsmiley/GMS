const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  appointmentDate: { type: Date, required: true },
  appointmentTime: String,
  type: { type: String, enum: ['new', 'followup', 'review'], default: 'new' },
  status: { type: String, enum: ['scheduled', 'confirmed', 'waiting', 'in_progress', 'completed', 'cancelled', 'no_show'], default: 'scheduled' },
  reason: String,
  notes: String,
  opRegistration: { type: mongoose.Schema.Types.ObjectId, ref: 'OPRegistration' },
  bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelReason: String,
  reminderSent: { type: Boolean, default: false },
}, { timestamps: true });

appointmentSchema.index({ doctor: 1, appointmentDate: 1 });
appointmentSchema.index({ patient: 1 });
appointmentSchema.index({ status: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
