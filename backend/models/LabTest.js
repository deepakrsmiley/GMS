const mongoose = require('mongoose');

const labResultSchema = new mongoose.Schema({
  testName: String,
  section: String,        // e.g. "HAEMATOLOGY", "BIO CHEMISTRY" — used to group rows on the report
  method: String,
  value: String,
  unit: String,
  normalRange: String,       // legacy plain-text range, kept for backward compatibility
  // Structured reference range. Either a plain string, or an object keyed
  // by demographic (male/female/child/infant/newborn/senior/default) so the
  // template/analyzer can pick the right one per patient automatically.
  referenceRange: mongoose.Schema.Types.Mixed,
  criticalLow: Number,
  criticalHigh: Number,
  remarks: String,

  // Derived automatically by labResultAnalyzer at save time — never set manually.
  flag: {
    type: String,
    enum: ['NORMAL', 'LOW', 'HIGH', 'CRITICAL_LOW', 'CRITICAL_HIGH', 'ABNORMAL', 'NA',
      // legacy values kept for backward compatibility with existing data
      'Normal', 'High', 'Low', 'Critical'],
  },
  status: { type: String, enum: ['Normal', 'Abnormal', 'Critical', 'N/A'] },
});

// All lab department types your hospital performs
const LAB_TYPES = [
  'Biochemistry',
  'Haematology',
  'Microbiology',
  'Serology',
  'Urine Analysis',
  'Radiology',
  'ECG',
  'Ultrasound',
  'X-Ray',
  'CT Scan',
  'MRI',
  'Pathology',
  'Other',
];

const labTestSchema = new mongoose.Schema({
  labNumber: { type: String, unique: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  opRegistration: { type: mongoose.Schema.Types.ObjectId, ref: 'OPRegistration' },
  ipAdmission: { type: mongoose.Schema.Types.ObjectId, ref: 'IPAdmission' },

  labType: {
    type: String,
    enum: LAB_TYPES,
    default: 'Biochemistry',
  },

  tests: [{
    testProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'TestProfile' },
    testName: { type: String, required: true },
    price: Number,
    status: {
      type: String,
      enum: ['pending', 'collected', 'processing', 'completed', 'cancelled'],
      default: 'pending',
    },
  }],

  sampleType: {
    type: String,
    enum: ['blood', 'urine', 'stool', 'swab', 'sputum', 'tissue', 'other'],
  },
  sampleCollectedAt: Date,
  sampleCollectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  status: {
    type: String,
    enum: ['pending', 'sample_collected', 'processing', 'completed', 'cancelled'],
    default: 'pending',
  },

  priority: { type: String, enum: ['routine', 'urgent', 'stat'], default: 'routine' },

  results: [labResultSchema],
  remarks: String,

  // Report-level comments / interpretation section
  interpretation: String,
  clinicalNotes: String,
  doctorComments: String,
  labComments: String,
  recommendation: String,
  impression: String,
  conclusion: String,

  sampleReceivedAt: Date,
  reportGeneratedAt: Date,
  reportVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reportApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
  totalAmount: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

labTestSchema.index({ patient: 1 });
labTestSchema.index({ status: 1 });
labTestSchema.index({ labType: 1 });
labTestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('LabTest', labTestSchema);
module.exports.LAB_TYPES = LAB_TYPES;