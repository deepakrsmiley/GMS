const Branding = require('../models/Branding');
const cloudinary = require('../config/cloudinary');
const logger = require('../utils/logger');

const SYSTEM_NAME = 'GALACTIC MEDICAL SYSTEMS';
const SYSTEM_TAGLINE = 'Hospital Management System';

const DEFAULTS = {
  hospitalName: 'Your Hospital Name',
  tagline: 'Healthcare Excellence',
  logo: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  gstNumber: '',
  nabhAccreditation: '',
  nablAccreditation: '',
  primaryColor: '#1e40af',
  invoiceTerms: 'Payment is due upon receipt. All disputes are subject to local jurisdiction. Medicines once sold will not be taken back.',
  paymentUrl: '',
  footerNote: 'Thank you for choosing our hospital.',
  bankName: '',
  bankBranch: '',
  bankAccount: '',
  bankIfsc: '',
  upiId: '',
};

const hasCloudinaryCredentials = () => (
  process.env.CLOUDINARY_CLOUD_NAME
  && process.env.CLOUDINARY_API_KEY
  && process.env.CLOUDINARY_API_SECRET
  && !process.env.CLOUDINARY_CLOUD_NAME.startsWith('your_')
  && !process.env.CLOUDINARY_API_KEY.startsWith('your_')
  && !process.env.CLOUDINARY_API_SECRET.startsWith('your_')
);

const applyDefaults = (branding) => {
  const data = branding ? branding.toObject() : {};
  return {
    systemName: SYSTEM_NAME,
    systemTagline: SYSTEM_TAGLINE,
    hospitalName: data.hospitalName || DEFAULTS.hospitalName,
    tagline: data.tagline || DEFAULTS.tagline,
    logo: data.logo || DEFAULTS.logo,
    address: data.address || DEFAULTS.address,
    phone: data.phone || DEFAULTS.phone,
    email: data.email || DEFAULTS.email,
    website: data.website || DEFAULTS.website,
    gstNumber: data.gstNumber || DEFAULTS.gstNumber,
    nabhAccreditation: data.nabhAccreditation || DEFAULTS.nabhAccreditation,
    nablAccreditation: data.nablAccreditation || DEFAULTS.nablAccreditation,
    primaryColor: data.primaryColor || DEFAULTS.primaryColor,
    invoiceTerms: data.invoiceTerms || DEFAULTS.invoiceTerms,
    paymentUrl: data.paymentUrl || DEFAULTS.paymentUrl,
    footerNote: data.footerNote || DEFAULTS.footerNote,
    bankName: data.bankName || DEFAULTS.bankName,
    bankBranch: data.bankBranch || DEFAULTS.bankBranch,
    bankAccount: data.bankAccount || DEFAULTS.bankAccount,
    bankIfsc: data.bankIfsc || DEFAULTS.bankIfsc,
    upiId: data.upiId || DEFAULTS.upiId,
    updatedAt: data.updatedAt,
    isConfigured: !!(data.hospitalName && data.hospitalName !== DEFAULTS.hospitalName),
  };
};

const uploadLogo = async (logoData, existingLogo) => {
  // If user wants to remove logo
  if (logoData === '') return '';
  
  // If no new logo provided, keep existing
  if (!logoData) return existingLogo || '';
  
  // Store base64 logo directly in database
  if (logoData.startsWith('data:')) {
    return logoData;
  }
  
  // If it's already a URL, keep it
  return logoData;
};

exports.SYSTEM_NAME = SYSTEM_NAME;
exports.SYSTEM_TAGLINE = SYSTEM_TAGLINE;
exports.DEFAULTS = DEFAULTS;

exports.getBranding = async () => {
  const branding = await Branding.findOne().sort({ updatedAt: -1 });
  return applyDefaults(branding);
};

exports.getBrandingDocument = async () => Branding.findOne().sort({ updatedAt: -1 });

exports.updateBranding = async (data, userId) => {
  const existing = await Branding.findOne().sort({ updatedAt: -1 });
  const logo = await uploadLogo(data.logo, existing?.logo);

  const updateData = {
    hospitalName: data.hospitalName?.trim() || DEFAULTS.hospitalName,
    tagline: data.tagline?.trim() || DEFAULTS.tagline,
    logo,
    address: data.address?.trim() || '',
    phone: data.phone?.trim() || '',
    email: data.email?.trim() || '',
    website: data.website?.trim() || '',
    gstNumber: data.gstNumber?.trim() || '',
    nabhAccreditation: data.nabhAccreditation?.trim() || '',
    nablAccreditation: data.nablAccreditation?.trim() || '',
    primaryColor: data.primaryColor?.trim() || DEFAULTS.primaryColor,
    invoiceTerms: data.invoiceTerms?.trim() || DEFAULTS.invoiceTerms,
    paymentUrl: data.paymentUrl?.trim() || '',
    footerNote: data.footerNote?.trim() || DEFAULTS.footerNote,
    bankName: data.bankName?.trim() || '',
    bankBranch: data.bankBranch?.trim() || '',
    bankAccount: data.bankAccount?.trim() || '',
    bankIfsc: data.bankIfsc?.trim() || '',
    upiId: data.upiId?.trim() || '',
    updatedBy: userId,
  };

  const branding = await Branding.findOneAndUpdate(
    {},
    updateData,
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  return applyDefaults(branding);
};