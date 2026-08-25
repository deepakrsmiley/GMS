/**
 * OP consultation fee resolution from doctor / department masters.
 * Run: npm test  (from backend/)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  EMERGENCY_SURCHARGE,
  resolveOpConsultationFee,
  defaultPaymentPurpose,
} = require('../utils/opConsultationFee');

describe('resolveOpConsultationFee', () => {
  it('uses doctor consultation fee, then department', () => {
    assert.equal(resolveOpConsultationFee({ consultationFee: 500 }, { consultationFee: 200 }, 'walkin'), 500);
    assert.equal(resolveOpConsultationFee({ consultationFee: 0 }, { consultationFee: 200 }, 'walkin'), 200);
    assert.equal(resolveOpConsultationFee(null, { consultationFee: 200 }, 'appointment'), 200);
  });

  it('uses follow-up fee when set, otherwise half of consult', () => {
    assert.equal(
      resolveOpConsultationFee({ consultationFee: 400, followUpFee: 150 }, { consultationFee: 200 }, 'followup'),
      150,
    );
    assert.equal(
      resolveOpConsultationFee({ consultationFee: 400, followUpFee: 0 }, { consultationFee: 200 }, 'followup'),
      200,
    );
  });
});

describe('defaultPaymentPurpose', () => {
  it('labels visit type', () => {
    assert.equal(defaultPaymentPurpose('followup'), 'Follow-up consultation fee');
    assert.equal(defaultPaymentPurpose('emergency'), 'Emergency consultation fee');
    assert.equal(defaultPaymentPurpose('walkin'), 'Doctor consultation fee');
  });

  it('keeps emergency surcharge constant', () => {
    assert.equal(EMERGENCY_SURCHARGE, 300);
  });
});
