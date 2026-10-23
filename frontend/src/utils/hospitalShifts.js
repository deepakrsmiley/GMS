import { isSrinivasaHospital } from './hospitalA';

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

const DEFAULT_SHIFTS = [
  buildShift('morning', 'Morning', 7, 19),
  buildShift('night', 'Night', 19, 7),
];

const SRINIVASA_SHIFTS = [
  buildShift('morning', 'Morning', 10, 22),
  buildShift('night', 'Night', 22, 10),
];

export const shiftsForOrganization = (org) => (
  isSrinivasaHospital(org) ? SRINIVASA_SHIFTS : DEFAULT_SHIFTS
);

export const istHour = (value) => {
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

export const shiftIdForInstant = (value, schedule = DEFAULT_SHIFTS) => {
  const hour = istHour(value);
  if (hour == null) return 'morning';
  const morning = (schedule || []).find((shift) => shift.id === 'morning') || DEFAULT_SHIFTS[0];
  if (hour >= morning.startHour && hour < morning.endHour) return 'morning';
  return 'night';
};

export const shiftById = (schedule, id) => (
  (schedule || DEFAULT_SHIFTS).find((shift) => shift.id === id) || null
);
