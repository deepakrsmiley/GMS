export const HOSPITAL_A_CODE = 'HOSP001';
export const HOSPITAL_B_CODE = 'HOSP002';
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

export const isSrinivasaHospital = (org) => {
  if (!org || isPlatformOrg(org)) return false;
  return String(org.code || '').toUpperCase() === HOSPITAL_B_CODE
    || /srinivasa/i.test(String(org.name || ''));
};

/** Day / month / year of birth, with age in years, months, and days. */
export const usesStructuredDob = (org, branding) => isThangamHospital(org, branding);

/** Birth year and month only, in the age column. No day of birth. */
export const usesYearMonthBirth = (org) => isSrinivasaHospital(org);

const THANGAM_NAME_RX = /thangam/i;

/** Thangam prints OP pads onto pre-printed letterhead paper. */
export const isThangamHospital = (org, branding) => {
  if (org && !isPlatformOrg(org)) {
    if (THANGAM_NAME_RX.test(String(org.name || ''))) return true;
    if (THANGAM_NAME_RX.test(String(org.code || ''))) return true;
  }
  return THANGAM_NAME_RX.test(String(branding?.hospitalName || ''));
};
