/**
 * Core permission / clinical-access checks (no DB).
 * Run: npm test  (from backend/)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveEffectivePermissions,
  looksLikeFullChecklist,
} = require('../config/permissions');
const { canEditDischargeAfterDischarge } = require('../utils/clinicalAccess');

describe('resolveEffectivePermissions', () => {
  it('uses role defaults when custom list is empty', () => {
    const perms = resolveEffectivePermissions('Pharmacist', []);
    assert.ok(perms.includes('VIEW_PHARMACY'));
    assert.ok(perms.includes('VIEW_BILLING'));
    assert.ok(perms.includes('VIEW_ASSET_COMPLAINTS'));
  });

  it('unions short extra grants with role defaults (Nurse Station tick)', () => {
    const perms = resolveEffectivePermissions('Pharmacist', ['VIEW_NURSE_STATION']);
    assert.ok(perms.includes('VIEW_NURSE_STATION'));
    assert.ok(perms.includes('VIEW_PHARMACY'), 'must keep pharmacy access');
    assert.ok(perms.includes('VIEW_BILLING'), 'must keep billing access');
    assert.ok(perms.includes('MANAGE_IP_MEDICATION'), 'Nurse Station implies meds');
  });

  it('honours Super Admin unchecks when a full checklist is saved', () => {
    const custom = [
      'VIEW_DASHBOARD',
      'VIEW_PATIENT',
      'VIEW_PHARMACY',
      'VIEW_PRESCRIPTION',
      'DISPENSE_PRESCRIPTION',
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
    ];
    assert.equal(looksLikeFullChecklist(custom, []), true);
    const perms = resolveEffectivePermissions('Pharmacist', custom);
    assert.ok(!perms.includes('EDIT_MEDICINE'), 'unchecked EDIT_MEDICINE stays locked');
    assert.ok(perms.includes('VIEW_PHARMACY'));
  });

  it('Super Admin gets wildcard', () => {
    assert.deepEqual(resolveEffectivePermissions('Super Admin', []), ['*']);
  });

  it('Receptionist can dispense at pharmacy desk and search patients for lab', () => {
    const perms = resolveEffectivePermissions('Receptionist', []);
    assert.ok(perms.includes('DISPENSE_PRESCRIPTION'), 'reception can send pharmacy bills');
    assert.ok(perms.includes('VIEW_PHARMACY'), 'CREATE_PRESCRIPTION implies VIEW_PHARMACY');
    assert.ok(perms.includes('CREATE_LAB_ORDER'));
  });

  it('Lab Technician can look up patients for lab orders', () => {
    const perms = resolveEffectivePermissions('Lab Technician', []);
    assert.ok(perms.includes('VIEW_PATIENT'));
    assert.ok(perms.includes('CREATE_LAB_ORDER'));
  });
});

describe('canEditDischargeAfterDischarge', () => {
  it('allows Super Admin and Admin', () => {
    assert.equal(canEditDischargeAfterDischarge({ role: 'Super Admin' }), true);
    assert.equal(canEditDischargeAfterDischarge({ role: 'Admin' }), true);
  });

  it('blocks normal pharmacist', () => {
    assert.equal(
      canEditDischargeAfterDischarge({
        role: 'Pharmacist',
        permissions: resolveEffectivePermissions('Pharmacist', []),
      }),
      false,
    );
  });
});
