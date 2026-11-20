const EXPORT_LIMIT = 10000;
const invalid = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
const textFilter = (query, key, maxLength = 120) => {
  const value = query[key];
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > maxLength) invalid(`${key} must be text up to ${maxLength} characters`);
  return value.trim();
};
const literalRegex = value => ({ $regex: value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' });
const utcDay = (value, key) => {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${key} must be a date (YYYY-MM-DD, UTC)`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid(`${key} must be a valid date`);
  return date;
};
const validatePagination = query => {
  for (const key of ['page', 'limit']) {
    if (query[key] !== undefined && (typeof query[key] !== 'string' || !/^[1-9]\d*$/.test(query[key]) || !Number.isSafeInteger(Number(query[key])))) invalid(`${key} must be a positive integer`);
  }
  if (query.page && (Number(query.page) - 1) * Math.min(Number(query.limit || 80), 200) > Number.MAX_SAFE_INTEGER) invalid('page is too large');
};
const csvCell = value => {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
const csvDocument = (headers, rows) => '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
module.exports = { EXPORT_LIMIT, textFilter, literalRegex, utcDay, validatePagination, csvCell, csvDocument };
