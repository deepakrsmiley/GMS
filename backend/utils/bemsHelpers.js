const BmeLifecycleEvent = require('../models/BmeLifecycleEvent');

const INTERVAL_DAYS = {
  'Every 30 Days': 30,
  'Every 90 Days': 90,
  'Every 6 Months': 180,
  'Every Year': 365,
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const recordLifecycle = async ({
  equipment,
  stage,
  title,
  description,
  relatedId,
  relatedModel,
  oldValue,
  newValue,
  user,
  occurredAt,
}) => {
  try {
    await BmeLifecycleEvent.create({
      equipment,
      stage,
      title,
      description,
      relatedId,
      relatedModel,
      oldValue,
      newValue,
      performedBy: user?._id,
      performedByName: user?.name,
      occurredAt: occurredAt || new Date(),
    });
  } catch (_) {
    /* never block */
  }
};

const resolvePmInterval = (scheduleType, customDays) =>
  INTERVAL_DAYS[scheduleType] || customDays || 90;

module.exports = {
  INTERVAL_DAYS,
  addDays,
  recordLifecycle,
  resolvePmInterval,
};
