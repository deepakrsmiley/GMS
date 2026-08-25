/**
 * Shared lab package catalog for Lab desk, Reception/Nurse requests, and result entry.
 * Each package has labType + parameter rows (unit / normalRange).
 */

export const LAB_TYPES = [
  'Haematology',
  'Biochemistry',
  'Serology',
  'Microbiology',
  'Urine Analysis',
  'Pathology',
  'ECG',
  'Radiology',
  'X-Ray',
  'Ultrasound',
  'CT Scan',
  'MRI',
  'Other',
];

/** @type {Record<string, { labType: string, sampleType?: string, tests: { testName: string, unit?: string, normalRange?: string }[] }>} */
export const LAB_PROFILES = {
  'CBC (Complete Blood Count)': {
    labType: 'Haematology',
    sampleType: 'blood',
    tests: [
      { testName: 'WBC', unit: '10³/mm³', normalRange: '4.1 – 11.1' },
      { testName: 'LYM%', unit: '%', normalRange: '16.0 – 46.0' },
      { testName: 'MON%', unit: '%', normalRange: '2.3 – 8.5' },
      { testName: 'GRA%', unit: '%', normalRange: '48.7 – 81.2' },
      { testName: 'LYM#', unit: '10³/mm³', normalRange: '1.20 – 3.70' },
      { testName: 'MON#', unit: '10³/mm³', normalRange: '0.10 – 0.60' },
      { testName: 'GRA#', unit: '10³/mm³', normalRange: '2.30 – 8.20' },
      { testName: 'GLR', unit: '', normalRange: '' },
      { testName: 'RBC', unit: '10⁶/mm³', normalRange: '3.90 – 5.20' },
      { testName: 'HGB', unit: 'g/dl', normalRange: '12.0 – 15.1' },
      { testName: 'HCT', unit: '%', normalRange: '36.4 – 46.0' },
      { testName: 'MCV', unit: 'μm³', normalRange: '83 – 96' },
      { testName: 'MCH', unit: 'pg', normalRange: '26.4 – 32.3' },
      { testName: 'MCHC', unit: 'g/dl', normalRange: '31.8 – 34.2' },
      { testName: 'RDW-CV', unit: '%', normalRange: '11.9 – 14.4' },
      { testName: 'RDW-SD', unit: 'μm³', normalRange: '38 – 49' },
      { testName: 'PLT', unit: '10³/mm³', normalRange: '168 – 418' },
      { testName: 'MPV', unit: 'μm³', normalRange: '7.0 – 10.5' },
      { testName: 'PCT', unit: 'L %', normalRange: '0.150 – 0.500' },
      { testName: 'PDW', unit: '%', normalRange: '11.0 – 18.0' },
      { testName: 'P-LCC', unit: '10³/mm³', normalRange: '44 – 140' },
      { testName: 'P-LCR', unit: '%', normalRange: '18.0 – 50.0' },
    ],
  },
  'Peripheral Smear': {
    labType: 'Haematology',
    sampleType: 'blood',
    tests: [
      { testName: 'RBC Morphology', unit: '', normalRange: 'Normocytic Normochromic' },
      { testName: 'WBC Morphology', unit: '', normalRange: 'Normal' },
      { testName: 'Platelet Estimate', unit: '', normalRange: 'Adequate' },
      { testName: 'Parasites', unit: '', normalRange: 'Not Seen' },
      { testName: 'Impression', unit: '', normalRange: '' },
    ],
  },
  'ESR': {
    labType: 'Haematology',
    sampleType: 'blood',
    tests: [{ testName: 'ESR', unit: 'mm/hr', normalRange: '0 – 20' }],
  },
  'Blood Grouping & Rh': {
    labType: 'Haematology',
    sampleType: 'blood',
    tests: [
      { testName: 'ABO Group', unit: '', normalRange: '' },
      { testName: 'Rh (D)', unit: '', normalRange: '' },
    ],
  },
  'Coagulation Profile': {
    labType: 'Haematology',
    sampleType: 'blood',
    tests: [
      { testName: 'PT', unit: 'sec', normalRange: '11 – 13.5' },
      { testName: 'INR', unit: '', normalRange: '0.8 – 1.2' },
      { testName: 'aPTT', unit: 'sec', normalRange: '25 – 35' },
      { testName: 'Bleeding Time', unit: 'min', normalRange: '2 – 7' },
      { testName: 'Clotting Time', unit: 'min', normalRange: '4 – 10' },
    ],
  },
  'LFT (Liver Function Test)': {
    labType: 'Biochemistry',
    sampleType: 'blood',
    tests: [
      { testName: 'Total Bilirubin', unit: 'mg/dL', normalRange: '0.2 – 1.2' },
      { testName: 'Direct Bilirubin', unit: 'mg/dL', normalRange: '0.0 – 0.3' },
      { testName: 'Indirect Bilirubin', unit: 'mg/dL', normalRange: '0.2 – 0.9' },
      { testName: 'SGOT (AST)', unit: 'U/L', normalRange: '10 – 40' },
      { testName: 'SGPT (ALT)', unit: 'U/L', normalRange: '7 – 56' },
      { testName: 'ALP', unit: 'U/L', normalRange: '44 – 147' },
      { testName: 'Total Protein', unit: 'g/dL', normalRange: '6.0 – 8.3' },
      { testName: 'Albumin', unit: 'g/dL', normalRange: '3.5 – 5.0' },
      { testName: 'Globulin', unit: 'g/dL', normalRange: '2.3 – 3.5' },
      { testName: 'A/G Ratio', unit: '', normalRange: '1.0 – 2.5' },
    ],
  },
  'RFT (Renal Function Test)': {
    labType: 'Biochemistry',
    sampleType: 'blood',
    tests: [
      { testName: 'Blood Urea', unit: 'mg/dL', normalRange: '15 – 45' },
      { testName: 'Serum Creatinine', unit: 'mg/dL', normalRange: '0.6 – 1.2' },
      { testName: 'Uric Acid', unit: 'mg/dL', normalRange: '2.4 – 7.0' },
      { testName: 'Sodium (Na+)', unit: 'mEq/L', normalRange: '136 – 145' },
      { testName: 'Potassium (K+)', unit: 'mEq/L', normalRange: '3.5 – 5.0' },
      { testName: 'Chloride (Cl-)', unit: 'mEq/L', normalRange: '98 – 107' },
      { testName: 'Bicarbonate', unit: 'mEq/L', normalRange: '22 – 29' },
      { testName: 'BUN', unit: 'mg/dL', normalRange: '7 – 21' },
      { testName: 'eGFR', unit: 'mL/min/1.73m²', normalRange: '>60' },
    ],
  },
  'Lipid Profile': {
    labType: 'Biochemistry',
    sampleType: 'blood',
    tests: [
      { testName: 'Total Cholesterol', unit: 'mg/dL', normalRange: '<200' },
      { testName: 'HDL Cholesterol', unit: 'mg/dL', normalRange: '>40' },
      { testName: 'LDL Cholesterol', unit: 'mg/dL', normalRange: '<100' },
      { testName: 'VLDL Cholesterol', unit: 'mg/dL', normalRange: '5 – 40' },
      { testName: 'Triglycerides', unit: 'mg/dL', normalRange: '<150' },
      { testName: 'Total/HDL Ratio', unit: '', normalRange: '<5.0' },
    ],
  },
  'Blood Glucose': {
    labType: 'Biochemistry',
    sampleType: 'blood',
    tests: [
      { testName: 'Fasting Blood Glucose', unit: 'mg/dL', normalRange: '70 – 100' },
      { testName: 'Post Prandial (PP)', unit: 'mg/dL', normalRange: '<140' },
      { testName: 'Random Blood Glucose', unit: 'mg/dL', normalRange: '70 – 140' },
      { testName: 'HbA1c', unit: '%', normalRange: '4.0 – 5.6' },
    ],
  },
  'Thyroid Profile': {
    labType: 'Biochemistry',
    sampleType: 'blood',
    tests: [
      { testName: 'T3 (Total)', unit: 'ng/dL', normalRange: '80 – 200' },
      { testName: 'T4 (Total)', unit: 'μg/dL', normalRange: '5.1 – 14.1' },
      { testName: 'TSH', unit: 'μIU/mL', normalRange: '0.4 – 4.0' },
      { testName: 'Free T3 (FT3)', unit: 'pg/mL', normalRange: '2.0 – 4.4' },
      { testName: 'Free T4 (FT4)', unit: 'ng/dL', normalRange: '0.8 – 1.8' },
    ],
  },
  'Bio Chemistry': {
    labType: 'Biochemistry',
    sampleType: 'blood',
    tests: [
      { testName: 'Calcium', unit: 'mg/dL', normalRange: '8.5 – 10.5' },
      { testName: 'Phosphorus', unit: 'mg/dL', normalRange: '2.5 – 4.5' },
      { testName: 'Magnesium', unit: 'mEq/L', normalRange: '1.5 – 2.5' },
      { testName: 'Iron (Serum)', unit: 'μg/dL', normalRange: '60 – 170' },
      { testName: 'TIBC', unit: 'μg/dL', normalRange: '250 – 370' },
      { testName: 'Ferritin', unit: 'ng/mL', normalRange: '12 – 300' },
      { testName: 'Vitamin B12', unit: 'pg/mL', normalRange: '200 – 900' },
      { testName: 'Vitamin D (25-OH)', unit: 'ng/mL', normalRange: '30 – 100' },
      { testName: 'CRP (C-Reactive Protein)', unit: 'mg/L', normalRange: '<5' },
      { testName: 'ESR', unit: 'mm/hr', normalRange: '0 – 20' },
    ],
  },
  'Electrolytes': {
    labType: 'Biochemistry',
    sampleType: 'blood',
    tests: [
      { testName: 'Sodium (Na+)', unit: 'mEq/L', normalRange: '136 – 145' },
      { testName: 'Potassium (K+)', unit: 'mEq/L', normalRange: '3.5 – 5.0' },
      { testName: 'Chloride (Cl-)', unit: 'mEq/L', normalRange: '98 – 107' },
      { testName: 'Bicarbonate', unit: 'mEq/L', normalRange: '22 – 29' },
    ],
  },
  'Widal Test': {
    labType: 'Serology',
    sampleType: 'blood',
    tests: [
      { testName: 'S. Typhi O', unit: 'titre', normalRange: '<1:80' },
      { testName: 'S. Typhi H', unit: 'titre', normalRange: '<1:160' },
      { testName: 'S. Paratyphi AH', unit: 'titre', normalRange: '<1:80' },
      { testName: 'S. Paratyphi BH', unit: 'titre', normalRange: '<1:80' },
    ],
  },
  'Dengue Panel': {
    labType: 'Serology',
    sampleType: 'blood',
    tests: [
      { testName: 'Dengue NS1', unit: '', normalRange: 'Negative' },
      { testName: 'Dengue IgM', unit: '', normalRange: 'Negative' },
      { testName: 'Dengue IgG', unit: '', normalRange: 'Negative' },
    ],
  },
  'HIV Screening': {
    labType: 'Serology',
    sampleType: 'blood',
    tests: [{ testName: 'HIV Antibody', unit: '', normalRange: 'Non-Reactive' }],
  },
  'HBsAg': {
    labType: 'Serology',
    sampleType: 'blood',
    tests: [{ testName: 'HBsAg', unit: '', normalRange: 'Non-Reactive' }],
  },
  'HCV Antibody': {
    labType: 'Serology',
    sampleType: 'blood',
    tests: [{ testName: 'Anti-HCV', unit: '', normalRange: 'Non-Reactive' }],
  },
  'VDRL / RPR': {
    labType: 'Serology',
    sampleType: 'blood',
    tests: [{ testName: 'VDRL / RPR', unit: '', normalRange: 'Non-Reactive' }],
  },
  'RA Factor': {
    labType: 'Serology',
    sampleType: 'blood',
    tests: [{ testName: 'RA Factor', unit: 'IU/mL', normalRange: '<14' }],
  },
  'Blood Culture': {
    labType: 'Microbiology',
    sampleType: 'blood',
    tests: [
      { testName: 'Culture Result', unit: '', normalRange: 'No Growth' },
      { testName: 'Organism', unit: '', normalRange: '' },
      { testName: 'Sensitivity', unit: '', normalRange: '' },
    ],
  },
  'Urine Culture': {
    labType: 'Microbiology',
    sampleType: 'urine',
    tests: [
      { testName: 'Colony Count', unit: 'CFU/mL', normalRange: '<10⁵' },
      { testName: 'Organism', unit: '', normalRange: '' },
      { testName: 'Sensitivity', unit: '', normalRange: '' },
    ],
  },
  'Sputum AFB': {
    labType: 'Microbiology',
    sampleType: 'sputum',
    tests: [
      { testName: 'AFB Smear', unit: '', normalRange: 'Negative' },
      { testName: 'Grading', unit: '', normalRange: '' },
    ],
  },
  'Gram Stain': {
    labType: 'Microbiology',
    sampleType: 'swab',
    tests: [
      { testName: 'Gram Stain Finding', unit: '', normalRange: '' },
      { testName: 'Organisms Seen', unit: '', normalRange: '' },
    ],
  },
  'Urine Routine': {
    labType: 'Urine Analysis',
    sampleType: 'urine',
    tests: [
      { testName: 'Colour', unit: '', normalRange: 'Pale Yellow' },
      { testName: 'Appearance', unit: '', normalRange: 'Clear' },
      { testName: 'pH', unit: '', normalRange: '4.5 – 8.5' },
      { testName: 'Specific Gravity', unit: '', normalRange: '1.005 – 1.030' },
      { testName: 'Protein', unit: '', normalRange: 'Nil' },
      { testName: 'Glucose', unit: '', normalRange: 'Nil' },
      { testName: 'Ketones', unit: '', normalRange: 'Nil' },
      { testName: 'Blood', unit: '', normalRange: 'Nil' },
      { testName: 'Bilirubin', unit: '', normalRange: 'Nil' },
      { testName: 'Pus Cells (WBC)', unit: '/HPF', normalRange: '0 – 5' },
      { testName: 'RBC', unit: '/HPF', normalRange: '0 – 2' },
      { testName: 'Epithelial Cells', unit: '/HPF', normalRange: 'Few' },
      { testName: 'Casts', unit: '', normalRange: 'Nil' },
      { testName: 'Crystals', unit: '', normalRange: 'Nil' },
      { testName: 'Bacteria', unit: '', normalRange: 'Nil' },
    ],
  },
  'Urine Pregnancy Test': {
    labType: 'Urine Analysis',
    sampleType: 'urine',
    tests: [{ testName: 'hCG (Urine)', unit: '', normalRange: 'Negative' }],
  },
  'Pap Smear': {
    labType: 'Pathology',
    sampleType: 'other',
    tests: [
      { testName: 'Specimen Adequacy', unit: '', normalRange: 'Satisfactory' },
      { testName: 'Interpretation', unit: '', normalRange: '' },
      { testName: 'Recommendation', unit: '', normalRange: '' },
    ],
  },
  'Histopathology (Biopsy)': {
    labType: 'Pathology',
    sampleType: 'tissue',
    tests: [
      { testName: 'Gross Description', unit: '', normalRange: '' },
      { testName: 'Microscopy', unit: '', normalRange: '' },
      { testName: 'Diagnosis', unit: '', normalRange: '' },
    ],
  },
  'FNAC': {
    labType: 'Pathology',
    sampleType: 'tissue',
    tests: [
      { testName: 'Site', unit: '', normalRange: '' },
      { testName: 'Cytology', unit: '', normalRange: '' },
      { testName: 'Impression', unit: '', normalRange: '' },
    ],
  },
  'ECG': {
    labType: 'ECG',
    sampleType: 'other',
    tests: [
      { testName: 'Heart Rate', unit: 'bpm', normalRange: '60 – 100' },
      { testName: 'PR Interval', unit: 'ms', normalRange: '120 – 200' },
      { testName: 'QRS Duration', unit: 'ms', normalRange: '60 – 100' },
      { testName: 'QT Interval', unit: 'ms', normalRange: '350 – 440' },
      { testName: 'QTc', unit: 'ms', normalRange: '<450' },
      { testName: 'Rhythm', unit: '', normalRange: 'Normal Sinus Rhythm' },
      { testName: 'Axis', unit: '', normalRange: '-30° to +90°' },
    ],
  },
  'Chest X-Ray': {
    labType: 'X-Ray',
    sampleType: 'other',
    tests: [
      { testName: 'Views', unit: '', normalRange: '' },
      { testName: 'Findings', unit: '', normalRange: '' },
      { testName: 'Impression', unit: '', normalRange: '' },
    ],
  },
  'X-Ray (Other)': {
    labType: 'X-Ray',
    sampleType: 'other',
    tests: [
      { testName: 'Region', unit: '', normalRange: '' },
      { testName: 'Findings', unit: '', normalRange: '' },
      { testName: 'Impression', unit: '', normalRange: '' },
    ],
  },
  'USG Abdomen': {
    labType: 'Ultrasound',
    sampleType: 'other',
    tests: [
      { testName: 'Liver', unit: '', normalRange: 'Normal' },
      { testName: 'Gall Bladder', unit: '', normalRange: 'Normal' },
      { testName: 'Pancreas', unit: '', normalRange: 'Normal' },
      { testName: 'Spleen', unit: '', normalRange: 'Normal' },
      { testName: 'Kidneys', unit: '', normalRange: 'Normal' },
      { testName: 'Impression', unit: '', normalRange: '' },
    ],
  },
  'USG Obstetrics': {
    labType: 'Ultrasound',
    sampleType: 'other',
    tests: [
      { testName: 'Gestational Age', unit: 'weeks', normalRange: '' },
      { testName: 'Fetal Heart', unit: '', normalRange: 'Present' },
      { testName: 'Placenta', unit: '', normalRange: '' },
      { testName: 'Liquor', unit: '', normalRange: 'Adequate' },
      { testName: 'Impression', unit: '', normalRange: '' },
    ],
  },
  'CT Brain': {
    labType: 'CT Scan',
    sampleType: 'other',
    tests: [
      { testName: 'Technique', unit: '', normalRange: '' },
      { testName: 'Findings', unit: '', normalRange: '' },
      { testName: 'Impression', unit: '', normalRange: '' },
    ],
  },
  'MRI Brain': {
    labType: 'MRI',
    sampleType: 'other',
    tests: [
      { testName: 'Sequences', unit: '', normalRange: '' },
      { testName: 'Findings', unit: '', normalRange: '' },
      { testName: 'Impression', unit: '', normalRange: '' },
    ],
  },
  'Custom / Manual': {
    labType: 'Other',
    sampleType: 'blood',
    tests: [],
  },
};

