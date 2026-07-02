const mongoose = require('mongoose');

const nursingNoteSchema = new mongoose.Schema({
  note: String,
  nurse: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  recordedAt: { type: Date, default: Date.now },
});

const SERVICE_CATEGORIES = ['Equipment', 'Procedure', 'Nursing', 'Injection', 'Other'];
const CHARGE_TYPES = ['per_use', 'per_hour', 'per_day'];

const serviceUsageSchema = new mongoose.Schema({
  serviceName: { type: String, required: true }, // e.g. Nebulizer, Ventilator, Oxygen (O2), IV Injection
  category: { type: String, enum: SERVICE_CATEGORIES, default: 'Equipment' },
  chargeType: { type: String, enum: CHARGE_TYPES, default: 'per_use' },
  quantity: { type: Number, default: 1 }, // number of uses / hours / days depending on chargeType
  unitPrice: { type: Number, required: true },
  usedAt: { type: Date, default: Date.now },
  administeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: String,
}, { timestamps: true });

const doctorRoundSchema = new mongoose.Schema({
  notes: String,
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  visitTime: { type: Date, default: Date.now },
  vitals: {
    bloodPressure: String,
    pulse: Number,
    temperature: Number,
    oxygenSaturation: Number,
  },
});

const ipAdmissionSchema = new mongoose.Schema({
  admissionNumber: { type: String, unique: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  admissionDate: { type: Date, default: Date.now },
  admissionType: { type: String, enum: ['elective', 'emergency', 'transfer'], default: 'elective' },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bed: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed' },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  ward: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward' },
  opRegistration: { type: mongoose.Schema.Types.ObjectId, ref: 'OPRegistration' },
  admissionDiagnosis: String,
  finalDiagnosis: String,
  status: { type: String, enum: ['admitted', 'discharged', 'transferred', 'absconded'], default: 'admitted' },
  dischargeDate: Date,
  dischargeType: { type: String, enum: ['regular', 'LAMA', 'death', 'transfer', 'absconded'] },
  dischargeSummary: String,
  dischargeDetails: {
    diagnosis: String,
    treatmentGiven: String,
    procedures: String,
    clinicalFindings: String,
    hospitalCourse: String,
    medicationsOnDischarge: String,
    followUpAdvice: String,
    dischargeInstructions: String,
    completedAt: Date,
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  nursingNotes: [nursingNoteSchema],
  doctorRounds: [doctorRoundSchema],
  serviceUsages: [serviceUsageSchema], // nebulizer, ventilator, O2, injections, other bedside services/procedures
  labTests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LabTest' }],
  prescriptions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Prescription' }],
  bills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bill' }],
  attendant: {
    name: String,
    relation: String,
    phone: String,
  },
  transferHistory: [{
    fromBed: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed' },
    toBed: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed' },
    transferDate: Date,
    reason: String,
  }],
  admittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  estimatedStay: Number,
  totalCharges: { type: Number, default: 0 },
}, { timestamps: true });

ipAdmissionSchema.index({ patient: 1 });
ipAdmissionSchema.index({ doctor: 1 });
ipAdmissionSchema.index({ status: 1 });
ipAdmissionSchema.index({ admissionDate: -1 });

module.exports = mongoose.model('IPAdmission', ipAdmissionSchema);
