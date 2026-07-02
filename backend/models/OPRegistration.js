const mongoose = require('mongoose');

const vitalSchema = new mongoose.Schema({
  bloodPressure: String,
  pulse: Number,
  temperature: Number,
  weight: Number,
  height: Number,
  oxygenSaturation: Number,
  respiratoryRate: Number,
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  recordedAt: { type: Date, default: Date.now },
});

const opRegistrationSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  tokenNumber: { type: String },
  tokenDate: { type: Date, default: Date.now },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  appointmentType: { type: String, enum: ['walkin', 'appointment', 'followup', 'emergency'], default: 'walkin' },
  scheduledTime: Date,
  status: {
    type: String,
    enum: [
      'waiting', 'in_consultation', 'consultation_completed', 'completed',
      'sent_to_pharmacy', 'pharmacy_completed', 'sent_to_lab', 'admitted', 'discharged',
      'cancelled', 'no_show',
    ],
    default: 'waiting',
  },
  ipAdmission: { type: mongoose.Schema.Types.ObjectId, ref: 'IPAdmission' },
  priority: { type: String, enum: ['normal', 'urgent', 'emergency'], default: 'normal' },
  chiefComplaint: String,
  vitals: vitalSchema,
  consultationNotes: String,
  diagnosis: String,
  prescriptions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Prescription' }],
  labTests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LabTest' }],
  followUpDate: Date,
  registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  consultationStart: Date,
  consultationEnd: Date,
  bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
}, { timestamps: true });

opRegistrationSchema.index({ patient: 1 });
opRegistrationSchema.index({ doctor: 1 });
opRegistrationSchema.index({ department: 1 });
opRegistrationSchema.index({ tokenDate: 1 });
opRegistrationSchema.index({ status: 1 });

module.exports = mongoose.model('OPRegistration', opRegistrationSchema);
