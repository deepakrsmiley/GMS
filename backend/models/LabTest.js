const mongoose = require('mongoose');

const labResultSchema = new mongoose.Schema({
  testName: String,
  value: String,
  unit: String,
  normalRange: String,
  flag: { type: String, enum: ['Normal', 'High', 'Low', 'Critical'] },
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
  reportGeneratedAt: Date,
  reportVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

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