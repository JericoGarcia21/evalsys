const Admin = require('../models/Admin');
const Panel = require('../models/Panel');
const Subject = require('../models/Subject');
const Section = require('../models/Section');
const Group = require('../models/Group');
const Evaluation = require('../models/Evaluation');
const RegistrationLink = require('../models/RegistrationLink');
const { EXPORT_LIMIT, textFilter, csvDocument } = require('../utils/reporting');
const { recordAuditLog } = require('../services/audit.service');

const parseDays = value => {
  if (value === undefined) return 30;
  if (typeof value !== 'string' || !['7', '30', '90'].includes(value)) throw Object.assign(new Error('Analytics range must be 7, 30, or 90 days.'), { statusCode: 400 });
  return Number(value);
};

const collectAnalytics = async (days, allSubjects = false) => {
  const now = new Date();
  const since = new Date(now);
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - days + 1);
  const countWhen = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });
  const accountTotals = (model, match = {}) => model.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: 1 }, active: countWhen({ $eq: ['$isActive', true] }) } },
  ]);
  const [groupResults, instructors, panels, subjects, blocks, links, archivedEvaluations] = await Promise.all([
    Group.aggregate([
      { $lookup: { from: Section.collection.name, localField: 'section', foreignField: '_id', as: '_section' } },
      { $set: {
        _section: { $arrayElemAt: ['$_section', 0] },
        _students: { $size: { $ifNull: ['$members', []] } },
        _hasProposal: { $ne: [{ $ifNull: ['$proposalFile.path', ''] }, ''] },
      } },
      { $set: {
        _snapshotIds: { $ifNull: ['$gradingPanelIds', []] },
        _assignedIds: { $setUnion: [{ $ifNull: ['$assignedPanels', []] }, { $ifNull: ['$_section.assignedPanels', []] }] },
      } },
      { $lookup: {
        from: Evaluation.collection.name,
        let: { groupId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$group', '$$groupId'] }, isSubmitted: true, isLegacyArchived: { $ne: true } } },
          { $project: { panel: 1 } },
        ],
        as: '_evaluations',
      } },
      { $set: { _expectedIds: { $cond: [
        { $gt: [{ $size: '$_snapshotIds' }, 0] },
        '$_snapshotIds',
        { $cond: [{ $gt: [{ $size: '$_evaluations' }, 0] }, '$_evaluations.panel', '$_assignedIds'] },
      ] } } },
      { $lookup: { from: Panel.collection.name, localField: '_expectedIds', foreignField: '_id', pipeline: [{ $project: { _id: 1 } }], as: '_panels' } },
      { $set: {
        _missing: { $size: { $setDifference: ['$_panels._id', '$_evaluations.panel'] } },
        _submitted: { $size: { $setIntersection: ['$_panels._id', '$_evaluations.panel'] } },
      } },
      { $set: { _status: { $switch: {
        branches: [
          { case: { $eq: [{ $size: '$_panels' }, 0] }, then: 'unassigned' },
          { case: { $eq: ['$_missing', 0] }, then: 'complete' },
          { case: { $eq: ['$_submitted', 0] }, then: 'pending' },
        ],
        default: 'inProgress',
      } } } },
      { $facet: {
        totals: [{ $group: {
          _id: null, groups: { $sum: 1 }, students: { $sum: '$_students' },
          withProposal: countWhen('$_hasProposal'),
          proposalBytes: { $sum: { $cond: ['$_hasProposal', { $ifNull: ['$proposalFile.size', 0] }, 0] } },
          complete: countWhen({ $eq: ['$_status', 'complete'] }),
          inProgress: countWhen({ $eq: ['$_status', 'inProgress'] }),
          pending: countWhen({ $eq: ['$_status', 'pending'] }),
          unassigned: countWhen({ $eq: ['$_status', 'unassigned'] }),
          submittedEvaluations: { $sum: { $size: '$_evaluations' } },
        } }],
        registrations: [
          { $match: { createdAt: { $gte: since, $lte: now } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, groups: { $sum: 1 }, students: { $sum: '$_students' } } },
          { $sort: { _id: 1 } },
        ],
        bySubject: [
          { $group: {
            _id: { $ifNull: ['$_section.subject', null] }, groups: { $sum: 1 }, students: { $sum: '$_students' },
            complete: countWhen({ $eq: ['$_status', 'complete'] }), proposals: countWhen('$_hasProposal'),
            inProgress: countWhen({ $eq: ['$_status', 'inProgress'] }), pending: countWhen({ $eq: ['$_status', 'pending'] }),
            unassigned: countWhen({ $eq: ['$_status', 'unassigned'] }), submittedEvaluations: { $sum: { $size: '$_evaluations' } },
            proposalBytes: { $sum: { $cond: ['$_hasProposal', { $ifNull: ['$proposalFile.size', 0] }, 0] } },
          } },
          { $sort: { groups: -1, _id: 1 } }, { $limit: allSubjects ? EXPORT_LIMIT + 1 : 10 },
          { $lookup: { from: Subject.collection.name, localField: '_id', foreignField: '_id', as: '_subject' } },
          { $project: { _id: 0, subjectId: '$_id', code: { $ifNull: [{ $arrayElemAt: ['$_subject.code', 0] }, 'Unlinked subject'] }, title: { $ifNull: [{ $arrayElemAt: ['$_subject.title', 0] }, ''] }, groups: 1, students: 1, complete: 1, proposals: 1, inProgress: 1, pending: 1, unassigned: 1, submittedEvaluations: 1, proposalBytes: 1 } },
        ],
      } },
    ]),
    accountTotals(Admin, { role: 'admin' }),
    accountTotals(Panel),
    accountTotals(Subject),
    Section.countDocuments(),
    RegistrationLink.aggregate([{ $group: { _id: null, total: { $sum: 1 }, open: countWhen({ $and: [{ $eq: ['$isActive', true] }, { $gt: ['$expiresAt', now] }] }) } }]),
    Evaluation.countDocuments({ isLegacyArchived: true }),
  ]);
  const group = groupResults[0] || {};
  const totals = group.totals?.[0] || {};
  const normalizeAccounts = (rows) => {
    const row = rows[0] || { total: 0, active: 0 };
    return { total: row.total, active: row.active, inactive: row.total - row.active };
  };
  const dailyMap = new Map((group.registrations || []).map(day => [day._id, day]));
  const registrations = Array.from({ length: days }, (_, index) => {
    const date = new Date(since);
    date.setUTCDate(date.getUTCDate() + index);
    const label = date.toISOString().slice(0, 10);
    const day = dailyMap.get(label);
    return { date: label, groups: day?.groups || 0, students: day?.students || 0 };
  });
  return {
    scope: 'platform', generatedAt: now.toISOString(), days, timezone: 'UTC',
    totals: {
      students: totals.students || 0, groups: totals.groups || 0,
      instructors: normalizeAccounts(instructors), panels: normalizeAccounts(panels),
      subjects: normalizeAccounts(subjects), blocks,
      proposals: { uploaded: totals.withProposal || 0, missing: (totals.groups || 0) - (totals.withProposal || 0), storageMb: Math.round((totals.proposalBytes || 0) / 1048576 * 100) / 100 },
      grading: { complete: totals.complete || 0, inProgress: totals.inProgress || 0, pending: totals.pending || 0, unassigned: totals.unassigned || 0, submittedEvaluations: totals.submittedEvaluations || 0 },
      registrationLinks: { total: links[0]?.total || 0, open: links[0]?.open || 0 },
      archivedEvaluations,
    },
    period: registrations.reduce((sum, day) => ({ groups: sum.groups + day.groups, students: sum.students + day.students }), { groups: 0, students: 0 }),
    registrations, bySubject: group.bySubject || [],
  };
};

