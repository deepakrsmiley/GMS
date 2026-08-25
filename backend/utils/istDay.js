const IST_TIMEZONE = 'Asia/Kolkata';

const kolkataToday = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });

const kolkataDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
  }
  const raw = String(value || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return kolkataToday();
};

const addCalendarDays = (iso, days) => {
  const [year, month, day] = String(iso).split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  const yyyy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/** Inclusive start / exclusive end of an India calendar day (resets at 12:00 AM IST). */
const istDayBounds = (value) => {
  const iso = kolkataDate(value);
  const next = addCalendarDays(iso, 1);
  return {
    iso,
    from: new Date(`${iso}T00:00:00.000+05:30`),
    to: new Date(`${next}T00:00:00.000+05:30`),
  };
};

const istDayFilter = (field, value) => {
  const { from, to } = istDayBounds(value);
  return { [field]: { $gte: from, $lt: to } };
};

module.exports = {
  IST_TIMEZONE,
  kolkataToday,
  kolkataDate,
  addCalendarDays,
  istDayBounds,
  istDayFilter,
};
