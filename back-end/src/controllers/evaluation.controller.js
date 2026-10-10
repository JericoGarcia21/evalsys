const { getAssignedPanels } = require('../utils/panelAssignments');
const Evaluation = require('../models/Evaluation');
const Group = require('../models/Group');
const Section = require('../models/Section');
const Rubric = require('../models/Rubric');
const Admin = require('../models/Admin');
const Subject = require('../models/Subject');
const RegistrationLink = require('../models/RegistrationLink');
const { recordAuditLog } = require('../services/audit.service');

const getSubjectId = (req) => req.headers['x-subject-id'] || req.query.subject || req.body.subject;
const getOwnerId = (req) => req.user?.role === 'superadmin'
  ? req.instructorContext?._id
  : req.user?._id;
const canAccessSubject = (req, subjectId) => (
  !subjectId ||
  req.user?.role === 'superadmin' ||
  (req.user?.assignedSubjects || []).some((id) => id.toString() === subjectId.toString())
);

const scoresToObject = (scores) => {
  if (!scores) return {};
  if (scores instanceof Map) return Object.fromEntries(scores);
  return scores;
};

const formatMemberName = (member) => {
  if (typeof member === 'string') return member;
  return [member.firstName, member.middleName, member.lastName].filter(Boolean).join(' ');
};

const formatMemberList = (members = [], separator = '; ') => members
  .map(formatMemberName)
  .filter(Boolean)
  .join(separator);

const getPanelName = (evaluation) => (
  evaluation.panel?.name ||
  evaluation.legacySnapshot?.panelName ||
  'Deleted panel'
);

const serializeEvaluation = (evaluation) => {
  if (!evaluation) return null;
  const obj = evaluation.toObject ? evaluation.toObject() : evaluation;
  return {
    ...obj,
    scores: scoresToObject(evaluation.scores),
  };
};

const serializeCriteria = (criteria = []) => criteria.map((item) => ({
  key: item.key,
  label: item.label,
  maxScore: item.maxScore,
}));

const mergeCriteria = (...criteriaLists) => {
  const criteriaByKey = new Map();

  criteriaLists.flat().forEach((criteria) => {
    if (!criteria?.key || criteriaByKey.has(criteria.key)) return;
    criteriaByKey.set(criteria.key, criteria);
  });

  return Array.from(criteriaByKey.values());
};

const requireConfirmation = (req, expected, message = 'Invalid confirmation text') => {
  const actual = String(req.body?.confirmText || '').trim();
  return actual === expected ? null : { message, expected };
};

const archiveSubjectEvaluations = async (groupIds, instructor) => {
  const evaluations = await Evaluation.find({
    group: { $in: groupIds },
    isLegacyArchived: { $ne: true },
  })
    .populate('panel', 'name email')
    .populate({
      path: 'group',
      select: 'name members section',
      populate: {
        path: 'section',
        select: 'name block subject',
        populate: { path: 'subject', select: 'code title' },
      },
    });

  const archivedAt = new Date();
  for (const evaluation of evaluations) {
    const group = evaluation.group;
    const section = group?.section;
    const subject = section?.subject;
    evaluation.isLegacyArchived = true;
    evaluation.legacyArchivedAt = archivedAt;
    evaluation.legacySnapshot = {
      groupName: group?.name || 'Deleted group',
      block: section?.block || section?.name || 'Deleted block',
      subject: [subject?.code, subject?.title].filter(Boolean).join(' - ') || 'Unknown subject',
      panelName: evaluation.panel?.name || 'Unknown panel',
      panelEmail: evaluation.panel?.email || '',
      instructorName: instructor?.name || 'Unknown instructor',
      instructorEmail: instructor?.email || '',
      members: group?.members || [],
    };
    await evaluation.save();
  }

  return evaluations.length;
};

