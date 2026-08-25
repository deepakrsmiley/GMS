const Branding = require('../models/Branding');
const cloudinary = require('../config/cloudinary');
const { isPlatformOrg } = require('../utils/hospitalA');

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

const applyDefaults = (branding, organization) => {
  const data = branding
    ? (typeof branding.toObject === 'function' ? branding.toObject() : branding)
    : {};
  const hospitalName = data.hospitalName
    && data.hospitalName !== DEFAULTS.hospitalName
    ? data.hospitalName
    : (organization?.name || DEFAULTS.hospitalName);
  return {
    systemName: SYSTEM_NAME,
    systemTagline: SYSTEM_TAGLINE,
    hospitalName,
    tagline: data.tagline || DEFAULTS.tagline,
    logo: data.logo || organization?.logo || DEFAULTS.logo,
    address: data.address || organization?.address || DEFAULTS.address,
    phone: data.phone || organization?.phone || DEFAULTS.phone,
    email: data.email || organization?.email || DEFAULTS.email,
    website: data.website || DEFAULTS.website,
    gstNumber: data.gstNumber || organization?.gstNumber || DEFAULTS.gstNumber,
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
    labReport: data.labReport || {},
    organizationId: data.organizationId || organization?._id || null,
    developedBy: 'GMS',
    developedByLabel: 'GMS developed',
    updatedAt: data.updatedAt,
    isConfigured: !!(hospitalName && hospitalName !== DEFAULTS.hospitalName),
  };
};

const uploadLogo = async (logoData, existingLogo) => {
  if (logoData === '') return '';
  if (!logoData) return existingLogo || '';
  if (logoData.startsWith('data:')) {
    return logoData;
  }
  return logoData;
};

exports.SYSTEM_NAME = SYSTEM_NAME;
exports.SYSTEM_TAGLINE = SYSTEM_TAGLINE;
exports.SYSTEM_SHORT_NAME = 'GMS';
exports.DEFAULTS = DEFAULTS;

exports.getPublicBranding = () => ({
  systemName: SYSTEM_NAME,
  systemTagline: SYSTEM_TAGLINE,
  hospitalName: SYSTEM_NAME,
  tagline: SYSTEM_TAGLINE,
  logo: '',
  isPublic: true,
  developedBy: 'GMS',
  developedByLabel: 'GMS developed',
});

exports.getBranding = async (req) => {
  if (isPlatformOrg(req?.organization)) {
    return exports.getPublicBranding();
  }
  const branding = await Branding.findOne().sort({ updatedAt: -1 });
  return applyDefaults(branding, req?.organization);
};

exports.getBrandingDocument = async () => Branding.findOne().sort({ updatedAt: -1 });

exports.updateBranding = async (data, userId, req) => {
  if (!req?.organizationId || isPlatformOrg(req?.organization)) {
    const error = new Error('Select a client hospital before updating branding. GMS is the Super Admin organization.');
    error.statusCode = 400;
    throw error;
  }

  const existing = await Branding.findOne().sort({ updatedAt: -1 });
  const logo = await uploadLogo(data.logo, existing?.logo);

  const updateData = {
    hospitalName: data.hospitalName?.trim() || req?.organization?.name || DEFAULTS.hospitalName,
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
    organizationId: req.organizationId,
  };

  if (data.labReport && typeof data.labReport === 'object') {
    updateData.labReport = data.labReport;
  }

  if (existing) {
    Object.assign(existing, updateData);
    await existing.save();
    return applyDefaults(existing, req.organization);
  }

  const created = await Branding.create(updateData);
  return applyDefaults(created, req.organization);
};
