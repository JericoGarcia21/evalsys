const Admin = require('../models/Admin');
const Subject = require('../models/Subject');
const Section = require('../models/Section');
const Group = require('../models/Group');
const { parseScheduleDate } = require('../utils/scheduleDate');
const invalid = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };

const validateAnnouncement = async value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Announcement must be an object');
  if (typeof value.isActive !== 'boolean') invalid('Announcement isActive must be true or false');
  for (const [key, max] of [['title', 80], ['message', 500]]) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > max)) invalid(`Announcement ${key} must be text up to ${max} characters`);
  }
  const title = (value.title || '').trim(), message = (value.message || '').trim();
  if (value.isActive && (!title || !message)) invalid('A published announcement needs a title and message');
  const roles = value.roles === undefined ? ['admin', 'panel'] : value.roles;
  if (!Array.isArray(roles) || !roles.length || roles.length > 2 || roles.some(role => !['admin', 'panel'].includes(role)) || new Set(roles).size !== roles.length) invalid('Choose instructors, panels, or both for the announcement');
  const subjectIds = value.subjectIds === undefined ? [] : value.subjectIds;
  if (!Array.isArray(subjectIds) || subjectIds.length > 100 || subjectIds.some(id => typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) || new Set(subjectIds.map(id => id.toLowerCase())).size !== subjectIds.length) invalid('Announcement subjects must be up to 100 unique subject IDs');
  if (subjectIds.length && await Subject.countDocuments({ _id: { $in: subjectIds } }) !== subjectIds.length) invalid('One or more announcement subjects no longer exist');
  const dates = {};
  for (const key of ['startsAt', 'endsAt']) {
    dates[key] = value[key] === undefined || value[key] === null ? null : parseScheduleDate(value[key]);
    if (value[key] !== undefined && value[key] !== null && !dates[key]) invalid(`Announcement ${key} must be a valid date and time with a timezone`);
  }
  if (dates.startsAt && dates.endsAt && dates.endsAt <= dates.startsAt) invalid('Announcement end must be after its start');
  return { isActive: value.isActive, title, message, roles, subjectIds, ...dates, updatedAt: new Date() };
};

const currentAnnouncement = async (announcement, user, now = Date.now()) => {
  const hidden = { isActive: false };
  if (!announcement?.isActive || !user || !['admin', 'panel'].includes(user.role)) return hidden;
  if (announcement.startsAt && new Date(announcement.startsAt).getTime() > now) return hidden;
  if (announcement.endsAt && new Date(announcement.endsAt).getTime() <= now) return hidden;
  if (!(announcement.roles || ['admin', 'panel']).includes(user.role)) return hidden;
  const targets = (announcement.subjectIds || []).map(String);
  if (targets.length) {
    if (user.role === 'admin') {
      if (!(user.assignedSubjects || []).some(id => targets.includes(String(id)))) return hidden;
    } else {
      const sections = await require('./panelAccess.service').getAssignedSections(user._id);
      if (!sections.some(section => targets.includes(String(section.subject)))) return hidden;
    }
  }
  return { isActive: true, title: announcement.title, message: announcement.message, startsAt: announcement.startsAt, endsAt: announcement.endsAt, updatedAt: announcement.updatedAt };
};
module.exports = { validateAnnouncement, currentAnnouncement };
