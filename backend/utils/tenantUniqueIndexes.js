/**
 * Hospital-scoped unique indexes.
 * Old single-field unique indexes (email, department name, …) blocked Hospital B
 * from creating the same staff role / master name that Hospital A already has.
 */
const sameKeys = (key, expected) => {
  const keys = Object.keys(key || {});
  const exp = Object.keys(expected);
  return keys.length === exp.length && exp.every((k) => key[k] === expected[k]);
};

const dropUniqueIf = async (coll, predicate, logger) => {
  let indexes = [];
  try {
    indexes = await coll.indexes();
  } catch (err) {
    if (err.codeName === 'NamespaceNotFound' || err.code === 26) return;
    throw err;
  }
  for (const idx of indexes) {
    if (!idx.unique || idx.name === '_id_' || !idx.key) continue;
    if (!predicate(idx)) continue;
    try {
      await coll.dropIndex(idx.name);
      logger.info(`Dropped leftover unique index ${coll.collectionName}.${idx.name}`);
    } catch (err) {
      if (err.codeName !== 'IndexNotFound' && err.code !== 27) {
        logger.warn(`Could not drop ${coll.collectionName}.${idx.name}: ${err.message}`);
      }
    }
  }
};

const ensureUnique = async (coll, spec, options, logger) => {
  let indexes = [];
  try {
    indexes = await coll.indexes();
  } catch (err) {
    if (err.codeName === 'NamespaceNotFound' || err.code === 26) {
      await coll.createIndex(spec, options);
      return;
    }
    throw err;
  }
  const existing = indexes.find((idx) => sameKeys(idx.key, spec));
  if (existing?.unique) return;
  if (existing) {
    try {
      await coll.dropIndex(existing.name);
    } catch (err) {
      logger.warn(`Could not replace ${coll.collectionName}.${existing.name}: ${err.message}`);
      return;
    }
  }
  try {
    await coll.createIndex(spec, options);
    logger.info(`Ensured unique index ${coll.collectionName}.${options.name || Object.keys(spec).join('_')}`);
  } catch (err) {
    logger.warn(`Could not create unique index on ${coll.collectionName}: ${err.message}`);
  }
};

const STRING_PRESENT = { $type: 'string', $gt: '' };

const COLLECTION_PLANS = [
  {
    name: 'users',
    drop: (idx) => {
      const keys = Object.keys(idx.key || {});
      if (sameKeys(idx.key, { email: 1 })) return true;
      if (sameKeys(idx.key, { employeeId: 1 })) return true;
      if (sameKeys(idx.key, { role: 1 }) && idx.unique) return true;
      if (sameKeys(idx.key, { phone: 1 }) && idx.unique) return true;
      if (keys.length === 1 && keys[0] === 'organizationId' && idx.unique) return true;
      return false;
    },
    ensure: [
      { spec: { organizationId: 1, email: 1 }, options: { unique: true, name: 'organizationId_1_email_1' } },
      {
        spec: { organizationId: 1, employeeId: 1 },
        options: {
          unique: true,
          name: 'organizationId_1_employeeId_1',
          partialFilterExpression: { employeeId: STRING_PRESENT },
        },
      },
    ],
  },
  {
    name: 'departments',
    drop: (idx) => sameKeys(idx.key, { name: 1 }) || sameKeys(idx.key, { code: 1 }),
    ensure: [
      { spec: { organizationId: 1, name: 1 }, options: { unique: true, name: 'organizationId_1_name_1' } },
      {
        spec: { organizationId: 1, code: 1 },
        options: {
          unique: true,
          name: 'organizationId_1_code_1',
          partialFilterExpression: { code: STRING_PRESENT },
        },
      },
    ],
  },
  {
    name: 'wards',
    drop: (idx) => sameKeys(idx.key, { name: 1 }) || sameKeys(idx.key, { code: 1 }),
    ensure: [
      { spec: { organizationId: 1, name: 1 }, options: { unique: true, name: 'organizationId_1_name_1' } },
      {
        spec: { organizationId: 1, code: 1 },
        options: {
          unique: true,
          name: 'organizationId_1_code_1',
          partialFilterExpression: { code: STRING_PRESENT },
        },
      },
    ],
  },
];

const ensureTenantUniqueIndexes = async (mongoose, logger) => {
  const db = mongoose.connection?.db;
  if (!db) return;

  for (const plan of COLLECTION_PLANS) {
    try {
      const coll = db.collection(plan.name);
      await dropUniqueIf(coll, plan.drop, logger);
      for (const item of plan.ensure) {
        await ensureUnique(coll, item.spec, item.options, logger);
      }
    } catch (err) {
      logger.warn(`Tenant unique index setup skipped for ${plan.name}: ${err.message}`);
    }
  }
};

module.exports = { ensureTenantUniqueIndexes, sameKeys };
