const Section = require('../models/Section');
const Admin = require('../models/Admin');
const Panel = require('../models/Panel');
const Group = require('../models/Group');
const Evaluation = require('../models/Evaluation');
const RegistrationLink = require('../models/RegistrationLink');
const { getPagination, paginatedPayload } = require('../utils/pagination');
const { validateBody, sectionSchema } = require('../utils/validate');

const getSubjectId = (req) => req.headers['x-subject-id'] || req.query.subject || req.body.subject;
const getOwnerId = (req) => req.user?.role === 'superadmin'
  ? req.instructorContext?._id
  : req.user?._id;
const canAccessSubject = (req, subjectId) => (
  !subjectId ||
  req.user?.role === 'superadmin' ||
  (req.user?.assignedSubjects || []).some((id) => id.toString() === subjectId.toString())
);

const archiveBlockEvaluations = async (groupIds) => {
  const evaluations = await Evaluation.find({
    group: { $in: groupIds },
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
    const subject = section?.subject;
    const instructor = group?.createdBy || section?.createdBy;
    evaluation.isLegacyArchived = true;
    evaluation.legacyArchivedAt = archivedAt;
    evaluation.legacySnapshot = {
      groupName: group?.name || evaluation.legacySnapshot?.groupName || 'Deleted group',
      block: section?.block || section?.name || evaluation.legacySnapshot?.block || 'Deleted block',
      subject: [subject?.code, subject?.title].filter(Boolean).join(' - ') ||
        evaluation.legacySnapshot?.subject ||
        'Unknown subject',
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

const validatePanelAssignments = async (req, panelIds = [], subject) => {
  if (!Array.isArray(panelIds) || !panelIds.length) return null;

  const uniquePanelIds = [...new Set(panelIds.map((id) => id.toString()))];
  const panels = await Panel.find({ _id: { $in: uniquePanelIds }, isActive: true }).select('name createdBy');
  if (panels.length !== uniquePanelIds.length) {
    return 'One or more selected panels are inactive or missing';
  }

  for (const panel of panels) {
    const ownerId = getOwnerId(req);
    if (!panel.createdBy) {
      return `${panel.name} is old data without an instructor owner`;
    }
    if (!ownerId || panel.createdBy.toString() !== ownerId.toString()) {
      return `${panel.name} belongs to another instructor`;
    }

    const owner = await Admin.findOne({
      _id: panel.createdBy,
      role: 'admin',
      isActive: true,
      assignedSubjects: subject,
    }).select('_id');
    if (!owner) return `${panel.name}'s instructor is not assigned to this subject`;
  }

  return null;
};

exports.createSection = async (req, res) => {
  const { name, block, assignedPanels } = req.body;
  const subject = getSubjectId(req);
  const schemaError = validateBody(req.body, sectionSchema);
  if (schemaError) return res.status(400).json({ message: schemaError });
  if (!subject) return res.status(400).json({ message: 'Subject required' });
  if (!canAccessSubject(req, subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });
  const assignmentError = await validatePanelAssignments(req, assignedPanels, subject);
  if (assignmentError) return res.status(400).json({ message: assignmentError });
  const section = await Section.create({
    name,
    block,
    subject,
    createdBy: getOwnerId(req),
    assignedPanels: assignedPanels || [],
  });
  res.status(201).json(section);
};

exports.getSections = async (req, res) => {
  let filter = {};
  const subject = req.user ? getSubjectId(req) : req.query.subject;

  if (!req.user && subject) {
    filter.subject = subject;
  } else if (!req.user) {
    return res.status(400).json({ message: 'Subject is required to view public blocks' });
  } else if (req.user && req.user.role === 'panel') {
    const directlyAssignedSections = await Group.distinct('section', {
      assignedPanels: req.user._id,
      ...(req.user.createdBy ? { createdBy: req.user.createdBy } : {}),
    });
    filter = { $or: [
      { assignedPanels: req.user._id },
      { _id: { $in: directlyAssignedSections } },
    ] };
    if (req.user.createdBy) {
      const instructor = await Admin.findOne({ _id: req.user.createdBy, role: 'admin', isActive: true }).select('assignedSubjects');
      if (!instructor) return res.json([]);
      filter.subject = { $in: instructor.assignedSubjects || [] };
      filter.createdBy = req.user.createdBy;
    }
  } else if (req.user) {
    filter.createdBy = getOwnerId(req);
    if (subject) {
      if (!canAccessSubject(req, subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });
      filter.subject = subject;
    } else if (req.user.role === 'admin') {
      filter.subject = { $in: req.user.assignedSubjects || [] };
    }
  }
  
  const pagination = getPagination(req);
  const query = Section.find(filter)
    .populate('assignedPanels', 'name email')
    .populate('subject', 'code title')
    .sort({ createdAt: -1 });
  if (!pagination) return res.json(await query);

  const [sections, total] = await Promise.all([
    query.skip(pagination.skip).limit(pagination.limit),
    Section.countDocuments(filter),
  ]);
  return res.json(paginatedPayload(sections, total, pagination));
};

exports.updateSection = async (req, res) => {
  const existing = await Section.findById(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Section not found' });
  if (!existing.createdBy || existing.createdBy.toString() !== getOwnerId(req)?.toString()) {
    return res.status(403).json({ message: 'This block does not belong to the current instructor' });
  }
  const selectedSubject = getSubjectId(req);
  if (selectedSubject && existing.subject?.toString() !== selectedSubject.toString()) {
    return res.status(403).json({ message: 'This block does not belong to the current subject' });
  }
  if (!canAccessSubject(req, existing.subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });
  if (req.body.assignedPanels) {
    const assignmentError = await validatePanelAssignments(req, req.body.assignedPanels, existing.subject);
    if (assignmentError) return res.status(400).json({ message: assignmentError });
  }
  const updates = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.block !== undefined) updates.block = req.body.block;
  if (req.body.assignedPanels !== undefined) updates.assignedPanels = req.body.assignedPanels;
  const section = await Section.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    .populate('assignedPanels', 'name email');
  res.json(section);
};

exports.deleteSection = async (req, res) => {
  const section = await Section.findById(req.params.id);
  if (!section) return res.status(404).json({ message: 'Section not found' });
  if (!section.createdBy || section.createdBy.toString() !== getOwnerId(req)?.toString()) {
    return res.status(403).json({ message: 'This block does not belong to the current instructor' });
  }
  const selectedSubject = getSubjectId(req);
  if (selectedSubject && section.subject?.toString() !== selectedSubject.toString()) {
    return res.status(403).json({ message: 'This block does not belong to the current subject' });
  }
  if (!canAccessSubject(req, section.subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });
  const groups = await Group.find({ section: section._id }).select('_id');
  const groupIds = groups.map((group) => group._id);
  const archivedEvaluations = await archiveBlockEvaluations(groupIds);
  await Group.deleteMany({ section: section._id });
  await RegistrationLink.updateMany(
    { sections: section._id },
    { $pull: { sections: section._id } }
  );
  await section.deleteOne();
  res.json({
    message: archivedEvaluations > 0
      ? 'Block and groups deleted. Submitted results were moved to Archive.'
      : 'Block and groups deleted.',
    deletedGroups: groupIds.length,
    archivedEvaluations,
  });
};

exports.assignBlocksToPanel = async (req, res) => {
  const { panelId, sectionIds } = req.body;
  if (!panelId || !Array.isArray(sectionIds)) {
    return res.status(400).json({ message: 'panelId and sectionIds array required' });
  }
  const subject = getSubjectId(req);
  const ownerId = getOwnerId(req);
  if (!subject) return res.status(400).json({ message: 'Subject required' });
  if (!canAccessSubject(req, subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });

  const panel = await Panel.findById(panelId).select('createdBy isActive');
  if (!panel || !panel.isActive) {
    return res.status(404).json({ message: 'Panel account not found or inactive' });
  }

  if (!panel.createdBy) {
    return res.status(400).json({ message: 'This panel is old data without an instructor owner' });
  }
  if (!ownerId || panel.createdBy.toString() !== ownerId.toString()) {
    return res.status(403).json({ message: 'This panel belongs to another instructor' });
  }

  const owner = await Admin.findOne({
    _id: panel.createdBy,
    role: 'admin',
    isActive: true,
    assignedSubjects: subject,
  }).select('_id');
  if (!owner) {
    return res.status(400).json({ message: 'This panel owner is not assigned to the selected subject' });
  }

  if (sectionIds.length > 0) {
    const validSectionCount = await Section.countDocuments({
      _id: { $in: sectionIds },
      subject,
      createdBy: ownerId,
    });
    if (validSectionCount !== sectionIds.length) {
      return res.status(400).json({ message: 'One or more selected blocks belong to another instructor' });
    }
  }

  // First, remove this panel from all sections in the selected subject
  await Section.updateMany(
    { assignedPanels: panelId, subject, createdBy: ownerId },
    { $pull: { assignedPanels: panelId } }
  );

  // Then, add this panel to the selected sections
  if (sectionIds.length > 0) {
    await Section.updateMany(
      { _id: { $in: sectionIds }, subject, createdBy: ownerId },
      { $addToSet: { assignedPanels: panelId } }
    );
  }

  res.json({ message: 'Panel assignments updated successfully' });
};
