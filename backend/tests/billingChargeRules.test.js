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

  it('removes pharmacy lines from IP billing and keeps hospital charges', () => {
    const withRoom = [
      ...sample,
      { id: 'room-1', category: 'Room', type: 'room', amount: 1500 },
      { id: 'proc-1', category: 'Procedure', type: 'procedure', amount: 800 },
    ];
    const out = filterChargesForBillType(withRoom, 'ip');
    assert.equal(out.length, 4);
    assert.ok(out.every((c) => c.category !== 'Pharmacy' && c.type !== 'medicine'));
    assert.ok(out.some((c) => c.type === 'room'));
    assert.ok(out.some((c) => c.type === 'procedure'));
  });

  it('keeps pharmacy lines for unified billing', () => {
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
    assert.equal(lines[0].name, 'CBC');
    assert.equal(labOrderPayableTotal({
      status: 'pending',
      tests: [{ testName: 'CBC', price: 400, status: 'pending' }],
    }), 400);
  });

  it('bills the package name when only the first parameter carries the price', () => {
    const lines = labBillableTestLines({
      _id: 'lab-cbc',
      labNumber: 'LAB-22',
      status: 'pending',
      tests: [
        { testName: 'WBC', profileName: 'CBC (Complete Blood Count)', price: 500, status: 'pending' },
        { testName: 'RBC', profileName: 'CBC (Complete Blood Count)', price: 0, status: 'pending' },
      ],
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].name, 'CBC (Complete Blood Count)');
    assert.equal(lines[0].unitPrice, 500);
  });

  it('skips cancelled orders', () => {
    assert.equal(labBillableTestLines({
      status: 'cancelled',
      tests: [{ testName: 'CBC', price: 400, status: 'pending' }],
    }).length, 0);
  });
});
