const Asset = require('../models/Asset');
const BmeContract = require('../models/BmeContract');
const BmePreventiveMaintenance = require('../models/BmePreventiveMaintenance');
const BmeSparePart = require('../models/BmeSparePart');
const Notification = require('../models/Notification');
const { notifyRoles } = require('./notify');
const logger = require('./logger');

const BME_ROLES = ['Biomedical Engineer', 'Admin', 'Super Admin'];
const EXPIRY_THRESHOLDS = [90, 60, 30, 15, 7, 1];

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const daysUntil = (date) => {
  const ms = startOfDay(date) - startOfDay();
  return Math.round(ms / 86400000);
};

const alreadyNotifiedToday = async (relatedModel, relatedId) => {
  const todayStart = startOfDay();
  return Notification.findOne({
    relatedModel,
    relatedId: String(relatedId),
    createdAt: { $gte: todayStart },
  }).lean();
};

const runBemsReminders = async (io) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    // PM overdue / due today
    const pmDue = await BmePreventiveMaintenance.countDocuments({
      status: { $in: ['Scheduled', 'Overdue'] },
      scheduledDate: { $lte: todayEnd },
    });
    if (pmDue > 0 && !(await alreadyNotifiedToday('BmePmReminder', todayStart.toISOString().slice(0, 10)))) {
      await notifyRoles(io, {
        roles: BME_ROLES,
        title: pmDue ? 'PM Due / Overdue' : 'PM reminder',
        message: `${pmDue} preventive maintenance task(s) due today or overdue`,
        type: 'asset',
        link: '/biomedical?tab=pm',
        relatedId: todayStart.toISOString().slice(0, 10),
        relatedModel: 'BmePmReminder',
      });
      await BmePreventiveMaintenance.updateMany(
        { status: 'Scheduled', scheduledDate: { $lt: todayStart } },
        { $set: { status: 'Overdue' } }
      );
    }

    // Calibration overdue on master
    const calOverdue = await Asset.countDocuments({
      isActive: true,
      nextCalibrationDate: { $lt: todayStart },
      status: { $nin: ['Disposed', 'Condemned', 'Decommissioned'] },
    });
    if (calOverdue > 0 && !(await alreadyNotifiedToday('BmeCalReminder', todayStart.toISOString().slice(0, 10)))) {
      await notifyRoles(io, {
        roles: BME_ROLES,
        title: 'Calibration Overdue',
        message: `${calOverdue} equipment have overdue calibration`,
        type: 'asset',
        link: '/biomedical?tab=calibration',
        relatedId: todayStart.toISOString().slice(0, 10),
        relatedModel: 'BmeCalReminder',
      });
      await Asset.updateMany(
        { isActive: true, nextCalibrationDate: { $lt: todayStart }, status: 'Working' },
        { $set: { status: 'Calibration Due' } }
      );
    }

    // AMC / CMC expiry thresholds
    const contracts = await BmeContract.find({
      status: { $in: ['Active', 'Expiring Soon'] },
      endDate: { $gte: todayStart },
    }).populate('vendor', 'name');

    for (const c of contracts) {
      const days = daysUntil(c.endDate);
      if (!EXPIRY_THRESHOLDS.includes(days)) continue;
      const notified = Array.isArray(c.expiryNotifiedDays) ? c.expiryNotifiedDays : [];
      if (notified.includes(days)) continue;

      await notifyRoles(io, {
        roles: BME_ROLES,
        title: `${c.type} Expiry in ${days} day(s)`,
        message: `${c.contractNumber} (${c.vendor?.name || 'vendor'}) expires on ${c.endDate.toISOString().slice(0, 10)}`,
        type: 'asset',
        link: '/biomedical?tab=contracts',
        relatedId: c._id,
        relatedModel: 'BmeContract',
      });

      c.expiryNotifiedDays = [...notified, days];
      if (days <= 30) c.status = 'Expiring Soon';
      await c.save();
    }

    // Mark expired contracts
    await BmeContract.updateMany(
      { status: { $in: ['Active', 'Expiring Soon'] }, endDate: { $lt: todayStart } },
      { $set: { status: 'Expired' } }
    );

    // Warranty expiry (30 days)
    const warrantySoon = await Asset.countDocuments({
      isActive: true,
      warrantyExpiry: { $gte: todayStart, $lte: new Date(todayStart.getTime() + 30 * 86400000) },
    });
    if (warrantySoon > 0 && !(await alreadyNotifiedToday('BmeWarrantyReminder', todayStart.toISOString().slice(0, 10)))) {
      await notifyRoles(io, {
        roles: BME_ROLES,
        title: 'Warranty Expiring',
        message: `${warrantySoon} equipment warranty expire within 30 days`,
        type: 'asset',
        link: '/biomedical?tab=reports',
        relatedId: todayStart.toISOString().slice(0, 10),
        relatedModel: 'BmeWarrantyReminder',
      });
    }

    // Low spare stock
    const lowStock = await BmeSparePart.countDocuments({
      isActive: true,
      $expr: { $lte: ['$stock', '$reorderLevel'] },
    });
    if (lowStock > 0 && !(await alreadyNotifiedToday('BmeSpareReminder', todayStart.toISOString().slice(0, 10)))) {
      await notifyRoles(io, {
        roles: BME_ROLES,
        title: 'Spare Stock Low',
        message: `${lowStock} spare part(s) at or below reorder level`,
        type: 'asset',
        link: '/biomedical?tab=spares',
        relatedId: todayStart.toISOString().slice(0, 10),
        relatedModel: 'BmeSpareReminder',
      });
    }
  } catch (err) {
    logger.warn(`BEMS reminder job error: ${err.message}`);
  }
};

const startBemsReminderJob = (io) => {
  // Run shortly after boot, then every 6 hours
  setTimeout(() => runBemsReminders(io), 15000);
  setInterval(() => runBemsReminders(io), 6 * 60 * 60 * 1000);
  logger.info('BEMS reminder job scheduled');
};

module.exports = { startBemsReminderJob, runBemsReminders };
