const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const Group = require('../models/Group');
const Section = require('../models/Section');
const Admin = require('../models/Admin');
const Panel = require('../models/Panel');
const Evaluation = require('../models/Evaluation');
const {
  downloadProposalFile,
  createProposalSignedUrl,
  isProposalPathForGroup,
} = require('../services/proposalStorage.service');
const { convertProposalToPdf } = require('../services/proposalPdf.service');
const { getPagination, paginatedPayload } = require('../utils/pagination');
const { validateBody, groupSchema } = require('../utils/validate');

const getSubjectId = (req) => req.headers['x-subject-id'] || req.query.subject || req.body.subject;
const getOwnerId = (req) => req.user?.role === 'superadmin'
  ? req.instructorContext?._id
  : req.user?._id;
const canAccessSubject = (req, subjectId) => (
  !subjectId ||
  req.user?.role === 'superadmin' ||
  (req.user?.assignedSubjects || []).some((id) => id.toString() === subjectId.toString())
);

const archiveGroupEvaluations = async (group) => {
  const fullGroup = await Group.findById(group._id)
    .populate({
      path: 'section',
      select: 'name block subject createdBy',
      populate: [
        { path: 'subject', select: 'code title' },
        { path: 'createdBy', select: 'name email' },
      ],
    })
    .populate('createdBy', 'name email');

  const section = fullGroup?.section;
  const subject = section?.subject;
  const instructor = fullGroup?.createdBy || section?.createdBy;
  const evaluations = await Evaluation.find({
    group: group._id,
    isLegacyArchived: { $ne: true },
  }).populate('panel', 'name email');
  const archivedAt = new Date();

  for (const evaluation of evaluations) {
    evaluation.isLegacyArchived = true;
    evaluation.legacyArchivedAt = archivedAt;
    evaluation.legacySnapshot = {
      groupName: fullGroup?.name || 'Deleted group',
      block: section?.block || section?.name || 'Deleted block',
      subject: [subject?.code, subject?.title].filter(Boolean).join(' - ') || 'Unknown subject',
      panelName: evaluation.panel?.name || evaluation.legacySnapshot?.panelName || 'Deleted panel',
      panelEmail: evaluation.panel?.email || evaluation.legacySnapshot?.panelEmail || '',
      instructorName: instructor?.name || evaluation.legacySnapshot?.instructorName || '',
      instructorEmail: instructor?.email || evaluation.legacySnapshot?.instructorEmail || '',
      members: fullGroup?.members || evaluation.legacySnapshot?.members || [],
    };
    await evaluation.save();
  }

  return evaluations.length;
};

