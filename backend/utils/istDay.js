const IST_TIMEZONE = 'Asia/Kolkata';
const HAS_TZ = /[zZ]|[+-]\d{2}:\d{2}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const NAIVE_DT = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(\.\d+)?)?$/;

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

/** Inclusive India-day range. `to` is exclusive (start of the next IST day). */
const inclusiveIstRange = (fromValue, toValue) => {
  const startIso = kolkataDate(fromValue || toValue || kolkataToday());
  const endIso = kolkataDate(toValue || fromValue || kolkataToday());
  const start = istDayBounds(startIso);
  const end = istDayBounds(endIso);
  if (start.from.getTime() <= end.from.getTime()) {
    return { isoFrom: startIso, isoTo: endIso, from: start.from, to: end.to };
  }
  return { isoFrom: endIso, isoTo: startIso, from: end.from, to: start.to };
};

/**
 * Parse a Date, ISO string, or <input type="datetime-local"> value.
 * Naive strings (no Z / offset) are always India time, not the server timezone.
 */
const parseIstDateTime = (value) => {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const s = String(value).trim();
  if (!s) return null;
  if (DATE_ONLY.test(s)) {
    const d = new Date(`${s}T00:00:00.000+05:30`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const naive = s.match(NAIVE_DT);
  if (naive && !HAS_TZ.test(s)) {
    const d = new Date(`${naive[1]}:${naive[2] || '00'}${naive[3] || ''}+05:30`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const istParts = (date, options) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: IST_TIMEZONE, ...options }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return { get, parts };
};

/** dd/mm/yyyy in India time */
const formatIstDate = (value) => {
  const d = parseIstDateTime(value);
  if (!d) return '';
  const { get } = istParts(d, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${get('day')}/${get('month')}/${get('year')}`;
};

/** Paper style: 08/07/2026 AT 12:00PM in India time */
const formatIstDateTime = (value) => {
  const d = parseIstDateTime(value);
  if (!d) return '';
  const date = formatIstDate(d);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const period = get('dayPeriod').replace(/[.\s]/g, '').toUpperCase();
  return `${date} AT ${get('hour')}:${get('minute')}${period}`;
};

/** yyyy-MM-ddTHH:mm for datetime-local, in India time */
const toIstDateTimeLocal = (value) => {
  const d = parseIstDateTime(value);
  if (!d) return '';
  const { get } = istParts(d, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
};

/** yyyy-MM-dd for input type=date, in India time */
const toIstDateInput = (value) => {
  const d = parseIstDateTime(value);
  if (!d) return '';
  return d.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
};

const normalizeDischargeDates = (details = {}) => {
  const next = { ...details };
  if (Object.prototype.hasOwnProperty.call(next, 'deliveryDate')) {
    next.deliveryDate = parseIstDateTime(next.deliveryDate);
  }
  if (next.obstetricHistory && typeof next.obstetricHistory === 'object') {
    next.obstetricHistory = { ...next.obstetricHistory };
    if (Object.prototype.hasOwnProperty.call(next.obstetricHistory, 'lmp')) {
      next.obstetricHistory.lmp = parseIstDateTime(next.obstetricHistory.lmp);
    }
    if (Object.prototype.hasOwnProperty.call(next.obstetricHistory, 'edd')) {
      next.obstetricHistory.edd = parseIstDateTime(next.obstetricHistory.edd);
    }
  }
  return next;
};

module.exports = {
  IST_TIMEZONE,
  kolkataToday,
  kolkataDate,
  addCalendarDays,
  istDayBounds,
  istDayFilter,
  inclusiveIstRange,
  parseIstDateTime,
  formatIstDate,
  formatIstDateTime,
  toIstDateTimeLocal,
  toIstDateInput,
  normalizeDischargeDates,
};
