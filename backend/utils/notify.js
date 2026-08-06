const Notification = require('../models/Notification');
const User = require('../models/User');

const serialize = (doc) => ({
  _id: doc._id,
  title: doc.title,
  message: doc.message,
  type: doc.type || 'info',
  link: doc.link || null,
  relatedId: doc.relatedId || null,
  relatedModel: doc.relatedModel || null,
  isRead: !!doc.isRead,
  createdAt: doc.createdAt,
  recipient: doc.recipient || null,
  recipientRole: doc.recipientRole || null,
});

const getIo = (reqOrIo) => {
  if (!reqOrIo) return null;
  if (typeof reqOrIo.to === 'function') return reqOrIo;
  return reqOrIo.app?.get?.('io') || null;
};

const emitToUser = (io, userId, payload) => {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit('notification', payload);
};

const emitToRole = (io, role, payload) => {
  if (!io || !role) return;
  io.to(`role:${role}`).emit('notification', payload);
};

/**
 * Persist + live-push a notification to one user.
 */
const notifyUser = async (reqOrIo, {
  userId,
  title,
  message,
  type = 'info',
  link,
  relatedId,
  relatedModel,
} = {}) => {
  try {
    if (!userId || !title || !message) return null;
    const doc = await Notification.create({
      title,
      message,
      type,
      recipient: userId,
      link,
      relatedId: relatedId ? String(relatedId) : undefined,
      relatedModel,
    });
    const payload = serialize(doc);
    emitToUser(getIo(reqOrIo), userId, payload);
    return payload;
  } catch {
    return null;
  }
};

/**
 * Notify many user ids (deduped).
 */
const notifyUsers = async (reqOrIo, { userIds = [], ...rest } = {}) => {
  const unique = [...new Set((userIds || []).map(String).filter(Boolean))];
  const out = [];
  for (const userId of unique) {
    const row = await notifyUser(reqOrIo, { ...rest, userId });
    if (row) out.push(row);
  }
  return out;
};

/**
 * Find active staff by role(s) and notify each personally (so mark-read works).
 * Also emits to role rooms for users who are online but not yet in DB fan-out race.
 */
const notifyRoles = async (reqOrIo, {
  roles = [],
  title,
  message,
  type = 'info',
  link,
  relatedId,
  relatedModel,
  excludeUserId,
} = {}) => {
  try {
    if (!roles.length || !title || !message) return [];
    const filter = { role: { $in: roles }, isActive: true };
    if (excludeUserId) filter._id = { $ne: excludeUserId };

    const users = await User.find(filter).select('_id role').lean();
    const io = getIo(reqOrIo);
    const out = [];

    for (const u of users) {
      const doc = await Notification.create({
        title,
        message,
        type,
        recipient: u._id,
        recipientRole: u.role,
        link,
        relatedId: relatedId ? String(relatedId) : undefined,
        relatedModel,
      });
      const payload = serialize(doc);
      emitToUser(io, u._id, payload);
      out.push(payload);
    }

    // If no matching users in DB, still ping role rooms for live clients
    if (!users.length) {
      for (const role of roles) {
        emitToRole(io, role, {
          title,
          message,
          type,
          link,
          relatedId,
          relatedModel,
          createdAt: new Date(),
        });
      }
    }

    return out;
  } catch {
    return [];
  }
};

/** Pharmacy stock-risk helpers */
const DAYS_NEAR_EXPIRY = 30;

const notifyPharmacyStockRisk = async (reqOrIo, medicine, { batchNumber, expiryDate } = {}) => {
  if (!medicine) return;
  const name = medicine.name || 'Medicine';
  const stock = Number(medicine.currentStock || 0);
  const min = Number(medicine.minimumStock ?? 10);
  const roles = ['Pharmacist', 'Admin', 'Super Admin'];

  if (stock <= 0) {
    await notifyRoles(reqOrIo, {
      roles,
      title: 'Out of stock',
      message: `"${name}" is out of stock`,
      type: 'pharmacy',
      link: '/pharmacy?tab=inventory',
      relatedId: medicine._id,
      relatedModel: 'Medicine',
    });
  } else if (stock <= min) {
    await notifyRoles(reqOrIo, {
      roles,
      title: 'Low stock',
      message: `"${name}" is low (${stock} left, min ${min})`,
      type: 'pharmacy',
      link: '/pharmacy?tab=inventory',
      relatedId: medicine._id,
      relatedModel: 'Medicine',
    });
  }

  if (expiryDate) {
    const exp = new Date(expiryDate);
    if (!Number.isNaN(exp.getTime())) {
      const days = Math.ceil((exp - Date.now()) / (24 * 60 * 60 * 1000));
      if (days >= 0 && days <= DAYS_NEAR_EXPIRY) {
        await notifyRoles(reqOrIo, {
          roles,
          title: 'Near expiry',
          message: `"${name}"${batchNumber ? ` batch ${batchNumber}` : ''} expires in ${days} day(s)`,
          type: 'warning',
          link: '/pharmacy/expiry-report',
          relatedId: medicine._id,
          relatedModel: 'Medicine',
        });
      }
    }
  }
};

module.exports = {
  notifyUser,
  notifyUsers,
  notifyRoles,
  notifyPharmacyStockRisk,
  serialize,
  DAYS_NEAR_EXPIRY,
};
