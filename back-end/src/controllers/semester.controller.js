const Admin = require('../models/Admin');
const Subject = require('../models/Subject');
const Section = require('../models/Section');
const Group = require('../models/Group');
const Panel = require('../models/Panel');
const Rubric = require('../models/Rubric');
const Evaluation = require('../models/Evaluation');
const RegistrationLink = require('../models/RegistrationLink');
const SemesterArchive = require('../models/SemesterArchive');
const { atomic, fail, requireId, confirm, transactionalAudit } = require('../services/accountControl.service');
const { resolveExpectedPanelIds } = require('../utils/expectedPanels');
const { getPagination, paginatedPayload } = require('../utils/pagination');
const id = value => String(value?._id || value);

exports.startSemester = async (req, res) => {
  const subjectId = req.headers['x-subject-id'];
  requireId(subjectId, 'Subject');
  if (!(req.user.assignedSubjects || []).some(value => id(value) === subjectId)) fail('You are not assigned to this subject', 403);
  const semester = req.body.semester;
  if (typeof semester !== 'string' || !semester.trim() || semester.trim().length > 100) fail('Enter a semester label of 1–100 characters');
  const subject = await Subject.findById(subjectId);
  if (!subject) fail('Subject not found', 404);
  confirm(req, `ARCHIVE ${subject.code}`);
  const result = await atomic(async session => {
    // Recheck assignment inside the transaction, not just the authentication snapshot.
    const instructor = await Admin.findOne({ _id: req.user._id, assignedSubjects: subjectId, isActive: true }).session(session);
    if (!instructor) fail('You are not assigned to this subject', 403);
    const sections = await Section.find({ subject: subjectId, createdBy: instructor._id }).session(session).lean();
    const groups = await Group.find({ section: { $in: sections.map(section => section._id) }, createdBy: instructor._id }).session(session).lean();
    if (!groups.length) fail('There are no current groups to archive in this subject', 409);
    const evaluations = await Evaluation.find({ group: { $in: groups.map(group => group._id) }, isLegacyArchived: { $ne: true } }).session(session).lean();
    const panelIds = [...sections.flatMap(section => section.assignedPanels || []), ...groups.flatMap(group => [...(group.assignedPanels || []), ...(group.gradingPanelIds || [])]), ...evaluations.map(evaluation => evaluation.panel)];
    const panels = await Panel.find({ _id: { $in: panelIds } }).select('name email createdAt isActive').session(session).lean();
    const panelById = new Map(panels.map(panel => [id(panel), panel]));
    const panelCreatedAt = new Map(panels.map(panel => [id(panel), panel.createdAt]));
    const rubrics = await Rubric.find({ $or: [
      { _id: { $in: evaluations.map(evaluation => evaluation.rubric).filter(Boolean) } },
      { subject: subjectId, createdBy: instructor._id, isActive: true },
    ] }).session(session).lean();
    const rubricById = new Map(rubrics.map(rubric => [id(rubric), rubric]));
    const activeRubric = rubrics.find(rubric => rubric.isActive && id(rubric.createdBy) === id(instructor));
    const archivedAt = new Date();
    for (const group of groups) {
      const section = sections.find(section => id(section) === id(group.section));
      const records = evaluations.filter(evaluation => id(evaluation.group) === id(group));
      const submitted = records.filter(evaluation => evaluation.isSubmitted);
      const expected = resolveExpectedPanelIds({ group, sectionPanels: section.assignedPanels, groupPanels: group.assignedPanels, evaluations: submitted, panelCreatedAt });
      const expectedPanels = expected.ids.map(value => panelById.get(value)).filter(panel => panel && panel.isActive !== false);
      const missingPanels = expectedPanels.filter(panel => !submitted.some(evaluation => id(evaluation.panel) === id(panel))).map(panel => panel.name);
      const divisor = Math.max(expectedPanels.length, submitted.length, 1);
      const sums = {};
      for (const evaluation of submitted) for (const [key, score] of Object.entries(evaluation.scores || {})) sums[key] = (sums[key] || 0) + score;
      const averaged = Object.fromEntries(Object.entries(sums).map(([key, score]) => [key, Math.round(score / divisor * 100) / 100]));
      const finalTotal = submitted.length && !missingPanels.length ? Math.round(Object.values(sums).reduce((a, b) => a + b, 0) / divisor * 100) / 100 : null;
      await SemesterArchive.create([{
        instructor: instructor._id, subject: subject._id, semester: semester.trim(), archivedAt,
        snapshot: {
          subject: { code: subject.code, title: subject.title },
          group: { name: group.name, members: group.members }, block: section.block || section.name,
          instructor: { name: instructor.name, email: instructor.email },
          averaged, finalTotal, missingPanels, status: !submitted.length ? 'Not graded' : missingPanels.length ? 'Incomplete' : 'Complete',
          activeRubric,
          evaluations: records.map(evaluation => ({
            scores: evaluation.scores, total: evaluation.total, comments: evaluation.comments,
            isSubmitted: evaluation.isSubmitted, submittedAt: evaluation.updatedAt,
            panel: panelById.get(id(evaluation.panel)) ? { name: panelById.get(id(evaluation.panel)).name, email: panelById.get(id(evaluation.panel)).email } : { name: evaluation.legacySnapshot?.panelName || 'Deleted panel' },
            rubric: rubricById.get(id(evaluation.rubric)) || null,
          })),
        },
      }], { session });
      for (const evaluation of records) {
        const panel = panelById.get(id(evaluation.panel));
        await Evaluation.updateOne({ _id: evaluation._id }, { $set: { isLegacyArchived: true, legacyArchivedAt: archivedAt, legacySnapshot: {
          groupName: group.name, block: section.block || section.name, subject: `${subject.code} - ${subject.title}`,
          panelName: panel?.name || evaluation.legacySnapshot?.panelName || 'Deleted panel', panelEmail: panel?.email || '',
          instructorName: instructor.name, instructorEmail: instructor.email, members: group.members,
        } } }, { session });
      }
    }
    await Group.deleteMany({ _id: { $in: groups.map(group => group._id) } }).session(session);
    // Old registration links must not admit students into the new semester accidentally.
    await RegistrationLink.updateMany({ createdBy: instructor._id, subject: subjectId }, { $set: { isActive: false } }).session(session);
    await transactionalAudit(req, 'subject.semester-archived', { subjectId, semester: semester.trim(), archivedGroups: groups.length, archivedResults: evaluations.length }, session);
    return { message: 'Semester archived. Old groups were cleared; subject, rubric, blocks and panel assignments are ready for the next semester.', archivedGroups: groups.length, archivedResults: evaluations.length };
  });
  res.json(result);
};

exports.myArchive = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const filter = { instructor: req.user._id };
  // Archive ownership survives later changes to subject assignments.
  if (req.query.subject) { requireId(req.query.subject, 'Subject'); filter.subject = req.query.subject; }
  const pagination = getPagination({ query: { ...req.query, paginate: 'true' } }, { defaultLimit: 20, maxLimit: 50 });
  const items = await SemesterArchive.find(filter).sort({ archivedAt: -1, _id: -1 }).skip(pagination.skip).limit(pagination.limit).lean();
  const total = await SemesterArchive.countDocuments(filter);
  res.json(paginatedPayload(items, total, pagination));
};
