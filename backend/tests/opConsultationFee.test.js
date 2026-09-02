/**
 * OP consultation fee resolution from doctor / department masters.
 * Run: npm test  (from backend/)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  EMERGENCY_SURCHARGE,
  resolveOpConsultationFee,
  parseFeeOverride,
  resolveBilledConsultationFee,
  defaultPaymentPurpose,
} = require('../utils/opConsultationFee');

describe('resolveOpConsultationFee', () => {
  it('uses doctor consultation fee including zero, then department if doctor fee is missing', () => {
    assert.equal(resolveOpConsultationFee({ consultationFee: 500 }, { consultationFee: 200 }, 'walkin'), 500);
    assert.equal(resolveOpConsultationFee({ consultationFee: 0 }, { consultationFee: 200 }, 'walkin'), 0);
    assert.equal(resolveOpConsultationFee(null, { consultationFee: 200 }, 'appointment'), 200);
    assert.equal(resolveOpConsultationFee({ consultationFee: undefined }, { consultationFee: 200 }, 'walkin'), 200);
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
    assert.equal(
      resolveOpConsultationFee({ consultationFee: 0, followUpFee: 0 }, { consultationFee: 200 }, 'followup'),
      0,
    );
  });
});

describe('resolveBilledConsultationFee', () => {
  it('accepts a reception override including zero', () => {
    assert.equal(parseFeeOverride(''), null);
    assert.equal(parseFeeOverride(undefined), null);
    assert.equal(parseFeeOverride(-10), null);
    assert.equal(parseFeeOverride(0), 0);
    assert.equal(parseFeeOverride('400'), 400);
    assert.equal(resolveBilledConsultationFee(500, 400, 350), 400);
    assert.equal(resolveBilledConsultationFee(500, '', 350), 350);
    assert.equal(resolveBilledConsultationFee(500, null, null), 500);
    assert.equal(resolveBilledConsultationFee(500, 0, 350), 0);
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