export const LAB_PROFILE_OPTIONS = Object.keys(LAB_PROFILES);
export const OTHER_PROFILE = 'Custom / Manual';

export const profilesForType = (labType) =>
  LAB_PROFILE_OPTIONS.filter((name) => LAB_PROFILES[name]?.labType === labType);

/** Catalog packages for a type, plus Other at the end so missing tests can be typed in. */
export const profilesForTypeWithOther = (labType) => {
  if (!labType || labType === 'Other') return [OTHER_PROFILE];
  return [
    ...profilesForType(labType).filter((n) => n !== OTHER_PROFILE),
    OTHER_PROFILE,
  ];
};

export const findMatchingProfile = (query) => {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return null;
  const names = LAB_PROFILE_OPTIONS.filter((n) => n !== OTHER_PROFILE);
  return names.find((n) => n.toLowerCase() === q)
    || names.find((n) => n.toLowerCase().startsWith(q))
    || names.find((n) => n.toLowerCase().includes(q))
    || null;
};

/** Build billable + report rows for an Other / unlisted lab. */
export const buildOtherLabTests = (name, price = 0, extras = {}) => {
  const trimmed = String(name || '').trim();
  const amount = Number(price) || 0;
  if (!trimmed) return { profileName: '', matched: false, tests: [], totalAmount: 0 };

  const matchedProfile = findMatchingProfile(trimmed);
  if (matchedProfile) {
    const p = amount || Number(extras.priceMap?.[matchedProfile]) || 0;
    const expanded = expandProfilesToTests([matchedProfile], { [matchedProfile]: p });
    return {
      profileName: matchedProfile,
      matched: true,
      tests: expanded.tests,
      totalAmount: expanded.totalAmount || p,
    };
  }

  const master = (extras.testMaster || []).find(
    (t) => String(t.name || '').toLowerCase() === trimmed.toLowerCase(),
  );
  const p = amount || Number(master?.price) || 0;
  return {
    profileName: trimmed,
    matched: false,
    tests: [
      { testName: trimmed, price: p, profileName: trimmed, unit: '', normalRange: '' },
      { testName: 'Findings', price: 0, profileName: trimmed, unit: '', normalRange: '' },
      { testName: 'Impression', price: 0, profileName: trimmed, unit: '', normalRange: '' },
    ],
    totalAmount: p,
  };
};

