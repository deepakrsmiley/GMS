const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  isStockPreDeducted,
  getMedicineItems,
  stockableMedicineItems,
  stockQuantityDeltas,
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

describe('editing an older bill only moves the quantity that changed', () => {
  const oldItems = [
    { type: 'medicine', medicine: 'med-a', batch: 'B1', quantity: 10, referenceModel: 'Medicine' },
    { type: 'room', description: 'Ward', quantity: 3, referenceModel: 'IPAdmission' },
  ];

  it('leaves stock alone when the same medicines are saved again', () => {
    const { restore, deduct } = stockQuantityDeltas(oldItems, oldItems.map((item) => ({ ...item })));
    assert.equal(restore.length, 0);
    assert.equal(deduct.length, 0);
  });

  it('deducts only the extra quantity and restores only the removed quantity', () => {
    const next = [
      { type: 'medicine', medicine: 'med-a', batch: 'B1', quantity: 12, referenceModel: 'Medicine' },
      { type: 'medicine', medicine: 'med-b', batch: 'B2', quantity: 1, referenceModel: 'Medicine' },
    ];
    const { restore, deduct } = stockQuantityDeltas(oldItems, next);
    assert.equal(restore.length, 0);
    assert.equal(deduct.length, 2);
    assert.equal(deduct.find((row) => row.medicine === 'med-a').quantity, 2);
    assert.equal(deduct.find((row) => row.medicine === 'med-b').quantity, 1);
  });
});
