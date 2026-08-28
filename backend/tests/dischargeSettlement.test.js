const { describe, it } = require('node:test');
const assert = require('assert/strict');
const { evaluateDischargeSettlement } = require('../utils/dischargeSettlement');

describe('evaluateDischargeSettlement', () => {
  it('blocks regular discharge when there is no bill', () => {
    const r = evaluateDischargeSettlement({ billed: false, unpaidDue: 0 });
    assert.equal(r.allowed, false);
    assert.equal(r.code, 'NO_BILL');
  });

  it('blocks regular discharge when due remains', () => {
    const r = evaluateDischargeSettlement({ billed: true, unpaidDue: 250 });
    assert.equal(r.allowed, false);
    assert.equal(r.code, 'UNPAID');
  });

  it('allows regular discharge when billed and paid', () => {
    const r = evaluateDischargeSettlement({ billed: true, unpaidDue: 0 });
    assert.equal(r.allowed, true);
    assert.equal(r.code, 'SETTLED');
  });

  it('allows LAMA / death without a bill', () => {
    assert.equal(evaluateDischargeSettlement({ dischargeType: 'LAMA', billed: false }).allowed, true);
    assert.equal(evaluateDischargeSettlement({ dischargeType: 'death', billed: false }).allowed, true);
  });

  it('allows admin force only for admins', () => {
    assert.equal(
      evaluateDischargeSettlement({ billed: false, forceDischarge: true, isAdmin: true }).allowed,
      true,
    );
    assert.equal(
      evaluateDischargeSettlement({ billed: false, forceDischarge: true, isAdmin: false }).allowed,
      false,
    );
  });
});
