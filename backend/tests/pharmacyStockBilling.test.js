const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  isStockPreDeducted,
  getMedicineItems,
  stockableMedicineItems,
} = require('../utils/stockManager');

describe('IP / prescription bill lines skip a second stock deduction', () => {
  const items = [
    {
      type: 'medicine',
      medicine: 'med-ethilon',
      description: 'ETHILON-3.0-NW3328',
      quantity: 1,
      referenceModel: 'IPAdmission',
    },
    {
      type: 'medicine',
      medicine: 'med-rx',
      description: 'Dispensed tablet',
      quantity: 2,
      referenceModel: 'Prescription',
    },
    {
      type: 'medicine',
      medicine: 'med-new',
      description: 'Added at billing counter',
      quantity: 1,
      referenceModel: 'Medicine',
    },
    {
      type: 'room',
      description: 'General ward',
      quantity: 6,
      referenceModel: 'IPAdmission',
    },
  ];

  it('treats IP ward medicines and dispensed prescriptions as already issued', () => {
    assert.equal(isStockPreDeducted({ referenceModel: 'IPAdmission' }), true);
    assert.equal(isStockPreDeducted({ referenceModel: 'Prescription' }), true);
    assert.equal(isStockPreDeducted({ referenceModel: 'Medicine' }), false);
    assert.equal(isStockPreDeducted({ referenceModel: 'OPRegistration' }), false);
  });

  it('does not re-deduct ETHILON-style IP medications that already left pharmacy stock', () => {
    const stockable = stockableMedicineItems(items);
    assert.equal(getMedicineItems(items).length, 3);
    assert.equal(stockable.length, 1);
    assert.equal(stockable[0].medicine, 'med-new');
  });
});
