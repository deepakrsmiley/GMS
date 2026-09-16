export const HOSPITAL_A_CODE = 'HOSP001';
export const PLATFORM_CODE = 'GMS';

export const isPlatformOrg = (org) => {
  if (!org) return false;
  if (org.kind === 'platform') return true;
  return String(org.code || '').toUpperCase() === PLATFORM_CODE;
};

export const isClientOrg = (org) => !!(org && !isPlatformOrg(org));

export const isSriSanjeeviHospital = (org) => {
  if (!org || isPlatformOrg(org)) return false;
  return String(org.code || '').toUpperCase() === HOSPITAL_A_CODE
    || /sanjeevi/i.test(String(org.name || ''));
};

const THANGAM_NAME_RX = /thangam/i;

/** Thangam prints OP pads onto pre-printed letterhead paper. */
export const isThangamHospital = (org, branding) => {
  if (org && !isPlatformOrg(org)) {
    if (THANGAM_NAME_RX.test(String(org.name || ''))) return true;
    if (THANGAM_NAME_RX.test(String(org.code || ''))) return true;
  }
  return THANGAM_NAME_RX.test(String(branding?.hospitalName || ''));
};
