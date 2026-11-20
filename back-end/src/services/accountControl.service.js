const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Panel = require('../models/Panel');
const AuditLog = require('../models/AuditLog');
const AuthSession = require('../models/AuthSession');

const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const validId = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
const requireId = (value, label = 'Account') => { if (!validId(value)) fail(`${label} ID is invalid`); return value; };
const requireIds = (values, label) => {
  if (!Array.isArray(values) || !values.length || values.length > 20 || values.some(value => !validId(value)) || new Set(values).size !== values.length) fail(`${label} must contain 1–20 unique valid IDs`);
  return values;
};
const confirm = (req, expected) => { if (req.body?.confirmText !== expected) fail(`Type ${expected} to confirm`); };
const account = async id => {
  requireId(id);
  const user = await Admin.findById(id).select('+sessionVersion') || await Panel.findById(id).select('+sessionVersion');
  if (!user) fail('Account not found', 404);
  return user;
};
const instructor = async (id, session = null) => {
  requireId(id, 'Instructor');
  const user = await Admin.findOne({ _id: id, role: 'admin' }).session(session).select('+sessionVersion');
  if (!user) fail('Instructor not found', 404);
  return user;
};
const activeSessions = user => ({ user: user._id, version: user.sessionVersion || 0, role: user.role, revokedAt: null, expiresAt: { $gt: new Date() } });
const transactionalAudit = (req, action, metadata, session, entity) => AuditLog.create([{
  action, actor: { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role },
  entity, metadata, ip: req.ip, userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
}], { session });
const atomic = async work => {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } catch (error) {
    if ([20, 303].includes(error.code) || /Transaction numbers are only allowed|does not support.*transactions/i.test(error.message)) {
      fail('This action requires MongoDB replica-set transaction support. No changes were applied.', 503);
    }
    throw error;
  } finally { await session.endSession(); }
};
const setActive = async (user, isActive) => {
  const Model = user.role === 'panel' ? Panel : Admin;
  const changed = await Model.findOneAndUpdate({ _id: user._id, isActive: { $ne: isActive } }, {
    $set: { isActive }, $inc: { sessionVersion: 1 },
  }, { new: true });
  if (changed) await AuthSession.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  return Boolean(changed);
};

module.exports = { fail, requireId, requireIds, confirm, account, instructor, activeSessions, transactionalAudit, atomic, setActive };
