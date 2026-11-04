export const emptyDobParts = () => ({ day: '', month: '', year: '' });

export const partsFromDob = (value) => {
  if (!value) return emptyDobParts();
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return emptyDobParts();
  return {
    day: String(dt.getUTCDate()),
    month: String(dt.getUTCMonth() + 1),
    year: String(dt.getUTCFullYear()),
  };
};

const validDobParts = (day, month, year) => {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!d || !m || !y || String(year).length !== 4) return null;
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dob = new Date(Date.UTC(y, m - 1, d));
  if (dob.getUTCFullYear() !== y || dob.getUTCMonth() !== m - 1 || dob.getUTCDate() !== d) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (dob.getTime() > todayUtc) return null;
  return { d, m, y, today, todayUtc, dobUtc: dob.getTime() };
};

const unit = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** Completed years, months, and days, plus the total number of days lived. */
export const ageDetailFromDobParts = (day, month, year) => {
  const parts = validDobParts(day, month, year);
  if (!parts) return null;
  const { d, m, y, today, todayUtc, dobUtc } = parts;
  let years = today.getFullYear() - y;
  let months = (today.getMonth() + 1) - m;
  let days = today.getDate() - d;
  if (days < 0) {
    months -= 1;
    days += new Date(today.getFullYear(), today.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return null;
  return {
    years,
    months,
    days,
    totalDays: Math.round((todayUtc - dobUtc) / 86400000),
  };
};

export const formatAgeDetail = (detail) => {
  if (!detail) return '';
  return `${unit(detail.years, 'year', 'years')}, ${unit(detail.months, 'month', 'months')}, ${unit(detail.days, 'day', 'days')}`;
};

/** Age label from a saved date of birth, or a plain year count when no date is stored. */
export const formatAgeLabel = (dob, fallbackYears) => {
  const parts = partsFromDob(dob);
  const detail = ageDetailFromDobParts(parts.day, parts.month, parts.year);
  if (detail) return `${formatAgeDetail(detail)} (${detail.totalDays} days)`;
  if (fallbackYears != null && fallbackYears !== '') return `${fallbackYears} yrs`;
  return '';
};

/** Age in completed years from a day / month / year date of birth. */
export const ageFromDobParts = (day, month, year) => {
  const detail = ageDetailFromDobParts(day, month, year);
  return detail ? detail.years : null;
};

export const dobPayloadFromParts = (parts = {}) => {
  const age = ageFromDobParts(parts.day, parts.month, parts.year);
  if (age == null) return null;
  const y = String(parts.year);
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return { age, dob: `${y}-${m}-${d}` };
};
