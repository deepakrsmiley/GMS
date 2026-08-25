const { AsyncLocalStorage } = require('async_hooks');

const organizationContext = new AsyncLocalStorage();

const getOrganizationContext = () => organizationContext.getStore() || null;

const getContextOrganizationId = () => {
  const store = getOrganizationContext();
  return store?.organizationId || null;
};

const storeFromContext = (context) => ({
  organizationId: context?.organizationId || null,
  organization: context?.organization || null,
  organizationCode: context?.organizationCode || context?.organization?.code || null,
  isSuperAdmin: !!context?.isSuperAdmin,
  legacyUnscoped: !!context?.legacyUnscoped,
  mustSelectOrganization: !!context?.mustSelectOrganization,
  skipOrganizationFilter: !!context?.skipOrganizationFilter,
});

const runWithOrganizationContext = (context, fn) =>
  organizationContext.run(storeFromContext(context), fn);

/**
 * Keep ALS alive until Express finishes this response.
 * Must not be wrapped in a JWT catch — downstream errors are not auth failures.
 */
const bindOrganizationContext = (context, res, next) =>
  runWithOrganizationContext(
    context,
    () =>
      new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          res.removeListener('finish', done);
          res.removeListener('close', done);
          resolve();
        };
        res.once('finish', done);
        res.once('close', done);
        next();
      }),
  );

const setRequestOrganizationContext = (req, context) => {
  req.organizationId = context.organizationId || null;
  req.organization = context.organization || null;
  req.organizationCode = context.organizationCode || context.organization?.code || null;
  req.tenant = context;
};

module.exports = {
  organizationContext,
  getOrganizationContext,
  getContextOrganizationId,
  runWithOrganizationContext,
  bindOrganizationContext,
  setRequestOrganizationContext,
};
