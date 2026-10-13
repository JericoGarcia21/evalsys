const Admin = require('../models/Admin');
const Subject = require('../models/Subject');
const Section = require('../models/Section');
const Group = require('../models/Group');
const Evaluation = require('../models/Evaluation');
const Rubric = require('../models/Rubric');
const RegistrationLink = require('../models/RegistrationLink');
const { recordAuditLog } = require('../services/audit.service');
const { getPagination, paginatedPayload } = require('../utils/pagination');

const isSuperadmin = (user) => user?.role === 'superadmin';
const isAssignedToSubject = (user, subjectId) => (
  isSuperadmin(user) ||
  (user?.assignedSubjects || []).some((id) => id.toString() === subjectId.toString())
);

const requireConfirmation = (req, expected, message = 'Invalid confirmation text') => {
  const actual = String(req.body?.confirmText || '').trim();
  return actual === expected ? null : { message, expected };
};

const archiveSubjectEvaluations = async (groupIds, subject) => {
  const evaluations = await Evaluation.find({
    $or: [{ group: { $in: groupIds } }, { subject: subject._id }],
    isLegacyArchived: { $ne: true },
  })
    .populate('panel', 'name email')
    .populate({
      path: 'group',
      select: 'name members section createdBy',
      populate: [
        {
          path: 'section',
          select: 'name block subject createdBy',
          populate: [
            { path: 'subject', select: 'code title' },
            { path: 'createdBy', select: 'name email' },
          ],
        },
        { path: 'createdBy', select: 'name email' },
      ],
    });

  const archivedAt = new Date();
  for (const evaluation of evaluations) {
    const group = evaluation.group;
    const section = group?.section;
    const snapshotSubject = section?.subject || subject;
    const instructor = group?.createdBy || section?.createdBy;
    evaluation.isLegacyArchived = true;
    evaluation.legacyArchivedAt = archivedAt;
    evaluation.legacySnapshot = {
      groupName: group?.name || evaluation.legacySnapshot?.groupName || 'Deleted group',
      block: section?.block || section?.name || evaluation.legacySnapshot?.block || 'Deleted block',
      subject: [snapshotSubject?.code, snapshotSubject?.title].filter(Boolean).join(' - ') ||
        evaluation.legacySnapshot?.subject ||
        `${subject.code} - ${subject.title}`,
      panelName: evaluation.panel?.name || evaluation.legacySnapshot?.panelName || 'Deleted panel',
      panelEmail: evaluation.panel?.email || evaluation.legacySnapshot?.panelEmail || '',
      instructorName: instructor?.name || evaluation.legacySnapshot?.instructorName || '',
      instructorEmail: instructor?.email || evaluation.legacySnapshot?.instructorEmail || '',
      members: group?.members || evaluation.legacySnapshot?.members || [],
    };
    await evaluation.save();
  }

  return evaluations.length;
};

const ensureInstructorSubjectLimits = async (adminIds = [], subjectId = null) => {
  if (!adminIds.length) return null;

  const instructors = await Admin.find({
    _id: { $in: adminIds },
    role: 'admin',
  }).select('name assignedSubjects subjectLimit');
  const instructorById = new Map(instructors.map((instructor) => [instructor._id.toString(), instructor]));

  const exceeded = adminIds
    .map((id) => instructorById.get(id.toString()))
    .filter(Boolean)
    .filter((instructor) => {
      const assignedSubjectIds = (instructor.assignedSubjects || []).map((id) => id.toString());
      const alreadyAssigned = subjectId && assignedSubjectIds.includes(subjectId.toString());
      const nextCount = assignedSubjectIds.length + (alreadyAssigned ? 0 : 1);
      return nextCount > (instructor.subjectLimit || 1);
    });

  if (!exceeded.length) return null;

  const names = exceeded
    .map((instructor) => `${instructor.name} (${instructor.assignedSubjects.length}/${instructor.subjectLimit || 1})`)
    .join(', ');

  return `The following instructor(s) have reached their subject limit: ${names}. Contact the owner so they can increase their subject limit and assign more subjects.`;
};

exports.getSubjects = async (req, res) => {
  let filter = { _id: { $in: req.user.assignedSubjects || [] } };
  if (isSuperadmin(req.user)) {
    const instructorId = req.headers['x-instructor-id'] || req.query.instructor;
    if (req.query.scope === 'all') {
      filter = {};
    } else {
      if (!instructorId) return res.json([]);
      const instructor = await Admin.findOne({ _id: instructorId, role: 'admin', isActive: true }).select('assignedSubjects');
      if (!instructor) return res.json([]);
      filter = { _id: { $in: instructor.assignedSubjects || [] } };
    }
  }
  const pagination = getPagination(req);
  const query = Subject.find(filter).sort({ createdAt: -1 });
  if (!pagination) return res.json(await query);
  const [subjects, total] = await Promise.all([
    query.skip(pagination.skip).limit(pagination.limit),
    Subject.countDocuments(filter),
  ]);
  return res.json(paginatedPayload(subjects, total, pagination));
};

