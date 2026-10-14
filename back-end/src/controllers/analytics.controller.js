const Admin = require('../models/Admin');
const Panel = require('../models/Panel');
const Subject = require('../models/Subject');
const Section = require('../models/Section');
const Group = require('../models/Group');
const Evaluation = require('../models/Evaluation');
const RegistrationLink = require('../models/RegistrationLink');

exports.getAnalytics = async (req, res) => {
  const days = Number(req.query.days ?? 30);
  if (![7, 30, 90].includes(days)) return res.status(400).json({ message: 'Analytics range must be 7, 30, or 90 days.' });
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
      { $set: { _expectedIds: { $setUnion: [{ $ifNull: ['$assignedPanels', []] }, { $ifNull: ['$_section.assignedPanels', []] }] } } },
      { $lookup: { from: Panel.collection.name, localField: '_expectedIds', foreignField: '_id', pipeline: [{ $project: { _id: 1 } }], as: '_panels' } },
      { $lookup: {
        from: Evaluation.collection.name,
        let: { groupId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$group', '$$groupId'] }, isSubmitted: true, isLegacyArchived: { $ne: true } } },
          { $project: { panel: 1 } },
        ],
        as: '_evaluations',
      } },
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
          { $group: { _id: { $ifNull: ['$_section.subject', null] }, groups: { $sum: 1 }, students: { $sum: '$_students' }, complete: countWhen({ $eq: ['$_status', 'complete'] }), proposals: countWhen('$_hasProposal') } },
          { $sort: { groups: -1, _id: 1 } }, { $limit: 10 },
          { $lookup: { from: Subject.collection.name, localField: '_id', foreignField: '_id', as: '_subject' } },
          { $project: { _id: 0, subjectId: '$_id', code: { $ifNull: [{ $arrayElemAt: ['$_subject.code', 0] }, 'Unlinked subject'] }, title: { $ifNull: [{ $arrayElemAt: ['$_subject.title', 0] }, ''] }, groups: 1, students: 1, complete: 1, proposals: 1 } },
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
  res.json({
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
  });
};
