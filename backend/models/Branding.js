const mongoose = require('mongoose');

const brandingSchema = new mongoose.Schema({
  hospitalName: { type: String, trim: true, default: 'Your Hospital Name' },
  tagline: { type: String, trim: true, default: 'Healthcare Excellence' },
  logo: { type: String, trim: true },
  address: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true },
  website: { type: String, trim: true },
  gstNumber: { type: String, trim: true },
  nabhAccreditation: { type: String, trim: true },
  nablAccreditation: { type: String, trim: true },
  primaryColor: { type: String, trim: true, default: '#1e40af' },
  invoiceTerms: { type: String, trim: true },
  paymentUrl: { type: String, trim: true },
  footerNote: { type: String, trim: true, default: 'Thank you for choosing our hospital.' },
  bankName: { type: String, trim: true },
  bankBranch: { type: String, trim: true },
  bankAccount: { type: String, trim: true },
  bankIfsc: { type: String, trim: true },
  upiId: { type: String, trim: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Branding', brandingSchema);