// Admin: Clear (delete) a single evaluation record
exports.clearEvaluation = async (req, res) => {
  const { evaluationId } = req.params;
  try {
    const evaluation = await Evaluation.findById(evaluationId);
    if (!evaluation) return res.status(404).json({ message: 'Evaluation not found' });
    const group = await Group.findById(evaluation.group).populate('section', 'subject');
    if (
      !group ||
      !group.createdBy ||
      group.createdBy.toString() !== getOwnerId(req)?.toString()
    ) {
      return res.status(403).json({ message: 'This evaluation belongs to another instructor' });
    }
    const selectedSubject = getSubjectId(req);
    if (selectedSubject && group.section?.subject?.toString() !== selectedSubject.toString()) {
      return res.status(403).json({ message: 'This evaluation does not belong to the current subject' });
    }
    await evaluation.deleteOne();
    await recordAuditLog(req, {
      action: 'evaluation.clear',
      entity: { type: 'evaluation', id: evaluation._id },
      instructor: getOwnerId(req),
      subject: group.section?.subject,
    });
    res.json({ message: 'Evaluation cleared successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to clear evaluation', error: err.message });
  }
};

// Panel: submit or update their evaluation for a group
exports.submitEvaluation = async (req, res) => {
  const { groupId } = req.params;
  const { scores, rubricId } = req.body;

  const group = await Group.findById(groupId).populate('section');
  if (!group) return res.status(404).json({ message: 'Group not found' });

  // Check section-level panel assignment
  const section = group.section ? await Section.findById(group.section._id || group.section) : null;
  if (!section) return res.status(404).json({ message: 'Group block not found' });
  if (req.user.role === 'panel') {
    const subjectId = section?.subject?.toString();
    if (
      req.user.createdBy &&
      (
        !section?.createdBy ||
        section.createdBy.toString() !== req.user.createdBy.toString() ||
        !group.createdBy ||
        group.createdBy.toString() !== req.user.createdBy.toString()
      )
    ) {
      return res.status(403).json({ message: 'This group belongs to another instructor' });
    }
    if (req.user.createdBy) {
      const ownerCanGradeSubject = Boolean(subjectId) && await Admin.exists({
        _id: req.user.createdBy,
        role: 'admin',
        isActive: true,
        assignedSubjects: subjectId,
      });
      if (!ownerCanGradeSubject) {
        return res.status(403).json({ message: 'This group belongs to another instructor subject' });
      }
    }
    const subjectLocked = Boolean(subjectId) && Boolean(req.user.createdBy) && await Admin.exists({
      _id: req.user.createdBy,
      role: 'admin',
      isActive: true,
      gradingLockedSubjects: subjectId,
    });
    if (subjectLocked) {
      return res.status(403).json({ message: 'Grading is currently locked for this subject' });
    }
  }

  const rubric = await Rubric.findById(rubricId);
  if (!rubric) return res.status(404).json({ message: 'Rubric not found' });
  if (
    rubric.subject &&
    section?.subject &&
    rubric.subject.toString() !== section.subject.toString()
  ) {
    return res.status(400).json({ message: 'Selected rubric does not belong to this group subject' });
  }
  if (req.user.role === 'panel') {
    const rubricOwner = req.user.createdBy ||
      (await Admin.findOne({ role: 'admin', assignedSubjects: section?.subject }).select('_id').sort({ createdAt: -1 }))?._id;
    if (
      rubricOwner &&
      (!rubric.createdBy || rubric.createdBy.toString() !== rubricOwner.toString())
    ) {
      return res.status(400).json({ message: 'Selected rubric does not belong to this panel instructor' });
    }
  }

  const isAssigned = section && section.assignedPanels.some(
    (p) => p.toString() === req.user._id.toString()
  );

  // Fallback: also check group-level assignment for backward compatibility
  const isGroupAssigned = group.assignedPanels && group.assignedPanels.some(
    (p) => p.toString() === req.user._id.toString()
  );

  if (!isAssigned && !isGroupAssigned)
    return res.status(403).json({ message: 'You are not assigned to this group\'s section' });

  const total = rubric.criteria.reduce((sum, criterion) => sum + scores[criterion.key], 0);

  const evaluation = await Evaluation.findOneAndUpdate(
    { group: groupId, panel: req.user._id, isLegacyArchived: { $ne: true } },
    {
      scores,
      total,
      rubric: rubricId,
      subject: section.subject,
      comments: req.body.comments || '',
      isSubmitted: true,
    },
    { new: true, upsert: true, runValidators: true }
  );

  await recordAuditLog(req, {
    action: evaluation.createdAt?.getTime?.() === evaluation.updatedAt?.getTime?.()
      ? 'evaluation.submit'
      : 'evaluation.update',
    entity: { type: 'group', id: group._id, name: group.name },
    instructor: group.createdBy,
    subject: section.subject,
    metadata: { total: evaluation.total },
  });

  res.json(serializeEvaluation(evaluation));
};

