const mongoose = require('mongoose');
const logger = require('../utils/logger');

/** Remove indexes left from older schemas (e.g. unique user on patients). */
const cleanupStaleIndexes = async () => {
  try {
    const patients = mongoose.connection.db.collection('patients');
    const indexes = await patients.indexes();
    const stale = indexes.find((i) => i.name === 'user_1' || (i.key && Object.keys(i.key).length === 1 && i.key.user === 1));
    if (stale) {
      await patients.dropIndex(stale.name);
      logger.info(`Dropped stale patients index: ${stale.name}`);
    }
  } catch (error) {
    if (error.codeName !== 'IndexNotFound' && error.code !== 27) {
      logger.warn(`Stale index cleanup skipped: ${error.message}`);
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
