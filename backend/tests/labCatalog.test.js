const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { expandLabOrderTests, collectProfilePrices } = require('../utils/labCatalog');

describe('expandLabOrderTests', () => {
  it('expands a group into child tests and bills the first real parameter', () => {
    const masters = [{
      name: 'Complete Blood Count',
      kind: 'group',
      testCode: 'CBC',
      price: 250,
      items: [
        { testName: 'Haematology', isSection: true, sortOrder: 0 },
        { testName: 'Hemoglobin', unit: 'gms/dl', normalRange: '11.0 to 15.0', sortOrder: 1 },
        { testName: 'Hematocrit', unit: '%', normalRange: '37.0 to 47.0', sortOrder: 2 },
      ],
    }];
    const { tests, totalAmount } = expandLabOrderTests(['Complete Blood Count'], masters, { 'Complete Blood Count': 250 });
    assert.equal(tests.length, 3);
    assert.equal(totalAmount, 250);
    assert.equal(tests[0].price, 0);
    assert.equal(tests[0].isSection, true);
    assert.equal(tests[1].testName, 'Hemoglobin');
    assert.equal(tests[1].price, 250);
    assert.equal(tests[2].price, 0);
    assert.equal(tests[1].unit, 'gms/dl');
  });

  it('expands an imported single test as one row', () => {
    const masters = [{
      name: 'ADA',
      kind: 'single',
      testCode: 'ADA',
      price: 400,
      unit: '-',
      normalRange: '-',
    }];
    const { tests, totalAmount } = expandLabOrderTests(['ADA'], masters);
    assert.equal(tests.length, 1);
    assert.equal(tests[0].testName, 'ADA');
    assert.equal(tests[0].price, 400);
    assert.equal(totalAmount, 400);
  });

  it('keeps client CBC rows for Sri Sanjeevi price-only masters', () => {
    const masters = [{
      name: 'CBC (Complete Blood Count)',
      kind: 'single',
      price: 500,
    }];
    const clientTests = [
      { testName: 'WBC', profileName: 'CBC (Complete Blood Count)', price: 500, unit: '10³/mm³' },
      { testName: 'RBC', profileName: 'CBC (Complete Blood Count)', price: 0, unit: '10⁶/mm³' },
    ];
    const { tests } = expandLabOrderTests(
      ['CBC (Complete Blood Count)'],
      masters,
      { 'CBC (Complete Blood Count)': 500 },
      clientTests,
    );
    assert.equal(tests.length, 2);
    assert.equal(tests[0].testName, 'WBC');
    assert.equal(tests[1].testName, 'RBC');
  });
});

describe('collectProfilePrices', () => {
  it('prefers client-entered price over master', () => {
    const prices = collectProfilePrices(
      ['ADA'],
      [{ name: 'ADA', price: 400 }],
      [{ profileName: 'ADA', price: 450 }],
    );
    assert.equal(prices.ADA, 450);
  });
});
