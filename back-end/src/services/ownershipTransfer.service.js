const Admin = require('../models/Admin');
const Panel = require('../models/Panel');
const Subject = require('../models/Subject');
const Section = require('../models/Section');
const Group = require('../models/Group');
const Rubric = require('../models/Rubric');
const RegistrationLink = require('../models/RegistrationLink');
const Evaluation = require('../models/Evaluation');
const ChatRoom = require('../models/ChatRoom');
const AuthSession = require('../models/AuthSession');
const Settings = require('../models/Settings');
const { isMaintenanceActive } = require('./maintenance.service');
const { isProposalPathForGroup } = require('./proposalStorage.service');
const control = require('./accountControl.service');

const same = (a, b) => String(a || '') === String(b || '');
const unique = values => [...new Set(values.filter(Boolean).map(String))];

const inspectTransfer = async (body, session = null) => {
  body = body || {};
  const sourceId = control.requireId(body.sourceId, 'Source');
  const targetId = control.requireId(body.targetId, 'Destination');
  const subjectIds = control.requireIds(body.subjectIds, 'subjectIds');
  if (same(sourceId, targetId)) control.fail('Source and destination must be different');
  const source = await control.instructor(sourceId, session);
  const target = await control.instructor(targetId, session);
  if (source.isActive) control.fail('Deactivate the source instructor before transferring a workspace', 409);
  if (!target.isActive) control.fail('Destination instructor must be active', 409);
  if (!isMaintenanceActive(await Settings.findOne().session(session))) control.fail('Activate maintenance mode before transferring ownership', 409);
  const assigned = source.assignedSubjects.map(String);
  if (subjectIds.some(id => !assigned.includes(id))) control.fail('Every subject must be assigned to the source instructor', 409);
  if (subjectIds.some(id => target.assignedSubjects.some(value => same(id, value)))) control.fail('Destination is already assigned a selected subject; merging workspaces is not supported', 409);
  if (target.assignedSubjects.length + subjectIds.length > target.subjectLimit) control.fail('Destination instructor subject limit would be exceeded', 409);
  const subjects = await Subject.find({ _id: { $in: subjectIds } }).session(session).select('code title');
  if (subjects.length !== subjectIds.length) control.fail('A selected subject no longer exists', 409);
  const ownerFilter = { createdBy: source._id, subject: { $in: subjectIds } };
  const targetFilter = { createdBy: target._id, subject: { $in: subjectIds } };
  if (await Section.exists(targetFilter).session(session) || await Rubric.exists(targetFilter).session(session) || await RegistrationLink.exists(targetFilter).session(session) || await ChatRoom.exists({ instructor: target._id, subject: { $in: subjectIds } }).session(session)) {
    control.fail('Destination already has data for a selected subject; merging is not supported', 409);
  }
  const sections = await Section.find(ownerFilter).session(session).lean();
  const sectionIds = sections.map(item => item._id);
  const groups = await Group.find({ section: { $in: sectionIds } }).session(session).lean();
  if (groups.some(item => !same(item.createdBy, source._id))) control.fail('A selected block contains groups with inconsistent ownership', 409);
  const groupIds = groups.map(item => item._id);
  const otherSourceGroups = await Group.find({ createdBy: source._id, section: { $nin: sectionIds } }).session(session).populate('section', 'subject').select('section').lean();
  if (otherSourceGroups.some(item => item.section && subjectIds.includes(String(item.section.subject)))) control.fail('The source has groups in another instructor’s selected-subject blocks; repair ownership before transfer', 409);
  const rubrics = await Rubric.find(ownerFilter).session(session).select('_id');
  const rubricIds = rubrics.map(item => item._id);
  const evaluations = await Evaluation.find({ group: { $in: groupIds }, isLegacyArchived: { $ne: true } }).session(session).select('panel rubric');
  if (await Rubric.exists({ _id: { $in: evaluations.map(item => item.rubric).filter(Boolean) }, $or: [{ createdBy: { $ne: source._id } }, { subject: { $nin: subjectIds } }] }).session(session)) control.fail('An evaluation references a rubric outside the source subject workspace', 409);
  const referencedPanels = unique([
    ...sections.flatMap(item => item.assignedPanels || []),
    ...groups.flatMap(item => [...(item.assignedPanels || []), ...(item.gradingPanelIds || [])]),
    ...evaluations.map(item => item.panel),
  ]);
  const panels = await Panel.find({ _id: { $in: referencedPanels } }).session(session).select('createdBy');
  if (panels.some(item => !same(item.createdBy, source._id))) control.fail('A referenced panel account belongs to another instructor or has no owner', 409);
  const panelIds = panels.map(item => item._id);
  if (await Section.exists({ _id: { $nin: sectionIds }, assignedPanels: { $in: panelIds } }).session(session) ||
      await Group.exists({ _id: { $nin: groupIds }, $or: [{ assignedPanels: { $in: panelIds } }, { gradingPanelIds: { $in: panelIds } }] }).session(session) ||
      await Evaluation.exists({ group: { $nin: groupIds }, panel: { $in: panelIds }, isLegacyArchived: { $ne: true } }).session(session)) {
    control.fail('Panel accounts are used outside the selected subject workspaces. Include those subjects or resolve the shared assignments first.', 409);
  }
  if (await Evaluation.exists({ group: { $nin: groupIds }, rubric: { $in: rubricIds }, isLegacyArchived: { $ne: true } }).session(session)) control.fail('A selected rubric is used outside this workspace', 409);
  for (const group of groups) {
    if (!group.proposalFile?.path) continue;
    const section = sections.find(item => same(item._id, group.section));
    if (!isProposalPathForGroup({ storagePath: group.proposalFile.path, instructorId: group.proposalFile.storageOwner || source._id, subjectId: section.subject, groupId: group._id })) control.fail('A proposal file has an inconsistent storage link; repair it before transfer', 409);
  }
  const registrationLinks = await RegistrationLink.find(ownerFilter).session(session).select('sections subject');
  if (registrationLinks.some(link => link.sections.some(id => !sections.some(section => same(section._id, id) && same(section.subject, link.subject))))) control.fail('A registration link references blocks outside its source subject workspace', 409);
  const links = registrationLinks.length;
  const chats = await ChatRoom.countDocuments({ instructor: source._id, subject: { $in: subjectIds } }).session(session);
  const proposalFiles = groups.filter(item => item.proposalFile?.path).length;
  return {
    source, target, subjectIds, sectionIds, groupIds, panelIds, rubricIds, groups,
    summary: {
      source: { _id: source._id, name: source.name }, target: { _id: target._id, name: target.name },
      subjects: subjects.map(item => ({ _id: item._id, code: item.code, title: item.title })),
      counts: { blocks: sections.length, groups: groups.length, rubrics: rubrics.length, panels: panels.length, evaluations: evaluations.length, proposalFiles, registrationLinks: links, chatRooms: chats },
    },
  };
};

