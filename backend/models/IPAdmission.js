const mongoose = require('mongoose');
const { applyOrganizationScope } = require('../plugins/organizationScope');

const nursingNoteSchema = new mongoose.Schema({
  note: String,
  nurse: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  recordedAt: { type: Date, default: Date.now },
});

const SERVICE_CATEGORIES = ['Equipment', 'Procedure', 'Nursing', 'Injection', 'Laboratory', 'Other'];
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

const MED_FREQUENCIES = ['OD', 'BD', 'TD', 'QD', 'SOS', 'HS', 'AC', 'PC', 'STAT'];
const MED_ROUTES = ['oral', 'IV', 'IM', 'SC', 'topical', 'inhalation', 'sublingual'];

// One entry = one medicine administered/dispensed to this IP patient during their stay.
// Stock is deducted from pharmacy inventory the moment it's logged here (see
// ipController.addMedication), so this doubles as the ward's medicine-administration
// record AND the source pharmacy pulls into the final IP bill (see billingService.js).
const ipMedicationSchema = new mongoose.Schema({
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicineName: { type: String, required: true },
  dosage: String, // e.g. "500mg"
  frequency: { type: String, enum: MED_FREQUENCIES, default: 'OD' },
  route: { type: String, enum: MED_ROUTES, default: 'oral' },
  quantity: { type: Number, required: true, default: 1 },
  unitPrice: { type: Number, default: 0 },
  gstPercent: { type: Number, default: 0 },
  batchNumber: String,
  administeredAt: { type: Date, default: Date.now },
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

// Timed vitals chart entries for Nurse Station (separate from admission/doctor-round vitals)
const vitalRecordSchema = new mongoose.Schema({
  bloodPressure: String,
  pulse: Number,
  temperature: Number,
  oxygenSaturation: Number,
  respiratoryRate: Number,
  weight: Number,
  notes: String,
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  recordedAt: { type: Date, default: Date.now },
}, { timestamps: true });

const shiftHandoverSchema = new mongoose.Schema({
  shift: { type: String, enum: ['morning', 'afternoon', 'night'], default: 'morning' },
  fromNurse: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  toNurseName: String, // free-text when incoming nurse isn't a system user
  toNurse: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  summary: String,
  pendingTasks: String,
  handedOverAt: { type: Date, default: Date.now },
}, { timestamps: true });

const doctorOrderSchema = new mongoose.Schema({
  orderText: { type: String, required: true },
  priority: { type: String, enum: ['routine', 'stat'], default: 'routine' },
  orderedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  orderedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'acknowledged', 'done'], default: 'pending' },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  acknowledgedAt: Date,
  doneAt: Date,
  notes: String,
}, { timestamps: true });

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
  admissionVitals: {
    bloodPressure: String,
    pulse: Number,
    temperature: Number,
    weight: Number,
    oxygenSaturation: Number,
  },
  knownAllergies: String,
  status: { type: String, enum: ['admitted', 'discharged', 'transferred', 'absconded'], default: 'admitted' },
  dischargeDate: Date,
  dischargeType: { type: String, enum: ['regular', 'LAMA', 'death', 'transfer', 'absconded'] },
  dischargeSummary: String,
  dischargeDetails: {
    diagnosis: String,
    chiefComplaints: String,
    pastHistory: String,
    physicalExamination: String,
    obstetricHistory: {
      rmp: String,
      lmp: Date,
      edd: Date,
    },
    deliveryDate: Date,
    // Lab investigation table rows (printed 2-column Name/Report pairs)
    labInvestigations: [{
      name: String,
      report: String,
    }],
    investigationsNote: String, // Echo / “remaining reports with patient…”
    echoReport: String,
    treatmentGiven: String,
    procedures: String,
    clinicalFindings: String,
    hospitalCourse: String, // Course of treatment in hospital
    babyDetails: String,
    postnatalPeriod: String,
    hospitalMedications: String, // Injections given during stay
    conditionOnDischarge: String,
    pvStatus: String, // Page 3 opener e.g. P/V - Lochia healthy…
    medicationsOnDischarge: String, // Further advice on discharge drug list
    followUpAdvice: String,
    dischargeInstructions: String,
    motherWarnings: String,
    dietaryAdvice: String,
    babyWarnings: String,
    immunizationNote: String,
    supplementsAdvice: String,
    babyLabAdvice: String,
    customInstructions: String, // Free text box (replaces Tamil block)
    reviewAppointment: String,
    emergencyContact: String,
    allergyAlert: String, // Override / extra allergy line at top
    addressNote: String, // Optional address override line
    rchId: String,
    dama: { type: String, enum: ['Yes', 'No'], default: 'No' },
    referred: { type: String, enum: ['Yes', 'No'], default: 'No' },
    referredTo: String,
    absconded: { type: String, enum: ['Yes', 'No'], default: 'No' },
    death: { type: String, enum: ['Yes', 'No'], default: 'No' },
    remarks: String,
    maternityAdvice: {
      motherCondition: String,
      babyCondition: String,
      adviceChecked: [Number],
      reviewDate: String,
      dischargeDrugs: {
        iron: String,
        ironDays: String,
        calcium: String,
        calciumDays: String,
        line8: String,
        line9: String,
        line10: String,
      },
      referral: {
        facility: String,
        mode: String,
        reason: String,
        advanceNotification: { type: String, enum: ['Yes', 'No', ''], default: '' },
        accompanied: { type: String, enum: ['Yes', 'No', ''], default: '' },
      },
      referralVitals: String,
      treatmentGivenAtReferral: String,
    },
    completedAt: Date,
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  nursingNotes: [nursingNoteSchema],
  doctorRounds: [doctorRoundSchema],
  vitalRecords: [vitalRecordSchema],
  shiftHandovers: [shiftHandoverSchema],
  doctorOrders: [doctorOrderSchema],
  serviceUsages: [serviceUsageSchema], // nebulizer, ventilator, O2, injections, other bedside services/procedures
  medications: [ipMedicationSchema], // pharmacy medicines given to this IP patient during the stay (admit → discharge)
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
    transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],
  dischargeEditHistory: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    editedAt: { type: Date, default: Date.now },
    reason: String,
  }],
  admittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  estimatedStay: Number,
  totalCharges: { type: Number, default: 0 },
  // Collected at admission time; shown on the printed IP admission slip
  advanceAmount: { type: Number, default: 0 },
  advancePaymentMode: {
    type: String,
    enum: ['cash', 'card', 'upi', 'cheque', 'bank_transfer', 'other', ''],
    default: '',
  },
}, { timestamps: true });

ipAdmissionSchema.index({ patient: 1 });
ipAdmissionSchema.index({ doctor: 1 });
ipAdmissionSchema.index({ status: 1 });
ipAdmissionSchema.index({ admissionDate: -1 });

applyOrganizationScope(ipAdmissionSchema);

module.exports = mongoose.model('IPAdmission', ipAdmissionSchema);