export const getProfileTests = (profileName) => {
  const p = LAB_PROFILES[profileName];
  if (!p) return [];
  return Array.isArray(p) ? p : (p.tests || []);
};

export const getProfileMeta = (profileName) => {
  const p = LAB_PROFILES[profileName];
  if (!p) return { labType: 'Other', sampleType: 'blood', tests: [] };
  if (Array.isArray(p)) return { labType: 'Other', sampleType: 'blood', tests: p };
  return p;
};

export const TEST_META_LOOKUP = Object.values(LAB_PROFILES)
  .flatMap((p) => (Array.isArray(p) ? p : p.tests || []))
  .reduce((map, t) => {
    if (t?.testName && !map[t.testName]) {
      map[t.testName] = { unit: t.unit || '', normalRange: t.normalRange || '' };
    }
    return map;
  }, {});

export const getTestMeta = (testName, profileFields = []) => {
  const inProfile = profileFields.find((p) => p.testName === testName);
  if (inProfile && (inProfile.unit || inProfile.normalRange)) return inProfile;
  return TEST_META_LOOKUP[testName] || { unit: '', normalRange: '' };
};

/** Expand selected package names into billable/result test rows */
export const expandProfilesToTests = (profileNames, priceByProfile = {}) => {
  const tests = [];
  let totalAmount = 0;
  (profileNames || []).forEach((name) => {
    if (name === 'Custom / Manual') return;
    const price = Number(priceByProfile[name]) || 0;
    totalAmount += price;
    const rows = getProfileTests(name);
    if (!rows.length) {
      tests.push({ testName: name, price, profileName: name });
    } else {
      rows.forEach((row, idx) => {
        tests.push({
          testName: row.testName,
          price: idx === 0 ? price : 0,
          profileName: name,
          unit: row.unit || '',
          normalRange: row.normalRange || '',
        });
      });
    }
  });
  return { tests, totalAmount };
};

export const STATUS_LABELS = {
  pending: 'Requested',
  sample_collected: 'Sample Collected',
  processing: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const ORDER_SOURCE_LABELS = {
  reception: 'Reception / OP',
  lab_desk: 'Lab Desk',
  nurse_ip: 'Nurse Station / IP',
  doctor: 'Doctor',
  other: 'Other',
};
