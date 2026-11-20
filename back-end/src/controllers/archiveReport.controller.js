const Evaluation = require('../models/Evaluation');
const { archiveFilter, archiveQuery, archiveCsv } = require('../services/archiveReport.service');
const { getPagination, paginatedPayload } = require('../utils/pagination');
const { EXPORT_LIMIT, validatePagination } = require('../utils/reporting');
const { recordAuditLog } = require('../services/audit.service');

exports.list = async (req, res) => {
  const filter = archiveFilter(req.query);
  validatePagination(req.query);
  const pagination = getPagination({ query: { ...req.query, paginate: 'true' } }, { defaultLimit: 25, maxLimit: 100 });
  const total = await Evaluation.countDocuments(filter);
  pagination.page = Math.min(pagination.page, Math.max(1, Math.ceil(total / pagination.limit)));
  pagination.skip = (pagination.page - 1) * pagination.limit;
  const items = await archiveQuery(filter).skip(pagination.skip).limit(pagination.limit).lean();
  res.set('Cache-Control', 'no-store');
  res.json(paginatedPayload(items, total, pagination));
};
exports.export = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const filter = archiveFilter(req.query);
  const rows = await archiveQuery(filter).limit(EXPORT_LIMIT + 1).lean();
  if (rows.length > EXPORT_LIMIT) return res.status(413).json({ message: 'Archive export exceeds 10,000 records. Narrow the filters and try again.' });
  const csv = archiveCsv(rows);
  await recordAuditLog(req, { action: 'archive.results.export', entity: { type: 'archive', name: 'Filtered results CSV' }, metadata: { rows: rows.length, filters: filter } });
  res.type('text/csv').attachment(`evalsys_archived_results_${new Date().toISOString().slice(0, 10)}.csv`).send(csv);
};
