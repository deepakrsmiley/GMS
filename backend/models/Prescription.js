const mongoose = require('mongoose');

const prescriptionItemSchema = new mongoose.Schema({
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicineName: String,
  dosage: String,
  frequency: { type: String, enum: ['OD', 'BD', 'TD', 'QD', 'SOS', 'HS', 'AC', 'PC', 'STAT'] },
  duration: String,
  route: { type: String, enum: ['oral', 'IV', 'IM', 'SC', 'topical', 'inhalation', 'sublingual'] },
  instructions: String,
  quantity: Number,
  dispensed: { type: Boolean, default: false },
});

const prescriptionSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  opRegistration: { type: mongoose.Schema.Types.ObjectId, ref: 'OPRegistration' },
  ipAdmission: { type: mongoose.Schema.Types.ObjectId, ref: 'IPAdmission' },
  medicines: [prescriptionItemSchema],
  diagnosis: String,
  advice: String,
  followUpDate: Date,
  status: { type: String, enum: ['active', 'dispensed', 'partially_dispensed', 'cancelled'], default: 'active' },
  dispensedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dispensedAt: Date,
  bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
}, { timestamps: true });

module.exports = mongoose.model('Prescription', prescriptionSchema);
