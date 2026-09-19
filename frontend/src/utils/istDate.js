export const IST_TIMEZONE = 'Asia/Kolkata';

const HAS_TZ = /[zZ]|[+-]\d{2}:\d{2}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const NAIVE_DT = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(\.\d+)?)?$/;

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

export const addIstCalendarDays = (iso, days) => {
  const [year, month, day] = String(iso).split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  const yyyy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const istMonthStart = (value) => {
  const iso = istCalendarDate(value);
  return `${iso.slice(0, 7)}-01`;
};

export const istCalendarDate = (value = new Date()) => {
  const date = parseIstDateTime(value);
  if (!date) {
    return new Date().toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
  }
  return date.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
};

/** yyyy-MM-ddTHH:mm for datetime-local, locked to India time */
export const toIstDateTimeLocal = (value) => {
  const d = parseIstDateTime(value);
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
};

export const toIstDateInput = (value) => {
  const d = parseIstDateTime(value);
  if (!d) return '';
  return d.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
};

/** Send datetime-local as an explicit IST instant so the server timezone cannot shift it */
export const istDateTimeToIso = (localValue) => {
  if (!localValue) return '';
  const d = parseIstDateTime(localValue);
  return d ? d.toISOString() : '';
};

export const formatIstDate = (value) => {
  const d = parseIstDateTime(value);
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')}`;
};

/** Paper style: 08/07/2026 AT 12:00PM in India time */
export const formatIstDateTime = (value) => {
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