const normalizeMembers = (members) => {
  if (Array.isArray(members)) {
    return members
      .map((member) => {
        if (typeof member === 'string') return member.trim();
        return {
          lastName: String(member?.lastName || '').trim(),
          firstName: String(member?.firstName || '').trim(),
          middleName: String(member?.middleName || '').trim(),
        };
      })
      .filter((member) => {
        if (typeof member === 'string') return Boolean(member);
        return Boolean(member.lastName || member.firstName || member.middleName);
      });
  }

  if (typeof members === 'string') {
    return members.split(';').map((member) => member.trim()).filter(Boolean);
  }

  return [];
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

exports.createGroup = async (req, res) => {
  const { name, section, members, assignedPanels } = req.body;
  const schemaError = validateBody(req.body, groupSchema);
  if (schemaError) return res.status(400).json({ message: schemaError });
  const sectionDoc = await Section.findById(section);
  if (!sectionDoc) return res.status(404).json({ message: 'Section not found' });
  const selectedSubject = getSubjectId(req);
  if (selectedSubject && sectionDoc.subject?.toString() !== selectedSubject.toString()) {
    return res.status(400).json({ message: 'Selected block does not belong to the current subject' });
  }
  if (req.user && !canAccessSubject(req, sectionDoc.subject)) {
    return res.status(403).json({ message: 'You are not assigned to this subject' });
  }
  const ownerId = getOwnerId(req);
  if (!sectionDoc.createdBy || sectionDoc.createdBy.toString() !== ownerId?.toString()) {
    return res.status(403).json({ message: 'Selected block does not belong to the current instructor' });
  }
  const assignmentError = await validatePanelAssignments(req, assignedPanels, sectionDoc.subject);
  if (assignmentError) return res.status(400).json({ message: assignmentError });

  // Check for duplication in the same section
  const existing = await Group.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') }, section });
  if (existing) {
    return res.status(400).json({ message: `A group with the name "${name}" already exists in this block.` });
  }

  const group = await Group.create({
    name,
    section,
    createdBy: ownerId,
    members: members || [],
    assignedPanels: assignedPanels || [],
  });
  res.status(201).json(group);
};

// Bulk create groups (for CSV import)
exports.bulkCreateGroups = async (req, res) => {
  const { groups } = req.body;
  if (!Array.isArray(groups)) return res.status(400).json({ message: 'Groups array required' });
  const subject = getSubjectId(req);
  const ownerId = getOwnerId(req);
  if (!subject) return res.status(400).json({ message: 'Subject required' });
  if (!canAccessSubject(req, subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });

  const results = { created: 0, skipped: 0, errors: [] };

  // Cache sections for performance
  const sectionMap = {};
  const allSections = await Section.find({ subject, createdBy: ownerId });
  allSections.forEach(s => {
    sectionMap[s.block.toLowerCase()] = s._id;
  });

  for (const g of groups) {
    try {
      const { name, block, members } = g;
      if (!name || !block) {
        results.skipped++;
        continue;
      }

      const sectionId = sectionMap[block.toLowerCase()];
      if (!sectionId) {
        results.errors.push(`Section block "${block}" not found for group "${name}"`);
        results.skipped++;
        continue;
      }

      // Check if group already exists in that section
      const exists = await Group.findOne({ name, section: sectionId });
      if (exists) {
        results.skipped++;
        continue;
      }

      await Group.create({
        name,
        section: sectionId,
        createdBy: ownerId,
        members: normalizeMembers(members)
      });
      results.created++;
    } catch (err) {
      results.errors.push(err.message);
    }
  }

  res.json(results);
};

exports.getGroups = async (req, res) => {
  const filter = req.query.section ? { section: req.query.section } : {};
  const subject = getSubjectId(req);

  // If the user is a panel, only return groups from sections they are assigned to
  if (req.user.role === 'panel') {
    const sectionFilter = {
      assignedPanels: req.user._id,
    };
    let allowedSubjectIds = [];

    if (req.user.createdBy) {
      const instructor = await Admin.findOne({ _id: req.user.createdBy, role: 'admin', isActive: true }).select('assignedSubjects');
      if (!instructor) return res.json([]);
      allowedSubjectIds = (instructor.assignedSubjects || []).map((id) => id.toString());
      sectionFilter.subject = { $in: instructor.assignedSubjects || [] };
      sectionFilter.createdBy = req.user.createdBy;
    }

    const assignedSections = await Section.find(sectionFilter).select('_id subject');
    const sectionIds = assignedSections.map((s) => s._id);


    // Bypass Mongoose $in array casting edge cases by filtering in memory
    const allGroups = await Group.find(req.user.createdBy ? { createdBy: req.user.createdBy } : {})
      .populate({
        path: 'section',
        select: 'name block subject',
        populate: { path: 'subject', select: 'code title' },
      })
      .populate('assignedPanels', 'name email')
      .sort({ createdAt: -1 });

    const strSectionIds = sectionIds.map(id => id.toString());
    const panelIdStr = req.user._id.toString();

    const evaluations = await require('../models/Evaluation').find({
      panel: req.user._id,
      isSubmitted: true,
      isLegacyArchived: { $ne: true },
    }).select('group');
    const gradedGroupIds = evaluations.map(ev => ev.group.toString());

    const groups = allGroups.filter(g => {
      const gSecId = g.section ? g.section._id.toString() : null;
      const isInSection = gSecId && strSectionIds.includes(gSecId);
      const gSubjectId = g.section?.subject?._id?.toString() || g.section?.subject?.toString();
      const isOwnedSubject = !req.user.createdBy || (gSubjectId && allowedSubjectIds.includes(gSubjectId));

      const gPanels = g.assignedPanels || [];
      const isAssignedDirectly = gPanels.some(p => (p._id || p).toString() === panelIdStr);

      return isOwnedSubject && (isInSection || isAssignedDirectly);
    }).map(g => {
      const gObj = g.toObject();
      gObj.isGraded = gradedGroupIds.includes(g._id.toString());
      return gObj;
    });

    const pagination = getPagination(req);
    if (!pagination) return res.json(groups);
    const items = groups.slice(pagination.skip, pagination.skip + pagination.limit);
    return res.json(paginatedPayload(items, groups.length, pagination));
  }

  if (subject) {
    if (!canAccessSubject(req, subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });
    const ownerId = getOwnerId(req);
    const subjectSections = await Section.find({ subject, createdBy: ownerId }).select('_id');
    filter.section = req.query.section || { $in: subjectSections.map((s) => s._id) };
    filter.createdBy = ownerId;
  } else if (req.user.role === 'admin') {
    const subjectSections = await Section.find({
      subject: { $in: req.user.assignedSubjects || [] },
      createdBy: req.user._id,
    }).select('_id');
    filter.section = req.query.section || { $in: subjectSections.map((s) => s._id) };
    filter.createdBy = req.user._id;
  }

  const pagination = getPagination(req);
  const query = Group.find(filter)
    .populate({
      path: 'section',
      select: 'name block subject assignedPanels',
      populate: { path: 'subject', select: 'code title' },
    })
    .populate('assignedPanels', 'name email')
    .sort({ createdAt: -1 });
  if (!pagination) return res.json(await query);

  const [groups, total] = await Promise.all([
    query.skip(pagination.skip).limit(pagination.limit),
    Group.countDocuments(filter),
  ]);
  return res.json(paginatedPayload(groups, total, pagination));
};

exports.getGroup = async (req, res) => {
  const group = await Group.findById(req.params.id)
    .populate({
      path: 'section',
      select: 'name block subject assignedPanels',
      populate: { path: 'subject', select: 'code title' },
    })
    .populate('assignedPanels', 'name email');
  if (!group) return res.status(404).json({ message: 'Group not found' });
  const selectedSubject = getSubjectId(req);
  const groupSubjectId = group.section?.subject?._id || group.section?.subject;
  if (req.user.role !== 'panel' && selectedSubject && groupSubjectId?.toString() !== selectedSubject.toString()) {
    return res.status(403).json({ message: 'This group does not belong to the current subject' });
  }
  if (
    req.user.role !== 'panel' &&
    (!group.createdBy || group.createdBy.toString() !== getOwnerId(req)?.toString())
  ) {
    return res.status(403).json({ message: 'This group does not belong to the current instructor' });
  }
  if (req.user.role !== 'panel' && !canAccessSubject(req, group.section?.subject)) {
    return res.status(403).json({ message: 'You are not assigned to this subject' });
  }
  if (req.user.role === 'panel' && req.user.createdBy) {
    const groupSubjectId = group.section?.subject?._id || group.section?.subject;
    const instructor = await Admin.findOne({
      _id: req.user.createdBy,
      role: 'admin',
      isActive: true,
      assignedSubjects: groupSubjectId,
    }).select('_id');
    if (!instructor) {
      return res.status(403).json({ message: 'This group belongs to another instructor subject' });
    }
  }
  if (req.user.role === 'panel') {
    const isSectionAssigned = (group.section?.assignedPanels || []).some(
      (panelId) => panelId.toString() === req.user._id.toString()
    );
    const isGroupAssigned = (group.assignedPanels || []).some(
      (panelId) => panelId.toString() === req.user._id.toString()
    );
    if (!isSectionAssigned && !isGroupAssigned) {
      return res.status(403).json({ message: 'You are not assigned to this group' });
    }
  }
  res.json(group);
};

exports.getGroupProposalUrl = async (req, res) => {
  const group = await Group.findById(req.params.id)
    .populate({
      path: 'section',
      select: 'name block subject assignedPanels',
      populate: { path: 'subject', select: 'code title' },
    })
    .populate('assignedPanels', 'name email');

  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!group.proposalFile?.path) return res.status(404).json({ message: 'No proposal uploaded for this group' });

  const selectedSubject = getSubjectId(req);
  const groupSubjectId = group.section?.subject?._id || group.section?.subject;
  if (!isProposalPathForGroup({
    storagePath: group.proposalFile.path,
    instructorId: group.createdBy,
    subjectId: groupSubjectId,
    groupId: group._id,
  })) {
    return res.status(409).json({ message: 'Proposal file is not linked to this group correctly' });
  }

  if (req.user.role !== 'panel') {
    if (selectedSubject && groupSubjectId?.toString() !== selectedSubject.toString()) {
      return res.status(403).json({ message: 'This group does not belong to the current subject' });
    }
    if (!group.createdBy || group.createdBy.toString() !== getOwnerId(req)?.toString()) {
      return res.status(403).json({ message: 'This group does not belong to the current instructor' });
    }
    if (!canAccessSubject(req, groupSubjectId)) {
      return res.status(403).json({ message: 'You are not assigned to this subject' });
    }
  }

  if (req.user.role === 'panel') {
    if (req.user.createdBy) {
      const instructor = await Admin.findOne({
        _id: req.user.createdBy,
        role: 'admin',
        isActive: true,
        assignedSubjects: groupSubjectId,
      }).select('_id');
      if (!instructor) {
        return res.status(403).json({ message: 'This group belongs to another instructor subject' });
      }
    }

    const isSectionAssigned = (group.section?.assignedPanels || []).some(
      (panelId) => panelId.toString() === req.user._id.toString()
    );
    const isGroupAssigned = (group.assignedPanels || []).some(
      (panelId) => (panelId._id || panelId).toString() === req.user._id.toString()
    );
    if (!isSectionAssigned && !isGroupAssigned) {
      return res.status(403).json({ message: 'You are not assigned to this group proposal' });
    }
  }

  try {
    if (req.query.format === 'pdf') {
      const buffer = await downloadProposalFile(group.proposalFile.path);
      const pdf = await convertProposalToPdf(buffer, group.proposalFile.originalName || group.proposalFile.path);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="proposal.pdf"',
        'Cache-Control': 'private, no-store',
      });
      return res.send(pdf);
    }
    const url = await createProposalSignedUrl(group.proposalFile.path);
    res.json({
      url,
      originalName: group.proposalFile.originalName,
      expiresInSeconds: 600,
    });
  } catch (err) {
    res.status(err.status || 502).json({
      message: err.status === 503 ? err.message : err.message === 'Supabase Storage is not configured'
        ? 'Proposal storage is not configured yet'
        : 'Unable to open proposal right now',
    });
  }
};

