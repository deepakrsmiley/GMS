/**
 * Multi-tenant isolation unit tests (no database).
 * Run: npm test  (from backend/)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  stripClientOrganizationId,
  orgFilter,
  userOrgFilter,
  withOrganization,
  orgById,
  orgRoom,
} = require('../middleware/tenant');
const { buildScopeFilter, mergeScopeFilters, legacyMissingOrgFilter, nothingFilter } = require('../plugins/organizationScope');
const brandingService = require('../services/brandingService');

const mockResNext = () => {
  const req = { body: { organizationId: 'from-client', name: 'Pat' }, query: { organizationId: 'q' }, params: { organizationId: 'p' } };
  let called = false;
  stripClientOrganizationId(req, {}, () => { called = true; });
  return { req, called };
};

describe('client organizationId is never trusted', () => {
  it('strips organizationId from body, query and params', () => {
    const { req, called } = mockResNext();
    assert.equal(called, true);
    assert.equal(req.body.organizationId, undefined);
    assert.equal(req.body.name, 'Pat');
    assert.equal(req.query.organizationId, undefined);
    assert.equal(req.params.organizationId, undefined);
  });

  it('withOrganization overwrites client tenancy with JWT/server org', () => {
    const req = { organizationId: 'org-a' };
    const payload = withOrganization(req, { name: 'John', organizationId: 'org-b' });
    assert.equal(payload.name, 'John');
    assert.equal(String(payload.organizationId), 'org-a');
  });
});

describe('org filters', () => {
  it('hospital user with org gets organizationId filter', () => {
    const req = { organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa', tenant: { organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa' } };
    const filter = orgFilter(req, { name: 'x' });
    assert.equal(String(filter.organizationId), 'aaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(filter.name, 'x');
  });

  it('legacy pre-migration hospital user matches missing organizationId only', () => {
    const req = { tenant: { legacyUnscoped: true } };
    const filter = orgFilter(req);
    assert.ok(filter.$and || filter.$or);
  });

  it('Super Admin without org matches nothing (no cross-hospital leak)', () => {
    const req = { tenant: { isSuperAdmin: true, mustSelectOrganization: true } };
    const filter = orgFilter(req);
    assert.equal(filter._id, null);
  });

  it('Hospital A scoped requests include untagged plus tagged rows', () => {
    const orgId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const filter = orgFilter({
      organizationId: orgId,
      tenant: { organizationId: orgId, legacyUnscoped: true },
    });
    assert.ok(filter.$or);
    assert.equal(filter.$or.length, 3);
  });

  it('orgById requires both _id and organizationId', () => {
    const req = { organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa', tenant: { organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa' } };
    const q = orgById(req, 'bbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(String(q._id), 'bbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(String(q.organizationId), 'aaaaaaaaaaaaaaaaaaaaaaaa');
  });
});

describe('mongoose plugin scope builder', () => {
  it('uses organizationId when present', () => {
    const filter = buildScopeFilter({ organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    assert.ok(filter.organizationId);
  });

  it('uses missing-org filter in legacy mode', () => {
    const filter = buildScopeFilter({ legacyUnscoped: true });
    assert.deepEqual(filter, legacyMissingOrgFilter);
  });

  it('keeps untagged Hospital A rows visible when an org exists pre-migration', () => {
    const orgId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const filter = buildScopeFilter({ organizationId: orgId, legacyUnscoped: true });
    assert.ok(filter.$or);
    assert.equal(filter.$or.length, 3);
    assert.ok(filter.$or[0].organizationId);
    const fromReq = orgFilter({
      organizationId: orgId,
      tenant: { organizationId: orgId, legacyUnscoped: true },
    });
    assert.ok(fromReq.$or);
    assert.equal(fromReq.$or.length, 3);
  });

  it('untagged rows belong to Hospital A (HOSP001 / Sri Sanjeevi), not Hospital B', () => {
    const { untaggedRowsBelongToOrg } = require('../middleware/tenant');
    const { pickHospitalA, isHospitalA, isPlatformOrg, isClientOrg } = require('../utils/hospitalA');
    const oldest = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa' };
    const newer = { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb' };
    assert.equal(untaggedRowsBelongToOrg(oldest, oldest), true);
    assert.equal(untaggedRowsBelongToOrg(newer, oldest), false);
    assert.equal(untaggedRowsBelongToOrg(null, oldest), false);

    const hospA = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', code: 'HOSP001', name: 'Sri Sanjeevi Hospital', kind: 'client' };
    const hospB = { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', code: 'HOSP002', name: 'Srinivasa hospital', kind: 'client' };
    const gms = { _id: 'cccccccccccccccccccccccc', code: 'GMS', name: 'Galactic Medical Systems', kind: 'platform' };
    assert.equal(isPlatformOrg(gms), true);
    assert.equal(isClientOrg(hospA), true);
    assert.equal(isClientOrg(gms), false);
    assert.equal(isHospitalA(hospA, [gms, hospA, hospB]), true);
    assert.equal(isHospitalA(hospB, [gms, hospA, hospB]), false);
    assert.equal(isHospitalA(gms, [gms, hospA, hospB]), false);
    assert.equal(pickHospitalA([gms, hospB, hospA]).code, 'HOSP001');
    assert.equal(pickHospitalA([gms]), null);
  });

  it('matches nothing when Super Admin has not selected an org', () => {
    const filter = buildScopeFilter({ isSuperAdmin: true, mustSelectOrganization: true });
    assert.deepEqual(filter, nothingFilter);
  });

  it('skips when no request context (migration scripts)', () => {
    assert.equal(buildScopeFilter(null), null);
    assert.equal(buildScopeFilter({ skipOrganizationFilter: true }), null);
  });

  it('does not let tenant $or overwrite patient search $or', () => {
    const orgId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const search = { $or: [{ name: /ram/i }, { patientId: /ram/i }, { phone: /ram/i }] };
    const scope = buildScopeFilter({ organizationId: orgId, legacyUnscoped: true });
    const merged = mergeScopeFilters(search, scope);
    assert.ok(merged.$and);
    assert.equal(merged.$and.length, 2);
    assert.equal(merged.$and[0], search);
    assert.equal(merged.$and[1], scope);
    assert.equal(merged.$or, undefined);

    const fromReq = orgFilter(
      { organizationId: orgId, tenant: { organizationId: orgId, legacyUnscoped: true } },
      search,
    );
    assert.ok(fromReq.$and);
    assert.deepEqual(fromReq.$and[0], search);
  });
});

describe('public branding must not expose Hospital A', () => {
  it('returns GMS system fields only', () => {
    const pub = brandingService.getPublicBranding();
    assert.equal(pub.isPublic, true);
    assert.equal(pub.systemName, 'GALACTIC MEDICAL SYSTEMS');
    assert.equal(pub.hospitalName, 'GALACTIC MEDICAL SYSTEMS');
    assert.equal(brandingService.SYSTEM_SHORT_NAME, 'GMS');
    assert.equal(pub.gstNumber, undefined);
    assert.equal(pub.address, undefined);
    assert.equal(pub.bankAccount, undefined);
    assert.equal(pub.logo, '');
    assert.equal(pub.developedByLabel, 'GMS developed');
  });
});

describe('socket rooms are organization-prefixed', () => {
  it('chat/role/branding include organization id', () => {
    const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    assert.equal(orgRoom.chat(id), `org:${id}:chat`);
    assert.equal(orgRoom.role(id, 'Admin'), `org:${id}:role:Admin`);
    assert.equal(orgRoom.branding(id), `org:${id}:branding`);
  });
});

describe('hospital modules', () => {
  it('missing list means all modules; empty list means none', () => {
    const { isModuleEnabled, sanitizeEnabledModules, ALL_MODULE_IDS } = require('../config/hospitalModules');
    assert.equal(isModuleEnabled(null, 'lab'), true);
    assert.equal(isModuleEnabled({}, 'lab'), true);
    assert.equal(isModuleEnabled({ enabledModules: ['op', 'lab'] }, 'lab'), true);
    assert.equal(isModuleEnabled({ enabledModules: ['op', 'lab'] }, 'ip'), false);
    assert.equal(isModuleEnabled({ enabledModules: [] }, 'op'), false);
    assert.deepEqual(sanitizeEnabledModules(['op', 'nope', 'lab', 'op']), ['op', 'lab']);
    assert.equal(sanitizeEnabledModules(undefined).length, ALL_MODULE_IDS.length);
  });
});

describe('migration identity', () => {
  it('uses Sri Sanjeevi Hospital when branding is the placeholder', () => {
    const { resolveHospitalAName, DEFAULT_NAME } = require('../scripts/migrateOrganization');
    assert.equal(resolveHospitalAName({ hospitalName: 'Your Hospital Name' }), DEFAULT_NAME);
    assert.equal(resolveHospitalAName({ hospitalName: 'Sri Sanjeevi Hospital' }), 'Sri Sanjeevi Hospital');
    assert.equal(resolveHospitalAName(null), DEFAULT_NAME);
  });
});

describe('User JWT payload helper', () => {
  it('hospital users include organizationId; Super Admin does not unless selected', () => {
    const jwt = require('jsonwebtoken');
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1h';
    const User = require('../models/User');
    const hospital = new User({
      name: 'A',
      email: 'a@test.com',
      password: 'Password1!',
      role: 'Admin',
      organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    });
    const token = hospital.getSignedJwtToken();
    const decoded = jwt.decode(token);
    assert.equal(typeof decoded.organizationId, 'string');
    assert.equal(decoded.role, 'Admin');
    assert.equal(decoded.userId, String(hospital._id));

    const sa = new User({
      name: 'SA',
      email: 'sa@test.com',
      password: 'Password1!',
      role: 'Super Admin',
    });
    const saBound = new User({
      name: 'SA2',
      email: 'sa2@test.com',
      password: 'Password1!',
      role: 'Super Admin',
      organizationId: 'cccccccccccccccccccccccc',
    });
    const saBoundToken = jwt.decode(saBound.getSignedJwtToken());
    assert.equal(saBoundToken.organizationId, undefined);
    const selected = jwt.decode(sa.getSignedJwtToken({ activeOrganizationId: 'bbbbbbbbbbbbbbbbbbbbbbbb' }));
    assert.equal(String(selected.activeOrganizationId), 'bbbbbbbbbbbbbbbbbbbbbbbb');
  });
});

describe('GMS role aliases', () => {
  it('maps GMS_SUPER_ADMIN and HOSPITAL_ADMIN without changing stored role names', () => {
    const { isSuperAdmin, normalizeRole } = require('../utils/roles');
    assert.equal(isSuperAdmin('GMS_SUPER_ADMIN'), true);
    assert.equal(isSuperAdmin('gms super admin'), true);
    assert.equal(isSuperAdmin('Admin'), false);
    assert.equal(normalizeRole('HOSPITAL_ADMIN'), 'Admin');
    assert.equal(normalizeRole('hospital-admin'), 'Admin');
    assert.equal(normalizeRole('Super Admin'), 'Super Admin');
  });
});
