const { describe, it } = require('node:test');
const assert = require('assert/strict');

const { resolveEffectivePermissions } = require('../config/permissions');
const {
  isPharmacyScopeBill,
  pharmacistBillScopeError,
} = require('../utils/billingAccess');

const pharmacistWithDefaults = () => ({
  role: 'Pharmacist',
  permissions: resolveEffectivePermissions('Pharmacist', []),
});

describe('isPharmacyScopeBill', () => {
  it('allows pharmacy and IP bills', () => {
    assert.equal(isPharmacyScopeBill({ billType: 'pharmacy' }), true);
    assert.equal(isPharmacyScopeBill({ billType: 'ip' }), true);
  });

  it('treats missing type as unified (out of pharmacy-only scope)', () => {
    assert.equal(isPharmacyScopeBill({}), false);
    assert.equal(isPharmacyScopeBill({ billType: 'op' }), false);
    assert.equal(isPharmacyScopeBill({ billType: 'unified' }), false);
  });
});

describe('pharmacistBillScopeError', () => {
  it('does not restrict receptionists or admins', () => {
    assert.equal(pharmacistBillScopeError({ role: 'Receptionist' }, { billType: 'op' }), null);
    assert.equal(pharmacistBillScopeError({ role: 'Admin' }, { billType: 'op' }), null);
  });

  it('lets a default pharmacist edit OP consultation bills', () => {
    assert.equal(
      pharmacistBillScopeError(pharmacistWithDefaults(), { billType: 'op' }),
      null,
    );
    assert.equal(
      pharmacistBillScopeError(pharmacistWithDefaults(), { billType: 'unified' }),
      null,
    );
  });

  it('still limits CREATE_BILLING-only pharmacists to pharmacy and IP bills', () => {
    const counterOnly = {
      role: 'Pharmacist',
      permissions: [
        'VIEW_DASHBOARD',
        'VIEW_PATIENT',
        'VIEW_PRESCRIPTION',
        'DISPENSE_PRESCRIPTION',
        'VIEW_PHARMACY',
        'VIEW_BILLING',
        'CREATE_BILLING',
        'PAY_BILL',
        'VIEW_IP_ADMISSION',
        'VIEW_ASSET_COMPLAINTS',
        'CREATE_ASSET_COMPLAINT',
        'CREATE_CHANGE_REQUEST',
        'VIEW_CHANGE_REQUESTS',
        'VIEW_CHAT',
        'VIEW_NOTIFICATIONS',
      ],
    };
    assert.equal(
      pharmacistBillScopeError(counterOnly, { billType: 'op' }),
      'Pharmacy users can manage pharmacy and IP pharmacy bills only',
    );
    assert.equal(pharmacistBillScopeError(counterOnly, { billType: 'pharmacy' }), null);
    assert.equal(pharmacistBillScopeError(counterOnly, { billType: 'ip' }), null);
    assert.equal(pharmacistBillScopeError(counterOnly, { billType: 'lab' }), null);
  });
});
