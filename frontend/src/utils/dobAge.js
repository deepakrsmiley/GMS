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

/** Age in completed years from a day / month / year date of birth. */
export const ageFromDobParts = (day, month, year) => {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!d || !m || !y || String(year).length !== 4) return null;
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dob = new Date(Date.UTC(y, m - 1, d));
  if (dob.getUTCFullYear() !== y || dob.getUTCMonth() !== m - 1 || dob.getUTCDate() !== d) return null;
  if (dob.getTime() > Date.now()) return null;

  const today = new Date();
  let age = today.getFullYear() - y;
  const monthNow = today.getMonth() + 1;
  const dayNow = today.getDate();
  if (monthNow < m || (monthNow === m && dayNow < d)) age -= 1;
  return age >= 0 ? age : null;
};

export const dobPayloadFromParts = (parts = {}) => {
  const age = ageFromDobParts(parts.day, parts.month, parts.year);
  if (age == null) return null;
  const y = String(parts.year);
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return { age, dob: `${y}-${m}-${d}` };
};