// Panel: get their own evaluation for a group
exports.getMyEvaluation = async (req, res) => {
  const evaluation = await Evaluation.findOne({
    group: req.params.groupId,
    panel: req.user._id,
    isLegacyArchived: { $ne: true },
  }).populate('rubric');
  res.json(serializeEvaluation(evaluation));
};

// Admin: get all evaluations for a group + computed final result
exports.getGroupResult = async (req, res) => {
  const group = await Group.findById(req.params.groupId).populate('section', 'subject');
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!group.createdBy || group.createdBy.toString() !== getOwnerId(req)?.toString()) {
    return res.status(403).json({ message: 'This group belongs to another instructor' });
  }
  const selectedSubject = getSubjectId(req);
  if (!canAccessSubject(req, group.section?.subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });
  if (selectedSubject && group.section?.subject?.toString() !== selectedSubject.toString()) {
    return res.status(403).json({ message: 'This group does not belong to the current subject' });
  }

  const evaluations = await Evaluation.find({
    group: req.params.groupId,
    isSubmitted: true,
    isLegacyArchived: { $ne: true },
  }).populate('panel', 'name email').populate('rubric');

  if (!evaluations.length)
    return res.json({ evaluations: [], averaged: null, finalTotal: null });

  // Get the group to find the correct divisor (number of panels assigned to the block)
  const groupDoc = await Group.findById(req.params.groupId).populate('section');
  const divisor = Math.max(getAssignedPanels(groupDoc?.section?.assignedPanels || [], groupDoc?.assignedPanels || []).length, evaluations.length, 1);

  // Dynamically collect all categories used in these evaluations
  const averaged = {};
  const categorySums = {};

  evaluations.forEach(ev => {
    if (ev.scores instanceof Map) {
      ev.scores.forEach((val, key) => {
        categorySums[key] = (categorySums[key] || 0) + val;
      });
    } else {
      // Fallback for older data structure
      for (const [key, val] of Object.entries(ev.scores)) {
        categorySums[key] = (categorySums[key] || 0) + val;
      }
    }
  });

  for (const key in categorySums) {
    averaged[key] = Math.round((categorySums[key] / divisor) * 100) / 100;
  }

  const finalTotal = Math.round(
    Object.values(averaged).reduce((a, b) => a + b, 0) * 100
  ) / 100;

  const comments = evaluations.map(ev => ({
    panel: getPanelName(ev),
    text: ev.comments || ''
  })).filter(c => c.text);

  res.json({ evaluations, averaged, finalTotal, comments });
};

