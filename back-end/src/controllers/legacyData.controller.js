const Admin = require('../models/Admin');
const Evaluation = require('../models/Evaluation');
const Group = require('../models/Group');
const Panel = require('../models/Panel');
const RegistrationLink = require('../models/RegistrationLink');
const Section = require('../models/Section');
const { recordAuditLog } = require('../services/audit.service');

const archiveEvaluations = async (filter, fallback = {}) => {
  const evaluations = await Evaluation.find({
    ...filter,
    isLegacyArchived: { $ne: true },
  })
    .populate('panel', 'name email')
    .populate({
      path: 'group',
      select: 'name members section createdBy',
      populate: [
        {
          path: 'section',
          select: 'name block subject',
          populate: { path: 'subject', select: 'code title' },
        },
        { path: 'createdBy', select: 'name email' },
      ],
    });

  for (const evaluation of evaluations) {
    const group = evaluation.group;
    const section = group?.section;
    const subject = section?.subject;
    evaluation.isLegacyArchived = true;
    evaluation.legacyArchivedAt = new Date();
    evaluation.legacySnapshot = {
      groupName: group?.name || fallback.groupName || 'Deleted old group',
      block: section?.block || section?.name || fallback.block || 'Deleted old block',
      subject: [subject?.code, subject?.title].filter(Boolean).join(' - ') || fallback.subject || 'Unknown subject',
      panelName: evaluation.panel?.name || fallback.panelName || 'Deleted old panel',
      panelEmail: evaluation.panel?.email || fallback.panelEmail || '',
      instructorName: group?.createdBy?.name || fallback.instructorName || '',
      instructorEmail: group?.createdBy?.email || fallback.instructorEmail || '',
      members: group?.members || fallback.members || [],
    };
    await evaluation.save();
  }

  return evaluations.length;
};

const requireConfirmation = (req, expected, message = 'Invalid confirmation text') => {
  const actual = String(req.body?.confirmText || '').trim();
  return actual === expected ? null : { message, expected };
};

const getLegacyFilter = async () => {
  const firstSuperadmin = await Admin.findOne({ role: 'superadmin' })
    .select('createdAt')
    .sort({ createdAt: 1 });

  const conditions = [
    { createdBy: { $exists: false } },
    { createdBy: null },
  ];
  if (firstSuperadmin?.createdAt) {
    conditions.push({ createdAt: { $lt: firstSuperadmin.createdAt } });
  }

  return {
    filter: { $or: conditions },
    legacyBefore: firstSuperadmin?.createdAt || null,
  };
};

exports.getLegacyData = async (_req, res) => {
  const { filter: legacyFilter, legacyBefore } = await getLegacyFilter();
  const sections = await Section.find(legacyFilter)
    .populate('subject', 'code title')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });

  const groups = await Group.find(legacyFilter)
    .populate({
      path: 'section',
      select: 'name block subject',
      populate: { path: 'subject', select: 'code title' },
    })
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });

  // A legacy panel has no instructor owner, or references an instructor that no longer exists.
  const panels = (await Panel.find()
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 }))
    .filter((panel) => !panel.createdBy);

  const results = await Evaluation.find({ isLegacyArchived: true })
    .select('total comments scores isSubmitted legacySnapshot legacyArchivedAt updatedAt')
    .sort({ legacyArchivedAt: -1 });

  res.json({
    sections,
    groups,
    panels,
    results,
    legacyBefore,
  });
};

exports.deleteLegacyGroup = async (req, res) => {
  const { filter: legacyFilter } = await getLegacyFilter();
  const group = await Group.findOne({ _id: req.params.id, ...legacyFilter });
  if (!group) return res.status(404).json({ message: 'Old group not found' });
  const confirmationError = requireConfirmation(req, `DELETE GROUP ${group._id}`);
  if (confirmationError) return res.status(400).json(confirmationError);

  const preservedResults = await archiveEvaluations({ group: group._id }, {
    groupName: group.name,
    members: group.members,
  });
  await group.deleteOne();
  await recordAuditLog(req, {
    action: 'legacy.group.delete',
    entity: { type: 'group', id: group._id, name: group.name },
    metadata: { confirmation: `DELETE GROUP ${group._id}`, preservedResults },
  });
  res.json({
    message: 'Old group deleted. Its results remain in Archive.',
    preservedResults,
  });
};