const transferOwnership = async (req) => control.atomic(async session => {
  const plan = await inspectTransfer(req.body, session);
  const { source, target, subjectIds, sectionIds, groupIds, panelIds, rubricIds } = plan;
  const ownerUpdate = { $set: { createdBy: target._id } };
  // Save the immutable storage-path owner before changing workspace ownership.
  for (const group of plan.groups) {
    if (group.proposalFile?.path && !group.proposalFile.storageOwner) await Group.updateOne({ _id: group._id }, { $set: { 'proposalFile.storageOwner': source._id } }, { session });
  }
  await Section.updateMany({ _id: { $in: sectionIds } }, ownerUpdate, { session });
  await Group.updateMany({ _id: { $in: groupIds } }, ownerUpdate, { session });
  await Rubric.updateMany({ _id: { $in: rubricIds } }, ownerUpdate, { session });
  await RegistrationLink.updateMany({ createdBy: source._id, subject: { $in: subjectIds } }, ownerUpdate, { session });
  await Subject.updateMany({ _id: { $in: subjectIds }, createdBy: source._id }, ownerUpdate, { session });
  await Panel.updateMany({ _id: { $in: panelIds } }, { ...ownerUpdate, $inc: { sessionVersion: 1 } }, { session });
  await ChatRoom.updateMany({ instructor: source._id, subject: { $in: subjectIds } }, { $set: { instructor: target._id } }, { session });
  const lockedSubjects = subjectIds.filter(id => source.gradingLocked || source.gradingLockedSubjects.some(value => same(value, id)));
  await Admin.updateOne({ _id: source._id }, { $pull: { assignedSubjects: { $in: subjectIds }, gradingLockedSubjects: { $in: subjectIds } }, $inc: { sessionVersion: 1 } }, { session });
  await Admin.updateOne({ _id: target._id }, { $addToSet: { assignedSubjects: { $each: subjectIds }, gradingLockedSubjects: { $each: lockedSubjects } }, $inc: { sessionVersion: 1 } }, { session });
  await AuthSession.updateMany({ user: { $in: [source._id, target._id, ...panelIds] }, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
  await control.transactionalAudit(req, 'instructor.ownership.transfer', {
    sourceId: source._id, targetId: target._id, subjectIds, counts: plan.summary.counts,
  }, session, { type: 'admin', id: source._id, name: source.name });
  return plan.summary;
});

module.exports = { inspectTransfer, transferOwnership };
