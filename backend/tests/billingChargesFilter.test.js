/**
 * Billable charge filtering for OP vs pharmacy separation.
 * Run: npm test  (from backend/)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const filterChargesForBillType = (charges, billType) => {
  const mode = billType || 'auto';
  if (mode === 'op' || mode === 'lab') {
    return charges.filter((c) => c.category !== 'Pharmacy' && c.type !== 'medicine');
  }
  return charges;
};

describe('filterChargesForBillType', () => {
  const sample = [
    { id: 'lab-1', category: 'Laboratory', type: 'lab', amount: 500 },
    { id: 'rx-1', category: 'Pharmacy', type: 'medicine', amount: 120 },
    { id: 'consult', category: 'Consultation', type: 'consultation', amount: 300 },
  ];

  it('removes pharmacy lines from OP billing', () => {
    const out = filterChargesForBillType(sample, 'op');
    assert.equal(out.length, 2);
    assert.ok(out.every((c) => c.category !== 'Pharmacy'));
  });

  it('removes pharmacy lines from lab billing', () => {
    const out = filterChargesForBillType(sample, 'lab');
    assert.equal(out.length, 2);
  });

  it('keeps pharmacy lines for IP / unified billing', () => {
    assert.equal(filterChargesForBillType(sample, 'ip').length, 3);
    assert.equal(filterChargesForBillType(sample, 'auto').length, 3);
  });
});
