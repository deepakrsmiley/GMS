/**
 * Discharge summary print: keep Tamil glyphs and do not throw on Unicode text.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { pdfSafe, dischargeSectionOn, pickDischargeHeader, formatDischargePhone } = require('../utils/dischargePrint');
const { generateDischargeSummaryPDF } = require('../utils/pdfGenerator');

describe('discharge print unicode', () => {
  it('keeps Tamil letters instead of stripping them', () => {
    const text = 'நோயாளிக்கு ஓய்வு எடுக்கவும். Continue TAB TETRAFAST.';
    assert.match(pdfSafe(text), /நோயாளிக்கு/);
    assert.match(pdfSafe(text), /ஓய்வு/);
    assert.match(pdfSafe(text), /Continue TAB TETRAFAST/);
  });

  it('prints Tamil and a fixed delivery time without error', async () => {
    const chunks = [];
    const res = new PassThrough();
    res.setHeader = () => {};
    res.on('data', (chunk) => chunks.push(chunk));

    const admission = {
      _id: '64a000000000000000000001',
      admissionNumber: 'IP-TEST-1',
      admissionDate: new Date('2026-09-17T04:30:00.000Z'),
      dischargeDate: new Date('2026-09-19T06:30:00.000Z'),
      patient: { name: 'முருகன்', age: 28, gender: 'Female', patientId: 'UHID1' },
      doctor: { name: 'Test Doctor', specialization: 'OG' },
      department: { name: 'OG' },
      dischargeDetails: {
        printSections: { deliveryDate: true, customInstructions: true, diagnosis: true },
        deliveryDate: '2026-09-19T12:00',
        diagnosis: 'Primi with safe confinement',
        customInstructions: 'தயவுசெய்து மாத்திரை காலை மாலை சாப்பிடவும்.',
      },
    };

    await new Promise((resolve, reject) => {
      res.on('finish', resolve);
      res.on('error', reject);
      generateDischargeSummaryPDF(admission, res, { hospitalName: 'Sri Sanjeevi Hospital', address: 'Tamil Nadu' })
        .catch(reject);
    });

    const pdf = Buffer.concat(chunks);
    assert.ok(pdf.length > 500, 'PDF should have content');
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  });

  it('defaults patient header print keys on when they are missing', () => {
    const saved = { diagnosis: true };
    assert.equal(dischargeSectionOn(saved, 'patientName'), true);
    assert.equal(dischargeSectionOn(saved, 'ipNo'), true);
    assert.equal(dischargeSectionOn(saved, 'doa'), true);
    assert.equal(dischargeSectionOn(saved, 'diagnosis'), true);
    assert.equal(dischargeSectionOn(saved, 'chiefComplaints'), false);
    assert.equal(dischargeSectionOn({ patientName: false }, 'patientName'), false);
    assert.equal(dischargeSectionOn(null, 'patientName'), true);
  });

  it('omits hidden patient header fields without throwing', async () => {
    const chunks = [];
    const res = new PassThrough();
    res.setHeader = () => {};
    res.on('data', (chunk) => chunks.push(chunk));

    const admission = {
      _id: '64a000000000000000000002',
      admissionNumber: 'IP-TEST-2',
      admissionDate: new Date('2026-09-17T04:30:00.000Z'),
      dischargeDate: new Date('2026-09-19T06:30:00.000Z'),
      patient: {
        name: 'Hidden Name',
        age: 40,
        gender: 'Male',
        patientId: 'UHID-HIDE',
        phone: '9999999999',
        address: { street: 'Test Street', city: 'Chennai' },
      },
      doctor: { name: 'Test Doctor', specialization: 'OG' },
      department: { name: 'OG' },
      dischargeDetails: {
        printSections: {
          patientName: false,
          ageSex: false,
          phone: false,
          uhid: false,
          address: false,
          diagnosis: true,
        },
        diagnosis: 'Test diagnosis',
      },
    };

    await new Promise((resolve, reject) => {
      res.on('finish', resolve);
      res.on('error', reject);
      generateDischargeSummaryPDF(admission, res, { hospitalName: 'Sri Sanjeevi Hospital', address: 'Tamil Nadu' })
        .catch(reject);
    });

    const pdf = Buffer.concat(chunks);
    assert.ok(pdf.length > 500, 'PDF should have content');
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  });

  it('uses an edited patient name when printPatient is set', async () => {
    assert.equal(pickDischargeHeader('Edited Name', 'File Name'), 'Edited Name');
    assert.equal(pickDischargeHeader('', 'File Name'), 'File Name');
    assert.equal(formatDischargePhone('98765'), 'PH: 98765');
    assert.equal(formatDischargePhone('PH: 98765'), 'PH: 98765');

    const chunks = [];
    const res = new PassThrough();
    res.setHeader = () => {};
    res.on('data', (chunk) => chunks.push(chunk));

    const admission = {
      _id: '64a000000000000000000003',
      admissionNumber: 'IP-TEST-3',
      admissionDate: new Date('2026-09-17T04:30:00.000Z'),
      dischargeDate: new Date('2026-09-19T06:30:00.000Z'),
      patient: { name: 'File Name', age: 20, gender: 'Male', patientId: 'UHID3' },
      doctor: { name: 'Test Doctor', specialization: 'OG' },
      department: { name: 'OG' },
      dischargeDetails: {
        printSections: { patientName: true, diagnosis: true },
        printPatient: { name: 'ZZEDITEDNAMEZZ' },
        diagnosis: 'Test diagnosis',
      },
    };

    await new Promise((resolve, reject) => {
      res.on('finish', resolve);
      res.on('error', reject);
      generateDischargeSummaryPDF(admission, res, { hospitalName: 'Sri Sanjeevi Hospital', address: 'Tamil Nadu' })
        .catch(reject);
    });

    const pdf = Buffer.concat(chunks);
    assert.ok(pdf.length > 500, 'PDF should have content');
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  });
});
