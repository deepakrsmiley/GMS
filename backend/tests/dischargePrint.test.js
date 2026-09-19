/**
 * Discharge summary print: keep Tamil glyphs and do not throw on Unicode text.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { pdfSafe } = require('../utils/dischargePrint');
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
});
