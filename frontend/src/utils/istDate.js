export const IST_TIMEZONE = 'Asia/Kolkata';

export const istCalendarDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
  }
  return date.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
};
