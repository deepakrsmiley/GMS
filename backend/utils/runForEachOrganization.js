const Organization = require('../models/Organization');
const { runWithOrganizationContext } = require('../middleware/tenantContext');

const runForEachOrganization = async (fn) => {
  const orgs = await Organization.find({ status: 'active' }).lean();
  if (!orgs.length) {
    await runWithOrganizationContext(
      { organizationId: null, legacyUnscoped: true, isSuperAdmin: false },
      () => fn(null),
    );
    return;
  }
  for (const org of orgs) {
    await runWithOrganizationContext(
      {
        organizationId: org._id,
        organization: org,
        organizationCode: org.code,
        isSuperAdmin: false,
        legacyUnscoped: false,
      },
      () => fn(org),
    );
  }
};

module.exports = { runForEachOrganization };