exports.updateGroup = async (req, res) => {
  const { name, section } = req.body;
  const current = await Group.findById(req.params.id).populate('section', 'subject');
  if (!current) return res.status(404).json({ message: 'Group not found' });
  if (!current.createdBy || current.createdBy.toString() !== getOwnerId(req)?.toString()) {
    return res.status(403).json({ message: 'This group does not belong to the current instructor' });
  }

  const originalSubject = current.section?.subject;
  if (!canAccessSubject(req, originalSubject)) return res.status(403).json({ message: 'You are not assigned to this subject' });
  if (getSubjectId(req) && originalSubject?.toString() !== getSubjectId(req).toString()) {
    return res.status(403).json({ message: 'This group does not belong to the current subject' });
  }
  if (name || section) {
    const currentSection = await Section.findById(section || current.section?._id || current.section);
    const selectedSubject = getSubjectId(req);
    if (selectedSubject && currentSection?.subject?.toString() !== selectedSubject.toString()) {
      return res.status(400).json({ message: 'Selected block does not belong to the current subject' });
    }
    if (!canAccessSubject(req, currentSection?.subject)) {
      return res.status(403).json({ message: 'You are not assigned to this subject' });
    }
    if (!currentSection?.createdBy || currentSection.createdBy.toString() !== getOwnerId(req)?.toString()) {
      return res.status(403).json({ message: 'Selected block does not belong to the current instructor' });
    }
    const checkName = name || current.name;
    const checkSection = section || current.section?._id || current.section;

    const existing = await Group.findOne({
      _id: { $ne: req.params.id },
      name: { $regex: new RegExp(`^${escapeRegex(checkName)}$`, 'i') },
      section: checkSection
    });

    if (existing) {
      return res.status(400).json({ message: `Another group with the name "${checkName}" already exists in this block.` });
    }
  }

  if (req.body.assignedPanels) {
    const currentSection = await Section.findById(section || current.section?._id || current.section);
    const assignmentError = await validatePanelAssignments(req, req.body.assignedPanels, currentSection?.subject);
    if (assignmentError) return res.status(400).json({ message: assignmentError });
  }

  const updates = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.section !== undefined) updates.section = req.body.section;
  if (req.body.members !== undefined) updates.members = req.body.members;
  if (req.body.assignedPanels !== undefined) updates.assignedPanels = req.body.assignedPanels;
  const group = await Group.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!group) return res.status(404).json({ message: 'Group not found' });
  res.json(group);
};

exports.deleteGroup = async (req, res) => {
  const group = await Group.findById(req.params.id).populate('section', 'subject');
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!group.createdBy || group.createdBy.toString() !== getOwnerId(req)?.toString()) {
    return res.status(403).json({ message: 'This group does not belong to the current instructor' });
  }
  const selectedSubject = getSubjectId(req);
  if (selectedSubject && group.section?.subject?.toString() !== selectedSubject.toString()) {
    return res.status(403).json({ message: 'This group does not belong to the current subject' });
  }
  if (!canAccessSubject(req, group.section?.subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });
  const archivedEvaluations = await archiveGroupEvaluations(group);
  await group.deleteOne();
  res.json({
    message: archivedEvaluations > 0
      ? 'Group deleted. Submitted results were moved to Archive.'
      : 'Group deleted.',
    archivedEvaluations,
  });
};
