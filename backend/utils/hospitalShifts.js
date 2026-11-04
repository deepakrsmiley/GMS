const { isSrinivasaHospital } = require('./hospitalA');

const IST_TIMEZONE = 'Asia/Kolkata';

const clockLabel = (hour) => {
  const h = ((Number(hour) % 24) + 24) % 24;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return {
    short: `${h12}${suffix}`,
    clock: `${String(h12).padStart(2, '0')}:00 ${suffix}`,
  };
};

const buildShift = (id, name, startHour, endHour) => {
  const start = clockLabel(startHour);
  const end = clockLabel(endHour);
  return {
    id,
    name,
    startHour,
    endHour,
    label: `${name}  ${start.short} - ${end.short}`,
    badge: `${name.toUpperCase()}  ${start.short}-${end.short}`,
    short: `${start.short}-${end.short}`,
    range: `${start.clock} to ${end.clock}`,
  };
};

/** Sri Sanjeevi and other hospitals: two 12-hour shifts from 7 AM. */
const DEFAULT_SHIFTS = [
  buildShift('morning', 'Morning', 7, 19),
  buildShift('night', 'Night', 19, 7),
];

/** Srinivasa hospital: two 12-hour shifts from 10 AM. */
const SRINIVASA_SHIFTS = [
  buildShift('morning', 'Morning', 10, 22),
  buildShift('night', 'Night', 22, 10),
];

const shiftsForOrganization = (org) => (
  isSrinivasaHospital(org) ? SRINIVASA_SHIFTS : DEFAULT_SHIFTS
);

const istHour = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).find((part) => part.type === 'hour')?.value;
  const n = Number(hour);
  if (!Number.isFinite(n)) return null;
  return n === 24 ? 0 : n;
};

/**
 * Daytime window is morning when startHour < endHour (7–19 or 10–22).
 * Hours outside that window, including after midnight, are night.
 */
const shiftIdForInstant = (value, schedule = DEFAULT_SHIFTS) => {
  const hour = istHour(value);
  if (hour == null) return 'morning';
  const morning = (schedule || []).find((shift) => shift.id === 'morning') || DEFAULT_SHIFTS[0];
  if (hour >= morning.startHour && hour < morning.endHour) return 'morning';
  return 'night';
};

const addIsoDays = (iso, days) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

const kolkataDate = (value) => new Intl.DateTimeFormat('en-CA', {
  timeZone: IST_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(value instanceof Date ? value : new Date(value));

const istAtHour = (iso, hour) => new Date(
  `${iso}T${String(hour).padStart(2, '0')}:00:00.000+05:30`,
);

/** One shift session. Night opens on dateIso and ends the next morning. */
const sessionBounds = (dateIso, shiftId, schedule = DEFAULT_SHIFTS) => {
  const list = schedule?.length ? schedule : DEFAULT_SHIFTS;
  const shift = list.find((row) => row.id === shiftId) || list[0];
  const iso = String(dateIso).slice(0, 10);
  const from = istAtHour(iso, shift.startHour);
  const endDate = shift.endHour <= shift.startHour ? addIsoDays(iso, 1) : iso;
  const to = istAtHour(endDate, shift.endHour);
  return {
    id: shift.id,
    name: shift.name,
    range: shift.range,
    from,
    to,
  };
};

const accountShiftId = (shift) => (shift === 'night' ? 'night' : 'morning');

/**
 * The session this shift account should show.
 * Inside the window, that running total. Before the window opens, the upcoming one (still ₹0).
 */
const currentOrNextSession = (shift, schedule = DEFAULT_SHIFTS, now = new Date()) => {
  const id = accountShiftId(shift);
  const today = kolkataDate(now);
  const candidates = [-1, 0, 1].map((offset) => sessionBounds(addIsoDays(today, offset), id, schedule));
  const t = now.getTime();
  const open = candidates.find((window) => t >= window.from.getTime() && t < window.to.getTime());
  if (open) return open;
  return candidates.find((window) => window.from.getTime() > t) || candidates[candidates.length - 1];
};

module.exports = {
  DEFAULT_SHIFTS,
  SRINIVASA_SHIFTS,
  shiftsForOrganization,
  istHour,
  shiftIdForInstant,
  sessionBounds,
  accountShiftId,
  currentOrNextSession,
};
