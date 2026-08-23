const mongoose = require('mongoose');
const logger = require('../utils/logger');

/** Remove leftover unique indexes on user/userId that reject legitimate inserts. */
const STALE_UNIQUE_USER_FIELDS = ['user', 'userId', 'createdBy', 'addedBy'];
const STALE_INDEX_COLLECTIONS = [
  'patients', 'medicines', 'stockmovements', 'servicemasters',
  'activitylogs', 'notifications', 'ipadmissions',
];

const cleanupStaleIndexes = async () => {
  const db = mongoose.connection.db;
  for (const name of STALE_INDEX_COLLECTIONS) {
    try {
      const indexes = await db.collection(name).indexes();
      for (const idx of indexes) {
        if (!idx.unique || !idx.key) continue;
        const keys = Object.keys(idx.key);
        if (keys.length === 1 && STALE_UNIQUE_USER_FIELDS.includes(keys[0])) {
          await db.collection(name).dropIndex(idx.name);
          logger.info(`Dropped stale unique index ${name}.${idx.name}`);
        }
      }
    } catch (error) {
      if (error.codeName !== 'IndexNotFound' && error.code !== 27 && error.codeName !== 'NamespaceNotFound') {
        logger.warn(`Stale index cleanup skipped for ${name}: ${error.message}`);
      }
    }
  }
};

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hms';

  try {
    const conn = await mongoose.connect(mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    logger.info(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    await cleanupStaleIndexes();
    return conn;
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    throw error;
  }
};

module.exports = connectDB;
