// Run once from the backend folder:  node scripts/seedTestMaster.js
// Loads starter prices for lab packages used across Lab + Nurse Station.
// Safe to re-run: existing entries (by name) are left untouched.

const mongoose = require('mongoose');
require('dotenv').config();

const TestMaster = require('../models/TestMaster');

const STARTER_TESTS = [
  { name: 'CBC (Complete Blood Count)', category: 'Haematology', sampleType: 'blood', price: 500 },
  { name: 'Peripheral Smear', category: 'Haematology', sampleType: 'blood', price: 200 },
  { name: 'ESR', category: 'Haematology', sampleType: 'blood', price: 100 },
  { name: 'Blood Grouping & Rh', category: 'Haematology', sampleType: 'blood', price: 150 },
  { name: 'Coagulation Profile', category: 'Haematology', sampleType: 'blood', price: 600 },
  { name: 'LFT (Liver Function Test)', category: 'Biochemistry', sampleType: 'blood', price: 700 },
  { name: 'RFT (Renal Function Test)', category: 'Biochemistry', sampleType: 'blood', price: 600 },
  { name: 'Lipid Profile', category: 'Biochemistry', sampleType: 'blood', price: 500 },
  { name: 'Blood Glucose', category: 'Biochemistry', sampleType: 'blood', price: 150 },
  { name: 'Thyroid Profile', category: 'Biochemistry', sampleType: 'blood', price: 700 },
  { name: 'Bio Chemistry', category: 'Biochemistry', sampleType: 'blood', price: 800 },
  { name: 'Electrolytes', category: 'Biochemistry', sampleType: 'blood', price: 350 },
  { name: 'Widal Test', category: 'Serology', sampleType: 'blood', price: 250 },
  { name: 'Dengue Panel', category: 'Serology', sampleType: 'blood', price: 900 },
  { name: 'HIV Screening', category: 'Serology', sampleType: 'blood', price: 400 },
  { name: 'HBsAg', category: 'Serology', sampleType: 'blood', price: 300 },
  { name: 'HCV Antibody', category: 'Serology', sampleType: 'blood', price: 400 },
  { name: 'VDRL / RPR', category: 'Serology', sampleType: 'blood', price: 200 },
  { name: 'RA Factor', category: 'Serology', sampleType: 'blood', price: 250 },
  { name: 'Blood Culture', category: 'Microbiology', sampleType: 'blood', price: 800 },
  { name: 'Urine Culture', category: 'Microbiology', sampleType: 'urine', price: 500 },
  { name: 'Sputum AFB', category: 'Microbiology', sampleType: 'sputum', price: 300 },
  { name: 'Gram Stain', category: 'Microbiology', sampleType: 'swab', price: 200 },
  { name: 'Urine Routine', category: 'Urine Analysis', sampleType: 'urine', price: 150 },
  { name: 'Urine Pregnancy Test', category: 'Urine Analysis', sampleType: 'urine', price: 100 },
  { name: 'Pap Smear', category: 'Pathology', sampleType: 'other', price: 600 },
  { name: 'Histopathology (Biopsy)', category: 'Pathology', sampleType: 'tissue', price: 1500 },
  { name: 'FNAC', category: 'Pathology', sampleType: 'tissue', price: 1200 },
  { name: 'ECG', category: 'ECG', sampleType: 'other', price: 250 },
  { name: 'Chest X-Ray', category: 'X-Ray', sampleType: 'other', price: 400 },
  { name: 'X-Ray (Other)', category: 'X-Ray', sampleType: 'other', price: 350 },
  { name: 'USG Abdomen', category: 'Ultrasound', sampleType: 'other', price: 800 },
  { name: 'USG Obstetrics', category: 'Ultrasound', sampleType: 'other', price: 900 },
  { name: 'CT Brain', category: 'CT Scan', sampleType: 'other', price: 3500 },
  { name: 'MRI Brain', category: 'MRI', sampleType: 'other', price: 5500 },
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { family: 4 });
  console.log('MongoDB Connected');

  for (const t of STARTER_TESTS) {
    const existing = await TestMaster.findOne({ name: t.name });
    if (existing) {
      console.log(`Skipped (exists): ${t.name}`);
      continue;
    }
    await TestMaster.create(t);
    console.log(`Added: ${t.name} — ₹${t.price}`);
  }

  console.log('Done.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
