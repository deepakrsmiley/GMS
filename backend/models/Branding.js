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

  // ------------------------------------------------------------------
  // Laboratory Report settings — everything the Lab Report Template
  // needs so report branding can change instantly with zero code edits.
  // ------------------------------------------------------------------
  labReport: {
    hospitalSubtitle: { type: String, trim: true },
    registrationNumber: { type: String, trim: true },
    nablLogo: { type: String, trim: true },
    isoLogo: { type: String, trim: true },
    watermarkLogo: { type: String, trim: true },
    hospitalTagline: { type: String, trim: true },

    // Colors (all hex)
    primaryColor: { type: String, trim: true, default: '#1e3a8a' },
    secondaryColor: { type: String, trim: true, default: '#0f766e' },
    accentColor: { type: String, trim: true, default: '#b91c1c' },
    headerBackgroundColor: { type: String, trim: true, default: '#ffffff' },
    headerTextColor: { type: String, trim: true, default: '#1e293b' },
    tableHeaderBackgroundColor: { type: String, trim: true, default: '#e2e8f0' },
    tableHeaderTextColor: { type: String, trim: true, default: '#1e293b' },
    borderColor: { type: String, trim: true, default: '#94a3b8' },
    bodyTextColor: { type: String, trim: true, default: '#0f172a' },
    reportTitleColor: { type: String, trim: true, default: '#1e3a8a' },
    highlightColor: { type: String, trim: true, default: '#fef3c7' },
    criticalColor: { type: String, trim: true, default: '#dc2626' },
    normalColor: { type: String, trim: true, default: '#16a34a' },
    footerColor: { type: String, trim: true, default: '#475569' },

    // Typography / paper
    fontFamily: { type: String, trim: true, default: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
    fontSize: { type: String, trim: true, default: '11px' },
    paperSize: { type: String, trim: true, default: 'A4' },
    printMarginMm: { type: Number, default: 10 },
    headerHeightMm: { type: Number, default: 32 },
    footerHeightMm: { type: Number, default: 14 },

    // Signatures (image URLs)
    authorizedSignature: { type: String, trim: true },
    doctorSignature: { type: String, trim: true },
    pathologistSignature: { type: String, trim: true },
    labTechnicianSignature: { type: String, trim: true },

    footerText: { type: String, trim: true, default: 'This is a computer generated report.' },

    barcodeEnabled: { type: Boolean, default: true },
    qrCodeEnabled: { type: Boolean, default: true },
    qrCodeVerificationBaseUrl: { type: String, trim: true },
  },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Branding', brandingSchema);