// Admin: get results for all groups in a section
exports.getSectionResults = async (req, res) => {
  const section = await Section.findById(req.params.sectionId)
    .select('subject createdBy assignedPanels')
    .populate('assignedPanels', 'name email');
  if (!section) return res.status(404).json({ message: 'Section not found' });
  if (!section.createdBy || section.createdBy.toString() !== getOwnerId(req)?.toString()) {
    return res.status(403).json({ message: 'This block does not belong to the current instructor' });
  }
  const selectedSubject = getSubjectId(req);
  if (selectedSubject && section.subject?.toString() !== selectedSubject.toString()) {
    return res.status(403).json({ message: 'This block does not belong to the current subject' });
  }
  if (!canAccessSubject(req, section.subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });

  const activeRubricFilter = { subject: section.subject, isActive: true };
  if (req.user.role === 'admin') activeRubricFilter.createdBy = req.user._id;
  if (req.user.role === 'superadmin' && (req.query.createdBy || req.headers['x-instructor-id'])) {
    activeRubricFilter.createdBy = req.query.createdBy || req.headers['x-instructor-id'];
  }
  const activeRubric = await Rubric.findOne(activeRubricFilter);
  const activeCriteria = serializeCriteria(activeRubric?.criteria || []);
  const groups = await Group.find({ section: req.params.sectionId, createdBy: getOwnerId(req) })
    .populate('assignedPanels', 'name email');
  const groupIds = groups.map((group) => group._id);
  const sectionEvaluations = groupIds.length ? await Evaluation.aggregate([
    {
      $match: {
        group: { $in: groupIds },
        isSubmitted: true,
        isLegacyArchived: { $ne: true },
      },
    },
    {
      $lookup: {
        from: 'panel_acc',
        localField: 'panel',
        foreignField: '_id',
        as: 'panel',
        pipeline: [{ $project: { name: 1, email: 1 } }],
      },
    },
    { $unwind: { path: '$panel', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'rubrics',
        localField: 'rubric',
        foreignField: '_id',
        as: 'rubric',
        pipeline: [{ $project: { criteria: 1, title: 1 } }],
      },
    },
    { $unwind: { path: '$rubric', preserveNullAndEmptyArrays: true } },
  ]) : [];
  const evaluationsByGroup = new Map();
  sectionEvaluations.forEach((evaluation) => {
    const key = evaluation.group.toString();
    if (!evaluationsByGroup.has(key)) evaluationsByGroup.set(key, []);
    evaluationsByGroup.get(key).push(evaluation);
  });
  const results = await Promise.all(
    groups.map((group) => {
      const evaluations = evaluationsByGroup.get(group._id.toString()) || [];

      // if (!evaluations.length) return { group, averaged: null, finalTotal: null };

      const assignedPanelDocs = getAssignedPanels(section.assignedPanels || [], group.assignedPanels || []);
      const divisor = Math.max(assignedPanelDocs.length, evaluations.length, 1);

      // Determine who has NOT evaluated yet
      const evaluatedPanelIds = evaluations.map(ev => ev.panel?._id?.toString() || '');
      const missingPanels = assignedPanelDocs
        .filter(p => p && !evaluatedPanelIds.includes(p._id.toString()))
        .map(p => p.name || 'Unknown');

      const isIncomplete = missingPanels.length > 0;

      const hasEvaluations = evaluations.length > 0;
      const averaged = hasEvaluations ? {} : null;
      const categorySums = {};

      if (hasEvaluations) {
        evaluations.forEach(ev => {
          if (ev.scores instanceof Map) {
            ev.scores.forEach((val, key) => {
              categorySums[key] = (categorySums[key] || 0) + val;
            });
          } else {
            for (const [key, val] of Object.entries(ev.scores)) {
              categorySums[key] = (categorySums[key] || 0) + val;
            }
          }
        });

        for (const key in categorySums) {
          averaged[key] = Math.round((categorySums[key] / divisor) * 100) / 100;
        }
      }

      const finalTotal = hasEvaluations 
        ? Math.round(Object.values(averaged).reduce((a, b) => a + b, 0) * 100) / 100
        : null;

      const evaluatedBy = evaluations.map(getPanelName);
      const comments = evaluations.map(ev => ({
        panel: getPanelName(ev),
        text: ev.comments || ''
      })).filter(c => c.text);

      const evaluationRecords = evaluations.map(ev => ({
        _id: ev._id,
        panelId: ev.panel?._id,
        panelName: getPanelName(ev),
      }));
      const evaluationCriteria = evaluations.flatMap(ev => serializeCriteria(ev.rubric?.criteria || []));
      const rubricCriteria = mergeCriteria(evaluationCriteria, activeCriteria);

      return { group, averaged, finalTotal, rubricCriteria, evaluatedBy, missingPanels, isIncomplete, comments, evaluationRecords };
    })
  );
  res.json(results);
};