exports.getPublicSubjects = async (_req, res) => {
  const subjects = await Subject.find({ isActive: true }).sort({ code: 1 });
  res.json(subjects);
};

exports.createSubject = async (req, res) => {
  const { code, title, adminIds = [] } = req.body;
  if (!code || !title) return res.status(400).json({ message: 'Code and title required' });

  const subject = await Subject.create({
    code,
    title,
    createdBy: req.user._id,
  });

  const assignedAdminIds = isSuperadmin(req.user) ? adminIds : [req.user._id];
  const limitMessage = await ensureInstructorSubjectLimits(assignedAdminIds, subject._id);
  if (limitMessage) {
    await Subject.findByIdAndDelete(subject._id);
    return res.status(400).json({ message: limitMessage });
  }

  if (assignedAdminIds.length > 0) {
    await Admin.updateMany(
      { _id: { $in: assignedAdminIds }, role: 'admin' },
      { $addToSet: { assignedSubjects: subject._id } }
    );
  }

  res.status(201).json(subject);
};

exports.updateSubject = async (req, res) => {
  const subject = await Subject.findById(req.params.id);
  if (!subject) return res.status(404).json({ message: 'Subject not found' });
  if (!isAssignedToSubject(req.user, subject._id)) {
    return res.status(403).json({ message: 'You are not assigned to this subject' });
  }

  const { code, title, isActive } = req.body;
  if (code !== undefined) subject.code = code;
  if (title !== undefined) subject.title = title;
  if (isActive !== undefined) subject.isActive = isActive;
  await subject.save();
  res.json(subject);
};

exports.assignSubjectAdmins = async (req, res) => {
  const { adminIds } = req.body;
  if (!Array.isArray(adminIds)) return res.status(400).json({ message: 'adminIds array required' });

  const subject = await Subject.findById(req.params.id);
  if (!subject) return res.status(404).json({ message: 'Subject not found' });

  const limitMessage = await ensureInstructorSubjectLimits(adminIds, subject._id);
  if (limitMessage) return res.status(400).json({ message: limitMessage });

  await Admin.updateMany({ role: 'admin' }, { $pull: { assignedSubjects: subject._id } });
  if (adminIds.length > 0) {
    await Admin.updateMany(
      { _id: { $in: adminIds }, role: 'admin' },
      { $addToSet: { assignedSubjects: subject._id } }
    );
  }

  res.json({ message: 'Subject instructor assignments updated' });
};

exports.deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);
    if (!subject) return res.status(404).json({ message: 'Subject not found' });
    const confirmationError = requireConfirmation(req, `DELETE ${subject.code}`);
    if (confirmationError) return res.status(400).json(confirmationError);

    // 1. Find all sections belonging to this subject
    const sections = await Section.find({ subject: subject._id }).select('_id');
    const sectionIds = sections.map((s) => s._id);

    // 2. Find all groups in those sections
    const groups = await Group.find({ section: { $in: sectionIds } }).select('_id');
    const groupIds = groups.map((g) => g._id);

    // 3. Keep submitted scores as archived results before removing active setup
    const archivedResults = await archiveSubjectEvaluations(groupIds, subject);

    // 4. Delete groups
    await Group.deleteMany({ section: { $in: sectionIds } });

    // 5. Delete sections
    await Section.deleteMany({ subject: subject._id });

    // 6. Delete rubrics
    await Rubric.deleteMany({ subject: subject._id });

    // 7. Delete registration links
    await RegistrationLink.deleteMany({ subject: subject._id });

    // 8. Remove subject from all admins' assignedSubjects
    await Admin.updateMany(
      { assignedSubjects: subject._id },
      { $pull: { assignedSubjects: subject._id } }
    );

    // 9. Delete the subject itself
    await Subject.findByIdAndDelete(subject._id);

    await recordAuditLog(req, {
      action: 'subject.delete',
      entity: { type: 'subject', id: subject._id, name: `${subject.code} - ${subject.title}` },
      subject: subject._id,
      metadata: {
        confirmation: `DELETE ${subject.code}`,
        subjectCode: subject.code,
        subjectTitle: subject.title,
        deletedBlocks: sectionIds.length,
        deletedGroups: groupIds.length,
        archivedResults,
        deletedRubrics: 'all for subject',
        deletedRegistrationLinks: 'all for subject',
      },
    });

    res.json({
      message: `Subject "${subject.code} - ${subject.title}" deleted. Submitted results were moved to Archive.`,
      deleted: {
        sections: sectionIds.length,
        groups: groupIds.length,
        archivedResults,
        rubrics: '(all for subject)',
        registrationLinks: '(all for subject)',
      },
    });
  } catch (err) {
    console.error('Delete subject failed:', err);
    res.status(500).json({ message: 'Failed to delete subject', error: err.message });
  }
};

