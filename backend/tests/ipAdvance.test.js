const test = require('node:test');
const assert = require('node:assert/strict');
const {
  linesFromAdmission,
  sumLines,
  advanceDisplayLines,
  balanceAfterAdvance,
} = require('../utils/ipAdvance');

test('older admissions with only advanceAmount still print one dated line', () => {
  const lines = linesFromAdmission({
    advanceAmount: 5000,
    admissionDate: '2026-11-01T00:00:00.000Z',
    advancePaymentMode: 'cash',
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].amount, 5000);
  assert.equal(lines[0].mode, 'cash');
  assert.equal(sumLines(lines), 5000);
});

test('each stored advance is listed and the balance is bill total minus advance and later payments', () => {
  const bill = {
    totalAmount: 12000,
    paidAmount: 2000,
    advanceLines: [
      { amount: 3000, paidAt: '2026-11-01', mode: 'cash' },
      { amount: 1000, paidAt: '2026-11-02', mode: 'upi' },
    ],
  };
  const lines = advanceDisplayLines(bill);
  assert.equal(lines.length, 2);
  assert.equal(balanceAfterAdvance(bill, lines), 6000);
});