// Admin: Export ALL results from ALL sections for archiving
exports.exportAllResults = async (req, res) => {
  if (req.user.role === 'admin' && req.user.csvExportLocked) return res.status(403).json({ message: 'CSV export is locked for this instructor' });
  const subject = getSubjectId(req);
  if (subject && !canAccessSubject(req, subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });

  const ownerId = getOwnerId(req);

  const sectionMatch = subject
    ? { subject: new (require('mongoose').Types.ObjectId)(subject), createdBy: ownerId }
    : req.user.role === 'admin'
      ? { subject: { $in: req.user.assignedSubjects || [] }, createdBy: req.user._id }
      : {};

  // Single aggregation pipeline: sections → groups → evaluations
  const rows = await Section.aggregate([
    { $match: sectionMatch },
    {
      $lookup: {
        from: 'groups',
        let: { sectionId: '$_id', ownerId: '$createdBy' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$section', '$$sectionId'] },
                  { $eq: ['$createdBy', '$$ownerId'] },
                ],
              },
            },
          },
          {
            $lookup: {
              from: 'evaluations',
              let: { groupId: '$_id' },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ['$group', '$$groupId'] },
                    isSubmitted: true,
                    isLegacyArchived: { $ne: true },
                  },
                },
                {
                  $lookup: {
                    from: 'panel_acc',
                    localField: 'panel',
                    foreignField: '_id',
                    as: 'panelDoc',
                    pipeline: [{ $project: { name: 1 } }],
                  },
                },
                { $unwind: { path: '$panelDoc', preserveNullAndEmptyArrays: true } },
              ],
              as: 'evaluations',
            },
          },
          {
            $lookup: {
              from: 'panel_acc',
              localField: 'assignedPanels',
              foreignField: '_id',
              as: 'assignedPanelDocs',
              pipeline: [{ $project: { name: 1 } }],
            },
          },
        ],
        as: 'groups',
      },
    },
    { $unwind: '$groups' },

    {
      $lookup: {
        from: 'panel_acc',
        localField: 'assignedPanels',
        foreignField: '_id',
        as: 'assignedPanelDocs',
        pipeline: [{ $project: { name: 1 } }],
      },
    },
  ]);

  const allResults = rows.map((row) => {
    const group = row.groups;
    const evaluations = group.evaluations || [];
    const assignedPanelDocs = getAssignedPanels(row.assignedPanelDocs || [], group.assignedPanelDocs || []);
    const divisor = Math.max(assignedPanelDocs.length, evaluations.length, 1);

    const evaluatedPanelIds = evaluations.map((ev) => (ev.panelDoc?._id || ev.panel)?.toString() || '');
    const missingPanels = assignedPanelDocs
      .filter((p) => p && !evaluatedPanelIds.includes(p._id.toString()))
      .map((p) => p.name || 'Unknown');
    const isIncomplete = missingPanels.length > 0 || evaluations.length === 0;

    let totalScore = 0;
    evaluations.forEach((ev) => {
      if (typeof ev.total === 'number') {
        totalScore += ev.total;
        return;
      }
      const scores = ev.scores instanceof Map ? Object.fromEntries(ev.scores) : ev.scores || {};
      totalScore += Object.values(scores).reduce((a, b) => a + Number(b || 0), 0);
    });

    const avgScore = Math.round((totalScore / divisor) * 100) / 100;
    const panelNames = evaluations.map((ev) => ev.panelDoc?.name || ev.legacySnapshot?.panelName || 'Deleted panel');

    return {
      Section: row.block,
      GroupName: group.name,
      Members: formatMemberList(group.members),
      AverageScore: isIncomplete ? 'Pending Complete Evaluation' : avgScore,
      EvaluatedBy: panelNames.join(', '),
      MissingPanels: missingPanels.join(', '),
      Status: isIncomplete ? 'Incomplete' : 'Complete',
      Comments: evaluations.map((ev) => ev.comments).filter(Boolean).join(' | '),
    };
  });

  await recordAuditLog(req, {
    action: 'results.export',
    entity: { type: 'results', name: subject ? 'subject' : 'all' },
    instructor: ownerId,
    subject,
    metadata: { rows: allResults.length },
  });

  res.json(allResults);
};