exports.deleteLegacySection = async (req, res) => {
  const { filter: legacyFilter } = await getLegacyFilter();
  const section = await Section.findOne({ _id: req.params.id, ...legacyFilter });
  if (!section) return res.status(404).json({ message: 'Old block not found' });
  const confirmationError = requireConfirmation(req, `DELETE BLOCK ${section._id}`);
  if (confirmationError) return res.status(400).json(confirmationError);

  const groups = await Group.find({ section: section._id }).select('_id');
  const groupIds = groups.map((group) => group._id);

  const preservedResults = await archiveEvaluations(
    { group: { $in: groupIds } },
    { block: section.block || section.name }
  );
  await Group.deleteMany({ section: section._id });
  await RegistrationLink.updateMany(
    { sections: section._id },
    { $pull: { sections: section._id } }
  );
  await section.deleteOne();

  await recordAuditLog(req, {
    action: 'legacy.section.delete',
    entity: { type: 'section', id: section._id, name: section.block || section.name },
    metadata: {
      confirmation: `DELETE BLOCK ${section._id}`,
      deletedGroups: groupIds.length,
      preservedResults,
    },
  });

  res.json({
    message: 'Old block and groups deleted. Their results remain in Archive.',
    deletedGroups: groupIds.length,
    preservedResults,
  });
};

exports.deleteLegacyPanel = async (req, res) => {
  const panel = await Panel.findById(req.params.id).select('name email createdBy');
  if (!panel) return res.status(404).json({ message: 'Old panel account not found' });
  const confirmationError = requireConfirmation(req, `DELETE PANEL ${panel._id}`);
  if (confirmationError) return res.status(400).json(confirmationError);

  const ownerExists = panel.createdBy
    ? await Admin.exists({ _id: panel.createdBy, role: 'admin' })
    : false;
  if (ownerExists) {
    return res.status(400).json({ message: 'This panel still belongs to an instructor and is not old data' });
  }

  const preservedResults = await archiveEvaluations(
    { panel: panel._id },
    { panelName: panel.name, panelEmail: panel.email }
  );
  await Section.updateMany(
    { assignedPanels: panel._id },
    { $pull: { assignedPanels: panel._id } }
  );
  await Group.updateMany(
    { assignedPanels: panel._id },
    { $pull: { assignedPanels: panel._id } }
  );
  await panel.deleteOne();

  await recordAuditLog(req, {
    action: 'legacy.panel.delete',
    entity: { type: 'panel', id: panel._id, name: panel.name },
    metadata: { confirmation: `DELETE PANEL ${panel._id}`, preservedResults },
  });

  res.json({
    message: 'Old panel account and assignments deleted. Its results remain in Archive.',
    preservedResults,
  });
};

exports.deleteLegacyResult = async (req, res) => {
  const confirmationError = requireConfirmation(req, `DELETE RESULT ${req.params.id}`);
  if (confirmationError) return res.status(400).json(confirmationError);
  const result = await Evaluation.findOneAndDelete({
    _id: req.params.id,
    isLegacyArchived: true,
  });
  if (!result) return res.status(404).json({ message: 'Old result not found' });
  await recordAuditLog(req, {
    action: 'legacy.result.delete',
    entity: { type: 'evaluation', id: result._id },
    metadata: { confirmation: `DELETE RESULT ${req.params.id}` },
  });
  res.json({ message: 'Old result permanently deleted' });
};

exports.deleteAllLegacyResults = async (req, res) => {
  const confirmationError = requireConfirmation(req, 'DELETE ARCHIVE');
  if (confirmationError) return res.status(400).json(confirmationError);
  const deleted = await Evaluation.deleteMany({ isLegacyArchived: true });
  await recordAuditLog(req, {
    action: 'legacy.results.delete_all',
    metadata: { confirmation: 'DELETE ARCHIVE', deletedResults: deleted.deletedCount },
  });
  res.json({
    message: `${deleted.deletedCount} old result${deleted.deletedCount === 1 ? '' : 's'} permanently deleted`,
    deletedResults: deleted.deletedCount,
  });
};

// Migration is explicit and audited; reading Archive must never change grades.
exports.repairLegacyData = async (req, res) => {
  const confirmationError = requireConfirmation(req, 'ARCHIVE LEGACY');
  if (confirmationError) return res.status(400).json(confirmationError);
  const { filter } = await getLegacyFilter();
  const sections = await Section.find(filter).select('_id');
  const groups = await Group.find({ $or: [filter, { section: { $in: sections.map(section => section._id) } }] }).select('_id');
  const panels = (await Panel.find().populate('createdBy', '_id')).filter(panel => !panel.createdBy);
  let archivedResults = await archiveEvaluations({ $or: [
    { group: { $in: groups.map(group => group._id) } },
    { panel: { $in: panels.map(panel => panel._id) } },
  ] });
  const remaining = await Evaluation.find({ isLegacyArchived: { $ne: true } }).select('_id group').populate('group', '_id');
  // A deleted panel with a retained name snapshot does not make an active group's grade obsolete.
  archivedResults += await archiveEvaluations({ _id: { $in: remaining.filter(evaluation => !evaluation.group).map(evaluation => evaluation._id) } });
  await recordAuditLog(req, { action: 'legacy.results.archive', metadata: { archivedResults } });
  res.json({ message: 'Old and orphaned results archived.', archivedResults });
};
