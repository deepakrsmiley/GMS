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
  fileUrl: { type: String, required: true },
  fileType: String, // pdf, jpg, png, etc.
  fileSizeKB: Number,
  ipAdmission: { type: mongoose.Schema.Types.ObjectId, ref: 'IPAdmission' },
  opRegistration: { type: mongoose.Schema.Types.ObjectId, ref: 'OPRegistration' },
  notes: String,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

documentSchema.index({ patient: 1, category: 1 });
documentSchema.index({ createdAt: -1 });

applyOrganizationScope(documentSchema);

const DocumentModel = mongoose.model('Document', documentSchema);
DocumentModel.CATEGORIES = DOCUMENT_CATEGORIES;

module.exports = DocumentModel;
