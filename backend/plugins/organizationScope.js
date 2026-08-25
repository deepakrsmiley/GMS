const mongoose = require('mongoose');
const { getOrganizationContext } = require('../middleware/tenantContext');

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === 'object') {
    if (value._id) return toObjectId(value._id);
    return null;
  }
  const str = String(value);
  if (!mongoose.Types.ObjectId.isValid(str)) return null;
  try {
    return new mongoose.Types.ObjectId(str);
  } catch (_) {
    return null;
  }
};

const nothingFilter = { _id: { $eq: null } };

const legacyMissingOrgFilter = {
  $or: [
    { organizationId: { $exists: false } },
    { organizationId: null },
  ],
};

const legacyOrOrgFilter = (orgId) => ({
  $or: [
    { organizationId: orgId },
    { organizationId: { $exists: false } },
    { organizationId: null },
  ],
});

const buildScopeFilter = (ctx) => {
  if (!ctx || ctx.skipOrganizationFilter) return null;
  const orgId = toObjectId(ctx.organizationId);
  // Pre-migration: Super Admin may have an org record while Hospital A rows are still untagged.
  if (orgId && ctx.legacyUnscoped) return legacyOrOrgFilter(orgId);
  if (orgId) return { organizationId: orgId };
  if (ctx.legacyUnscoped) return legacyMissingOrgFilter;
  return nothingFilter;
};

const mergeWhere = (query, filter) => {
  if (!filter) return;
  query.where(filter);
};

const applyToPipeline = (pipeline, filter) => {
  if (!filter) return;
  const first = pipeline[0];
  if (first && first.$match) {
    pipeline[0] = { $match: { $and: [first.$match, filter] } };
  } else {
    pipeline.unshift({ $match: filter });
  }
};

/**
 * Hospital-tenant plugin.
 * Adds organizationId and automatically scopes find/update/delete/count/aggregate
 * from AsyncLocalStorage. Scripts and auth (no store) are left unscoped.
 * Super Admin without a selected org and without legacy mode matches nothing,
 * so multiple hospitals cannot leak through a missed controller filter.
 */
const applyOrganizationScope = (schema) => {
  if (schema.path('organizationId')) return;

  schema.add({
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
    },
  });

  schema.index({ organizationId: 1, createdAt: -1 });

  const applyFindScope = function applyFindScope() {
    try {
      if (this.getOptions?.()?.skipOrganizationFilter) return;
      mergeWhere(this, buildScopeFilter(getOrganizationContext()));
    } catch (_) {
      try {
        mergeWhere(this, nothingFilter);
      } catch (__) {
        /* ignore */
      }
    }
  };

  schema.pre(/^find/, applyFindScope);
  schema.pre('count', applyFindScope);
  schema.pre('countDocuments', applyFindScope);
  schema.pre('estimatedDocumentCount', function estimatedDocumentCountGuard() {
    // estimatedDocumentCount cannot take a filter — refuse to run unscoped in a request.
    const ctx = getOrganizationContext();
    if (ctx && !ctx.skipOrganizationFilter && !ctx.legacyUnscoped && !ctx.organizationId) {
      this.error(new Error('estimatedDocumentCount is not organization-safe; use countDocuments'));
    }
  });

  schema.pre('distinct', applyFindScope);
  schema.pre('updateOne', applyFindScope);
  schema.pre('updateMany', applyFindScope);
  schema.pre('deleteOne', applyFindScope);
  schema.pre('deleteMany', applyFindScope);
  schema.pre('findOneAndUpdate', applyFindScope);
  schema.pre('findOneAndDelete', applyFindScope);
  schema.pre('findOneAndReplace', applyFindScope);
  schema.pre('replaceOne', applyFindScope);

  schema.pre('aggregate', function applyAggregateScope() {
    try {
      const opts = this.options || {};
      if (opts.skipOrganizationFilter) return;
      applyToPipeline(this.pipeline(), buildScopeFilter(getOrganizationContext()));
    } catch (_) {
      applyToPipeline(this.pipeline(), nothingFilter);
    }
  });

  const stampOrganization = (doc) => {
    const ctx = getOrganizationContext();
    if (!ctx || ctx.skipOrganizationFilter) return;
    const orgId = toObjectId(ctx.organizationId);
    if (!orgId) return;
    // Hospital users: always overwrite client-supplied tenancy.
    if (!ctx.isSuperAdmin) {
      doc.organizationId = orgId;
      return;
    }
    if (!doc.organizationId) doc.organizationId = orgId;
  };

  schema.pre('save', function stampOnSave() {
    stampOrganization(this);
  });

  schema.pre('insertMany', function stampInsertMany(next, docs) {
    const ctx = getOrganizationContext();
    if (!ctx || ctx.skipOrganizationFilter) return next();
    const orgId = toObjectId(ctx.organizationId);
    if (!orgId) return next();
    const list = Array.isArray(docs) ? docs : [];
    list.forEach((doc) => {
      if (!ctx.isSuperAdmin || !doc.organizationId) {
        doc.organizationId = orgId;
      }
    });
    next();
  });
};

module.exports = {
  applyOrganizationScope,
  buildScopeFilter,
  legacyMissingOrgFilter,
  legacyOrOrgFilter,
  nothingFilter,
  toObjectId,
};