// Admin: Master Reset - Wipe all event data
exports.masterReset = async (req, res) => {
  try {
    const subject = getSubjectId(req);
    if (subject) {
      if (!canAccessSubject(req, subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });
      const ownerId = getOwnerId(req);
      if (!ownerId) return res.status(400).json({ message: 'Instructor owner is required for subject reset' });
      const subjectDoc = await Subject.findById(subject).select('code title');
      if (!subjectDoc) return res.status(404).json({ message: 'Subject not found' });
      const confirmationError = requireConfirmation(req, `RESET ${subjectDoc.code}`);
      if (confirmationError) return res.status(400).json(confirmationError);
      const sections = await Section.find({ subject, createdBy: ownerId }).select('_id');
      const sectionIds = sections.map((section) => section._id);
      const groups = await Group.find({ section: { $in: sectionIds }, createdBy: ownerId }).select('_id');
      const groupIds = groups.map((group) => group._id);
      const instructor = await Admin.findById(ownerId).select('name email');
      const archivedResults = await archiveSubjectEvaluations(groupIds, instructor);
      await Group.deleteMany({ _id: { $in: groupIds } });
      await Section.deleteMany({ _id: { $in: sectionIds }, createdBy: ownerId });
      await RegistrationLink.updateMany(
        { createdBy: ownerId, subject },
        { $pull: { sections: { $in: sectionIds } } }
      );
      await recordAuditLog(req, {
        action: 'subject.reset',
        instructor: ownerId,
        subject,
        metadata: {
          confirmation: `RESET ${subjectDoc.code}`,
          subjectCode: subjectDoc.code,
          subjectTitle: subjectDoc.title,
          deletedBlocks: sectionIds.length,
          deletedGroups: groupIds.length,
          archivedResults,
        },
      });
      return res.json({
        message: req.user.role === 'superadmin'
          ? 'Subject data reset. Submitted results were moved to Archive.'
          : 'Subject reset complete.',
        deletedBlocks: sectionIds.length,
        deletedGroups: groupIds.length,
        archivedResults,
      });
    }

    if (req.user.role !== 'superadmin') return res.status(403).json({ message: 'Global reset requires super admin access' });
    const confirmationError = requireConfirmation(req, 'RESET GLOBAL');
    if (confirmationError) return res.status(400).json(confirmationError);
    const [evaluationsCount, groupsCount, sectionsCount] = await Promise.all([
      Evaluation.countDocuments({}),
      Group.countDocuments({}),
      Section.countDocuments({}),
    ]);
    await Evaluation.deleteMany({});
    await Group.deleteMany({});
    await Section.deleteMany({});
    await recordAuditLog(req, {
      action: 'global.reset',
      metadata: {
        confirmation: 'RESET GLOBAL',
        deletedEvaluations: evaluationsCount,
        deletedGroups: groupsCount,
        deletedBlocks: sectionsCount,
      },
    });
    return res.json({
      message: 'System has been master reset successfully.',
      deletedEvaluations: evaluationsCount,
      deletedGroups: groupsCount,
      deletedBlocks: sectionsCount,
    });
  } catch (err) {
    res.status(500).json({ message: 'Reset failed', error: err.message });
  }
};