exports.getAnalytics = async (req, res) => res.json(await collectAnalytics(parseDays(req.query.days)));

exports.exportAnalytics = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const days = parseDays(req.query.days);
  const report = textFilter(req.query, 'report', 20);
  if (!['registrations', 'grading', 'proposals'].includes(report)) return res.status(400).json({ message: 'Choose registrations, grading, or proposals for the report' });
  const data = await collectAnalytics(days, report !== 'registrations');
  let headers, rows;
  if (report === 'registrations') {
    headers = ['Date (UTC)', 'Groups', 'Student entries', 'Period days', 'Generated at (UTC)'];
    rows = data.registrations.map(day => [day.date, day.groups, day.students, days, data.generatedAt]);
  } else if (report === 'grading') {
    headers = ['Scope', 'Subject', 'Title', 'Groups', 'Complete', 'In progress', 'Pending', 'Unassigned', 'Submitted evaluations', 'Generated at (UTC)'];
    const gradingRow = (scope, subject, title, stats) => [scope, subject, title, stats.groups, stats.complete, stats.inProgress, stats.pending, stats.unassigned, stats.submittedEvaluations, data.generatedAt];
    rows = [gradingRow('Platform', 'All subjects', '', { groups: data.totals.groups, ...data.totals.grading }), ...data.bySubject.map(subject => gradingRow('Subject', subject.code, subject.title, subject))];
  } else {
    headers = ['Scope', 'Subject', 'Title', 'Groups', 'Uploaded', 'Missing', 'Coverage (%)', 'Storage bytes', 'Generated at (UTC)'];
    const proposalRow = (scope, subject, title, groups, uploaded, bytes) => [scope, subject, title, groups, uploaded, groups - uploaded, groups ? Math.round(uploaded / groups * 10000) / 100 : 0, bytes, data.generatedAt];
    rows = [proposalRow('Platform', 'All subjects', '', data.totals.groups, data.totals.proposals.uploaded, data.bySubject.reduce((sum, subject) => sum + subject.proposalBytes, 0)), ...data.bySubject.map(subject => proposalRow('Subject', subject.code, subject.title, subject.groups, subject.proposals, subject.proposalBytes))];
  }
  if (rows.length > EXPORT_LIMIT) return res.status(413).json({ message: 'Analytics export exceeds 10,000 rows. A narrower report is required.' });
  const csv = csvDocument(headers, rows);
  await recordAuditLog(req, { action: `analytics.export.${report}`, entity: { type: 'analytics', name: report }, metadata: { rows: rows.length, days: report === 'registrations' ? days : undefined, generatedAt: data.generatedAt, scope: 'platform' } });
  res.type('text/csv').attachment(`evalsys_${report}_${data.generatedAt.slice(0, 10)}.csv`).send(csv);
};
