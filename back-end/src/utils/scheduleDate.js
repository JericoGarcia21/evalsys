const parseScheduleDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59) return null;
  const date = new Date(value);
  const calendarDay = new Date(value.slice(0, 10) + 'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  return date;
};
module.exports = { parseScheduleDate };
