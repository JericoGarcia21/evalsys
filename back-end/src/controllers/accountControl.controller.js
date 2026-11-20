const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const Panel = require('../models/Panel');
const Section = require('../models/Section');
const Group = require('../models/Group');
const Rubric = require('../models/Rubric');
const RegistrationLink = require('../models/RegistrationLink');
const Evaluation = require('../models/Evaluation');
const AuthSession = require('../models/AuthSession');
const { recordAuditLog } = require('../services/audit.service');
const control = require('../services/accountControl.service');

exports.getSessions = async (req, res) => {
  const user = await control.account(req.params.id);
  const filter = control.activeSessions(user);
  const sessions = user.isActive ? await AuthSession.find(filter).select('createdAt lastSeenAt expiresAt ip userAgent').sort({ lastSeenAt: -1 }).limit(100).lean() : [];
  const total = user.isActive ? await AuthSession.countDocuments(filter) : 0;
  res.json({ account: { _id: user._id, name: user.name, role: user.role }, sessions: sessions.map(item => ({ ...item, isCurrent: item._id.toString() === req.authSession._id.toString() })), total });
};

exports.revokeSessions = async (req, res) => {
  control.confirm(req, 'SIGN OUT');
  const user = await control.account(req.params.id);
  if (req.params.sessionId) {
    control.requireId(req.params.sessionId, 'Session');
    const session = await AuthSession.findOneAndUpdate({ _id: req.params.sessionId, user: user._id, role: user.role }, { $set: { revokedAt: new Date() } });
    if (!session) control.fail('Session not found for this account', 404);
  } else {
    const Model = user.role === 'panel' ? Panel : Admin;
    await Model.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
    await AuthSession.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }
  await recordAuditLog(req, { action: req.params.sessionId ? 'session.revoke' : 'session.revoke_all', entity: { type: user.role, id: user._id, name: user.name }, metadata: { sessionId: req.params.sessionId } });
  res.json({ message: 'Sessions signed out. Already-running requests cannot be recalled.' });
};

exports.setInstructorStatus = async (req, res) => {
  if (typeof req.body?.isActive !== 'boolean') control.fail('isActive must be true or false');
  control.confirm(req, req.body.isActive ? 'ACTIVATE' : 'DEACTIVATE');
  const user = await control.instructor(req.params.id);
  const changed = await control.setActive(user, req.body.isActive);
  await recordAuditLog(req, { action: 'account.status.update', instructor: user._id, entity: { type: 'admin', id: user._id, name: user.name }, metadata: { isActive: req.body.isActive, changed, sessionsRevoked: changed } });
  res.json({ message: req.body.isActive ? 'Instructor activated. A fresh sign-in is required.' : 'Instructor deactivated and sessions revoked. Records were preserved.', isActive: req.body.isActive });
};

exports.getOffboarding = async (req, res) => {
  const user = await control.instructor(req.params.id);
  const [sessions, blocks, groups, rubrics, links, panels, activePanels, archivedResults] = await Promise.all([
    user.isActive ? AuthSession.countDocuments(control.activeSessions(user)) : 0,
    Section.countDocuments({ createdBy: user._id }), Group.countDocuments({ createdBy: user._id }),
    Rubric.countDocuments({ createdBy: user._id }), RegistrationLink.countDocuments({ createdBy: user._id, isActive: true, expiresAt: { $gt: new Date() } }),
    Panel.countDocuments({ createdBy: user._id }), Panel.countDocuments({ createdBy: user._id, isActive: true }),
    Evaluation.countDocuments({ isLegacyArchived: true, 'legacySnapshot.instructorEmail': user.email }),
  ]);
  const counts = { subjects: user.assignedSubjects.length, sessions, blocks, groups, rubrics, activeRegistrationLinks: links, panels, activePanels, archivedResults };
  const checklist = [
    { label: 'Instructor deactivated', complete: !user.isActive },
    { label: 'Active sessions revoked', complete: sessions === 0 },
    { label: 'Subject workspaces transferred or reviewed', complete: !counts.subjects && !blocks && !groups && !rubrics },
    { label: 'No active registration links remain', complete: links === 0 },
    { label: 'Remaining panel accounts transferred or deactivated', complete: activePanels === 0 },
    { label: 'Retained archive reviewed', complete: Boolean(user.offboardingReviewedAt) },
  ];
  res.json({ counts, checklist, reviewedAt: user.offboardingReviewedAt || null });
};

exports.reviewOffboarding = async (req, res) => {
  control.confirm(req, 'REVIEW ARCHIVE');
  const user = await control.instructor(req.params.id);
  await Admin.updateOne({ _id: user._id }, { $set: { offboardingReviewedAt: new Date(), offboardingReviewedBy: req.user._id } });
  await recordAuditLog(req, { action: 'instructor.offboarding.review', instructor: user._id, entity: { type: 'admin', id: user._id, name: user.name } });
  res.json({ message: 'Archive review recorded. This does not delete or certify any records.' });
};

exports.bulkResetPasswords = async (req, res) => {
  control.confirm(req, 'RESET PASSWORDS');
  const ids = control.requireIds(req.body?.instructorIds, 'instructorIds');
  const credentials = await Promise.all(ids.map(async id => {
    const temporaryPassword = crypto.randomBytes(18).toString('base64url') + 'Aa1!';
    return { id, temporaryPassword, hash: await bcrypt.hash(temporaryPassword, 10) };
  }));
  const passwords = await control.atomic(async session => {
    const users = await Admin.find({ _id: { $in: ids }, role: 'admin' }).session(session);
    if (users.length !== ids.length) control.fail('Every selected account must be an existing instructor', 404);
    for (const item of credentials) {
      await Admin.updateOne({ _id: item.id, role: 'admin' }, { $set: { password: item.hash, mustChangePassword: true, failedLoginAttempts: 0 }, $unset: { lockUntil: 1 }, $inc: { sessionVersion: 1 } }, { session });
    }
    await AuthSession.updateMany({ user: { $in: ids }, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
    await control.transactionalAudit(req, 'instructor.password.bulk_reset', { instructorIds: ids, count: ids.length }, session);
    return credentials.map(item => {
      const user = users.find(user => user._id.toString() === item.id);
      return { _id: item.id, name: user.name, email: user.email, temporaryPassword: item.temporaryPassword };
    });
  });
  res.json({ passwords, message: 'Temporary passwords are shown once. Deliver each privately; all prior sessions were revoked.' });
};
