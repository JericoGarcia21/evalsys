const Evaluation = require('../models/Evaluation');
const { textFilter, literalRegex, utcDay, csvDocument } = require('../utils/reporting');
const { compareMembers } = require('../utils/alphabetical');

const archiveFilter = query => {
  const filter = { isLegacyArchived: true };
  for (const [key, field] of [['subject', 'subject'], ['block', 'block'], ['group', 'groupName']]) {
    const text = textFilter(query, key);
    if (text) filter[`legacySnapshot.${field}`] = literalRegex(text);
  }
  const from = utcDay(textFilter(query, 'from', 10), 'from');
  const to = utcDay(textFilter(query, 'to', 10), 'to');
  if (from && to && from > to) throw Object.assign(new Error('from must be on or before to'), { statusCode: 400 });
  if (from || to) {
    const date = { $ifNull: ['$legacyArchivedAt', '$updatedAt'] };
    filter.$expr = { $and: [
      ...(from ? [{ $gte: [date, from] }] : []),
      ...(to ? [{ $lt: [date, new Date(to.getTime() + 86400000)] }] : []),
    ] };
  }
  return filter;
};
const archiveQuery = filter => Evaluation.find(filter)
  .select('total comments scores isSubmitted legacySnapshot legacyArchivedAt updatedAt')
  .collation({ locale: 'en', strength: 1, numericOrdering: true })
  .sort({ 'legacySnapshot.groupName': 1, 'legacySnapshot.subject': 1, 'legacySnapshot.block': 1, 'legacySnapshot.panelName': 1, _id: 1 });

const archiveCsv = results => csvDocument(
  ['Subject', 'Instructor', 'Block', 'Group', 'Members', 'Panel', 'Panel Email', 'Scores', 'Total', 'Comments', 'Archived'],
  results.map(result => {
    const snapshot = result.legacySnapshot || {};
    const members = [...(snapshot.members || [])].filter(member => member && (typeof member === 'string' || typeof member === 'object')).sort(compareMembers)
      .map(member => typeof member === 'string' ? member : [member.firstName, member.middleName, member.lastName].filter(Boolean).join(' ')).join('; ');
    return [snapshot.subject, snapshot.instructorName, snapshot.block, snapshot.groupName, members, snapshot.panelName, snapshot.panelEmail, JSON.stringify(result.scores || {}), result.total ?? '', result.comments, result.legacyArchivedAt || result.updatedAt ? new Date(result.legacyArchivedAt || result.updatedAt).toISOString() : ''];
  }),
);
module.exports = { archiveFilter, archiveQuery, archiveCsv };
