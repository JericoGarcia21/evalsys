const Section = require('../models/Section');
const Group = require('../models/Group');
const Subject = require('../models/Subject');
const Admin = require('../models/Admin');
const Panel = require('../models/Panel');
const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');
const ChatRead = require('../models/ChatRead');
const id = value => String(value?._id || value || '');
const includes = (values, value) => (values || []).some(item => id(item) === id(value));
const validId = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
const deny = () => Object.assign(new Error('You are not assigned to this subject panel chat.'), { status: 403 });

const getRooms = async user => {
  const owner = user.role === 'admin' ? user : user.createdBy
    ? await Admin.findOne({ _id: user.createdBy, role: 'admin', isActive: true }).select('name assignedSubjects') : null;
  if (!owner) return [];
  const subjects = await Subject.find({ _id: { $in: owner.assignedSubjects || [] } }).select('code title').sort({ code: 1 }).lean();
  const sections = await Section.find({ createdBy: owner._id, subject: { $in: subjects.map(subject => subject._id) } }).select('subject assignedPanels').lean();
  const groups = await Group.find({ section: { $in: sections.map(section => section._id) }, createdBy: owner._id }).select('section assignedPanels').lean();
  const allPanelIds = [...sections.flatMap(section => section.assignedPanels || []), ...groups.flatMap(group => group.assignedPanels || [])];
  const panels = await Panel.find({ _id: { $in: allPanelIds }, createdBy: owner._id, isActive: true }).select('_id name').lean();
  const descriptors = subjects.map(subject => {
    const subjectSections = sections.filter(section => id(section.subject) === id(subject._id));
    const subjectGroups = groups.filter(group => subjectSections.some(section => id(section._id) === id(group.section)));
    const assignedIds = [...subjectSections.flatMap(section => section.assignedPanels || []), ...subjectGroups.flatMap(group => group.assignedPanels || [])];
    return { subject, panels: panels.filter(panel => includes(assignedIds, panel._id)) };
  }).filter(room => user.role === 'admin' || room.panels.some(panel => id(panel._id) === id(user._id)));
  const rooms = await Promise.all(descriptors.map(async descriptor => {
    const filter = { instructor: owner._id, subject: descriptor.subject._id };
    let room;
    try { room = await ChatRoom.findOne(filter); if (!room) room = await ChatRoom.create(filter); }
    catch (error) { if (error.code !== 11000) throw error; room = await ChatRoom.findOne(filter); }
    return {
      _id: room._id, name: 'General Panel Chat', subject: descriptor.subject,
      instructor: { _id: owner._id, name: owner.name },
      participants: [{ _id: owner._id, name: owner.name, role: 'admin' }, ...descriptor.panels.map(panel => ({ ...panel, role: 'panel' }))],
      unread: 0,
    };
  }));
  if (!rooms.length) return [];
  const summaries = await ChatMessage.aggregate([
    { $match: { room: { $in: rooms.map(room => room._id) } } },
    { $lookup: {
      from: ChatRead.collection.name, let: { room: '$room' },
      pipeline: [{ $match: { user: user._id, role: user.role, $expr: { $eq: ['$room', '$$room'] } } }],
      as: '_read',
    } },
    { $group: {
      _id: '$room', lastMessageAt: { $max: '$createdAt' },
      unread: { $sum: { $cond: [{ $and: [
        { $gt: ['$_id', { $ifNull: [{ $arrayElemAt: ['$_read.lastReadMessageId', 0] }, null] }] },
        { $or: [{ $ne: ['$sender.id', user._id] }, { $ne: ['$sender.role', user.role] }] },
      ] }, 1, 0] } },
    } },
  ]);
  return rooms.map(room => {
    const summary = summaries.find(item => id(item._id) === id(room._id));
    return { ...room, unread: summary?.unread || 0, lastMessageAt: summary?.lastMessageAt || null };
  });
};

const authorizeRoom = async (user, roomId) => {
  if (!validId(roomId)) throw Object.assign(new Error('Invalid panel chat.'), { status: 400 });
  const room = await ChatRoom.findById(roomId);
  if (!room) throw deny();
  const owner = user.role === 'admin' ? user : user.createdBy
    ? await Admin.findOne({ _id: user.createdBy, role: 'admin', isActive: true, assignedSubjects: room.subject }).select('_id') : null;
  if (!owner || id(owner._id) !== id(room.instructor) || (user.role === 'admin' && !includes(user.assignedSubjects, room.subject))) throw deny();
  if (!await Subject.exists({ _id: room.subject })) throw deny();
  if (user.role === 'panel') {
    const sections = await Section.find({ createdBy: owner._id, subject: room.subject }).select('assignedPanels');
    const assigned = sections.some(section => includes(section.assignedPanels, user._id));
    if (!assigned && !await Group.exists({ createdBy: owner._id, section: { $in: sections.map(section => section._id) }, assignedPanels: user._id })) throw deny();
  }
  return { room: room._id };
};

module.exports = { getRooms, authorizeRoom, validId };
