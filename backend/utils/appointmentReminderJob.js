const Appointment = require('../models/Appointment');
const Notification = require('../models/Notification');
const { notifyRoles } = require('./notify');
const { runForEachOrganization } = require('./runForEachOrganization');
const logger = require('./logger');

const runAppointmentReminderForOrg = async (io) => {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  const dayKey = tomorrowStart.toISOString().slice(0, 10);
  const already = await Notification.findOne({
    relatedModel: 'AppointmentReminder',
    relatedId: dayKey,
    createdAt: { $gte: todayStart },
  }).lean();
  if (already) return;

  const count = await Appointment.countDocuments({
    appointmentDate: { $gte: tomorrowStart, $lt: tomorrowEnd },
    status: { $nin: ['cancelled', 'no_show'] },
  });
  if (!count) return;

  await notifyRoles(io, {
    roles: ['Receptionist', 'Admin', 'Super Admin'],
    title: "Tomorrow's appointments",
    message: `${count} appointment(s) scheduled for ${dayKey}`,
    type: 'appointment',
    link: '/appointments',
    relatedId: dayKey,
    relatedModel: 'AppointmentReminder',
  });
};

const runAppointmentReminder = async (io) => {
  try {
    await runForEachOrganization(() => runAppointmentReminderForOrg(io));
  } catch (err) {
    logger.warn?.(`Appointment reminder failed: ${err.message}`) || console.warn(err.message);
  }
};

const startAppointmentReminderJob = (io) => {
  setTimeout(() => runAppointmentReminder(io), 15 * 1000);
  setInterval(() => runAppointmentReminder(io), 60 * 60 * 1000);
};

module.exports = { startAppointmentReminderJob, runAppointmentReminder };
