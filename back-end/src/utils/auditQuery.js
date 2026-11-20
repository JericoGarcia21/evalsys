const { EXPORT_LIMIT: AUDIT_EXPORT_LIMIT, textFilter, utcDay, validatePagination: validateAuditPagination, csvDocument } = require('./reporting');

const buildAuditFilter = (query) => {
  const actor = textFilter(query, 'actor');
  const action = textFilter(query, 'action');
  const status = textFilter(query, 'status');
  const from = utcDay(textFilter(query, 'from', 10), 'from');
  const to = utcDay(textFilter(query, 'to', 10), 'to');
  if (status && !['success', 'failed'].includes(status)) throw new Error('status must be success or failed');
  if (from && to && from > to) throw new Error('from must be on or before to');

  const filter = {};
  if (actor) {
    const literal = actor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ 'actor.name': { $regex: literal, $options: 'i' } }, { 'actor.email': { $regex: literal, $options: 'i' } }];
  }
  if (action) filter.action = action;
  if (status) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lt = new Date(to.getTime() + 86400000);
  }
  return filter;
};

const auditCsv = (logs) => {
  const columns = ['ID', 'Timestamp (UTC)', 'Action', 'Status', 'Actor name', 'Actor email', 'Actor role', 'Entity type', 'Entity ID', 'Entity name', 'Instructor', 'Subject'];
  const rows = logs.map(log => [
    log._id, new Date(log.createdAt).toISOString(), log.action, log.status,
    log.actor?.name, log.actor?.email, log.actor?.role,
    log.entity?.type, log.entity?.id, log.entity?.name,
    log.instructor?.name, [log.subject?.code, log.subject?.title].filter(Boolean).join(' - '),
  ]);
  return csvDocument(columns, rows);
};

module.exports = { AUDIT_EXPORT_LIMIT, buildAuditFilter, validateAuditPagination, auditCsv };
