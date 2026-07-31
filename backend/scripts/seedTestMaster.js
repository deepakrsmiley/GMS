// Run once from the backend folder:  node scripts/seedTestMaster.js
// Loads starter prices for the lab test profiles already used in the Lab page
// (frontend/src/pages/LabPage.jsx -> LAB_PROFILES). Names match exactly so the
// frontend can auto-fill the price the moment a profile is selected.
// Safe to re-run: existing entries (by name) are left untouched, only missing
// ones are added. Edit the price numbers below to match your hospital's rates.

const mongoose = require('mongoose');
require('dotenv').config();

const TestMaster = require('../models/TestMaster');

const STARTER_TESTS = [
  { name: 'CBC (Complete Blood Count)', category: 'Haematology', sampleType: 'blood', price: 500 },
  { name: 'LFT (Liver Function Test)', category: 'Biochemistry', sampleType: 'blood', price: 700 },
  { name: 'RFT (Renal Function Test)', category: 'Biochemistry', sampleType: 'blood', price: 600 },
  { name: 'Lipid Profile', category: 'Biochemistry', sampleType: 'blood', price: 500 },
  { name: 'Blood Glucose', category: 'Biochemistry', sampleType: 'blood', price: 150 },
  { name: 'Thyroid Profile', category: 'Biochemistry', sampleType: 'blood', price: 700 },
  { name: 'Urine Routine', category: 'Urine Analysis', sampleType: 'urine', price: 150 },
  { name: 'Bio Chemistry', category: 'Biochemistry', sampleType: 'blood', price: 800 },
  { name: 'ECG', category: 'ECG', sampleType: 'other', price: 250 },
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { family: 4 });
  console.log('✅ MongoDB Connected');

  for (const t of STARTER_TESTS) {
    const existing = await TestMaster.findOne({ name: t.name });
    if (existing) {
      console.log(`↷ Skipped (already exists): ${t.name}`);
      continue;
    }
    await TestMaster.create(t);
    console.log(`✔ Added: ${t.name} — ₹${t.price}`);
  }

  console.log('Done.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});