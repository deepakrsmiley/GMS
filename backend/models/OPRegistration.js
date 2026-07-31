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

const SERVICE_CATEGORIES = ['Equipment', 'Procedure', 'Nursing', 'Injection', 'Other'];
const CHARGE_TYPES = ['per_use', 'per_hour', 'per_day'];

// Equipment/procedure usage logged against an OP visit (ECG, Nebulizer, dressing,
// injection administration, etc.) - each entry is auto-picked up as its own
// billable line the next time an OP bill is generated (see billingService.js),
// exactly like IP's serviceUsages. Rates are pulled from the same ServiceMaster
// rate list used for IP admissions (Settings -> Services / Equipment Rates).
const opServiceUsageSchema = new mongoose.Schema({
  serviceName: { type: String, required: true },
  category: { type: String, enum: SERVICE_CATEGORIES, default: 'Equipment' },
  chargeType: { type: String, enum: CHARGE_TYPES, default: 'per_use' },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, required: true },
  usedAt: { type: Date, default: Date.now },
  administeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: String,
}, { timestamps: true });

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
  queueFor: { type: String, enum: ['Consultation', 'Procedure', 'Lab', 'Pharmacy', 'Follow-up'], default: 'Consultation' },
  referredBy: String,
  chiefComplaint: String,
  vitals: vitalSchema,
  consultationNotes: String,
  examinationFindings: String, // "O/E" section on the printed OP slip (Pt-Afebrile, NAD, P/A, P/V, etc.)
  investigationsAdvised: String, // e.g. "Sputum AFB, C&S + Blood Investigations"
  diagnosis: String, // printed as "Imp:" (clinical impression) on the OP slip
  prescriptions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Prescription' }],
  labTests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LabTest' }],
  followUpDate: Date,
  registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  consultationStart: Date,
  consultationEnd: Date,
  bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
  serviceUsages: [opServiceUsageSchema], // equipment/procedure charges for this OP visit (ECG, dressing, nebulizer, etc.)
}, { timestamps: true });

opRegistrationSchema.index({ patient: 1 });
opRegistrationSchema.index({ doctor: 1 });
opRegistrationSchema.index({ department: 1 });
opRegistrationSchema.index({ tokenDate: 1 });
opRegistrationSchema.index({ status: 1 });

module.exports = mongoose.model('OPRegistration', opRegistrationSchema);