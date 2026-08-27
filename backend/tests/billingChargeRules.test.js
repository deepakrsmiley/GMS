const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  filterChargesForBillType,
  labBillableTestLines,
  labOrderPayableTotal,
} = require('../utils/billingChargeRules');

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

  it('keeps only laboratory lines for lab billing', () => {
    const out = filterChargesForBillType(sample, 'lab');
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'lab');
  });

  it('keeps pharmacy lines for IP / unified billing', () => {
    assert.equal(filterChargesForBillType(sample, 'ip').length, 3);
    assert.equal(filterChargesForBillType(sample, 'auto').length, 3);
  });
});

describe('labBillableTestLines', () => {
  it('bills pending orders, not only completed ones', () => {
    const lines = labBillableTestLines({
      _id: 'lab1',
      labNumber: 'LAB-001',
      status: 'pending',
      tests: [
        { testName: 'CBC', price: 400, status: 'pending' },
        { testName: 'Cancelled', price: 100, status: 'cancelled' },
      ],
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].unitPrice, 400);
    assert.equal(labOrderPayableTotal({
      status: 'pending',
      tests: [{ testName: 'CBC', price: 400, status: 'pending' }],
    }), 400);
  });

  it('skips cancelled orders', () => {
    assert.equal(labBillableTestLines({
      status: 'cancelled',
      tests: [{ testName: 'CBC', price: 400, status: 'pending' }],
    }).length, 0);
  });
});
