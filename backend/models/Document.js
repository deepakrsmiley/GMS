const mongoose = require('mongoose');
const { applyOrganizationScope } = require('../plugins/organizationScope');

// Additive model for Section 16 (Document History) of the Patient 360 EMR.
// Stores metadata + file URL (Cloudinary or any storage) for lifetime patient documents.
const DOCUMENT_CATEGORIES = [
  'Patient Photo', 'Aadhaar', 'PAN', 'Passport', 'Insurance Card',
  'Referral Letter', 'Consent Form', 'Lab Report', 'Radiology Report',
  'Prescription', 'Certificate', 'Discharge Summary', 'Invoice', 'Receipt',
  'Medical Certificate', 'Death Summary', 'Other',
];

const documentSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  category: { type: String, enum: DOCUMENT_CATEGORIES, required: true },
  title: { type: String, required: true },
  documentNumber: { type: String },
  fileUrl: { type: String, required: true },
  storageKey: { type: String, select: false }, // private disk path — never sent to clients
  fileType: String, // pdf, jpg, png, etc.
  mimeType: String,
  fileSizeKB: Number,
  originalFileName: String,
  pageCount: { type: Number, default: 1 },
  scanSource: { type: String, enum: ['scanner', 'upload', 'camera', 'url'] },
  grayscale: { type: Boolean, default: false },
  ipAdmission: { type: mongoose.Schema.Types.ObjectId, ref: 'IPAdmission' },
  opRegistration: { type: mongoose.Schema.Types.ObjectId, ref: 'OPRegistration' },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  visitDate: Date,
  notes: String,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['active', 'replaced', 'deleted'], default: 'active' },
  replaces: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
  replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
  replacedAt: Date,
  replacedByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt: Date,
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

documentSchema.index({ patient: 1, category: 1 });
documentSchema.index({ patient: 1, opRegistration: 1, category: 1 });
documentSchema.index({ createdAt: -1 });

applyOrganizationScope(documentSchema);
documentSchema.index({ documentNumber: 1, organizationId: 1 }, { unique: true, sparse: true });

const DocumentModel = mongoose.model('Document', documentSchema);
DocumentModel.CATEGORIES = DOCUMENT_CATEGORIES;

module.exports = DocumentModel;
