const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mergeSameMedicineLines } = require('../utils/mergeMedicineLines');

const medId = '64b0000000000000000000a1';
const day1 = '64b0000000000000000000b1';
const day2 = '64b0000000000000000000b2';

describe('mergeSameMedicineLines', () => {
  it('combines the same IP medicine from different days into one quantity', () => {
    const lines = mergeSameMedicineLines([
      {
        type: 'medicine',
        category: 'Pharmacy',
        description: 'Dolo 250',
        name: 'Dolo 250',
        medicine: medId,
        quantity: 1,
        unitPrice: 10,
        gstPercent: 5,
        referenceId: day1,
        referenceModel: 'IPAdmission',
      },
      {
        type: 'room',
        category: 'Room',
        description: 'Room charges',
        quantity: 2,
        unitPrice: 500,
        gstPercent: 0,
      },
      {
        type: 'medicine',
        category: 'Pharmacy',
        description: 'Dolo 250 1-0-1',
        name: 'Dolo 250',
        medicine: medId,
        quantity: 1,
        unitPrice: 10,
        gstPercent: 5,
        referenceId: day2,
        referenceModel: 'IPAdmission',
      },
    ]);

    const meds = lines.filter((line) => line.type === 'medicine');
    assert.equal(meds.length, 1);
    assert.equal(meds[0].quantity, 2);
    assert.equal(meds[0].description, 'Dolo 250');
    assert.equal(meds[0].amount, 21);
    assert.deepEqual(meds[0].sourceIds, [day1, day2]);
    assert.equal(lines.filter((line) => line.type === 'room').length, 1);
  });

  it('keeps the same medicine on a separate line when the rate is different', () => {
    const lines = mergeSameMedicineLines([
      { type: 'medicine', description: 'Dolo 250', medicine: medId, quantity: 1, unitPrice: 10, gstPercent: 0, referenceId: day1 },
      { type: 'medicine', description: 'Dolo 250', medicine: medId, quantity: 1, unitPrice: 12, gstPercent: 0, referenceId: day2 },
    ]);
    assert.equal(lines.length, 2);
  });
});
