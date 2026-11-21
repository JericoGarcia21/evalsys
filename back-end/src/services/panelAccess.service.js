const Admin = require('../models/Admin');
const Panel = require('../models/Panel');
const Section = require('../models/Section');
const Group = require('../models/Group');
const Settings = require('../models/Settings');

const sharedPanelsEnabled = async () => Boolean((await Settings.findOne().select('sharedPanelsEnabled'))?.sharedPanelsEnabled);
const canAccessOwner = async (panel, ownerId) => Boolean(ownerId) &&
  (String(panel.createdBy) === String(ownerId) || await sharedPanelsEnabled());

// Account creation ownership is separate from assignment/workspace access.
const getAssignedSections = async panelId => {
  const directSections = await Group.distinct('section', { assignedPanels: panelId });
  const sections = await Section.find({ $or: [
    { assignedPanels: panelId }, { _id: { $in: directSections } },
  ] }).populate('createdBy', 'name assignedSubjects isActive gradingLockedSubjects');
  const shared = await sharedPanelsEnabled();
  const panel = shared ? null : await Panel.findById(panelId).select('createdBy');
  return sections.filter(section => section.createdBy?.isActive &&
    (shared || String(section.createdBy._id) === String(panel?.createdBy)) &&
    section.createdBy.assignedSubjects.some(id => String(id) === String(section.subject)));
};

const validatePanelAssignments = async (req, panelIds = []) => {
  if (!Array.isArray(panelIds)) return 'Panel assignments must be an array';
  const ids = [...new Set(panelIds.map(String))];
  if (!ids.length) return null;
  const owners = await Admin.find({ role: 'admin', isActive: true }).select('_id');
  const shared = await sharedPanelsEnabled();
  const ownerId = req.user.role === 'superadmin' ? req.instructorContext?._id : req.user._id;
  const eligibleOwners = owners.filter(owner => shared || String(owner._id) === String(ownerId));
  const count = await Panel.countDocuments({ _id: { $in: ids }, isActive: true, createdBy: { $in: eligibleOwners.map(owner => owner._id) } });
  return count === ids.length ? null : 'One or more selected panels are inactive, missing, or have no active instructor';
};

const hasSharedAssignments = async panel => Boolean(
  await Section.exists({ assignedPanels: panel._id, createdBy: { $ne: panel.createdBy } }) ||
  await Group.exists({ assignedPanels: panel._id, createdBy: { $ne: panel.createdBy } })
);

module.exports = { getAssignedSections, validatePanelAssignments, hasSharedAssignments, sharedPanelsEnabled, canAccessOwner };
