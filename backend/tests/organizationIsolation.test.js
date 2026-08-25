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
const { buildScopeFilter, legacyMissingOrgFilter, nothingFilter } = require('../plugins/organizationScope');
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

  it('untagged rows belong only to the oldest organization', () => {
    const { untaggedRowsBelongToOrg } = require('../middleware/tenant');
    const oldest = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa' };
    const newer = { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb' };
    assert.equal(untaggedRowsBelongToOrg(oldest, oldest), true);
    assert.equal(untaggedRowsBelongToOrg(newer, oldest), false);
    assert.equal(untaggedRowsBelongToOrg(null, oldest), false);
  });

  it('matches nothing when Super Admin has not selected an org', () => {
    const filter = buildScopeFilter({ isSuperAdmin: true, mustSelectOrganization: true });
    assert.deepEqual(filter, nothingFilter);
  });

  it('skips when no request context (migration scripts)', () => {
    assert.equal(buildScopeFilter(null), null);
    assert.equal(buildScopeFilter({ skipOrganizationFilter: true }), null);
  });
});

describe('public branding must not expose Hospital A', () => {
  it('returns GMS system fields only', () => {
    const pub = brandingService.getPublicBranding();
    assert.equal(pub.isPublic, true);
    assert.equal(pub.systemName, 'GALACTIC MEDICAL SYSTEMS');
    assert.equal(pub.gstNumber, undefined);
    assert.equal(pub.address, undefined);
    assert.equal(pub.bankAccount, undefined);
    assert.equal(pub.logo, '');
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
    const saToken = jwt.decode(sa.getSignedJwtToken());
    assert.equal(saToken.organizationId, undefined);
    const selected = jwt.decode(sa.getSignedJwtToken({ activeOrganizationId: 'bbbbbbbbbbbbbbbbbbbbbbbb' }));
    assert.equal(String(selected.activeOrganizationId), 'bbbbbbbbbbbbbbbbbbbbbbbb');
  });
});
