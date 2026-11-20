const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const AuthSession = require('../models/AuthSession');

const issueSession = async (user, req) => {
  const version = user.sessionVersion || 0;
  const session = await AuthSession.create({
    user: user._id, role: user.role, version,
    ip: String(req.ip || '').slice(0, 100),
    userAgent: String(req.headers?.['user-agent'] || 'Unknown browser').slice(0, 500),
    expiresAt: new Date(Date.now() + 7 * 86400000),
  });
  return jwt.sign({ id: user._id, role: user.role, sid: session._id, sv: version }, process.env.JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256' });
};

const revokeSessionRecords = (userId) => AuthSession.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date() } });

// Compare-and-swap prevents a stale password change from overwriting a reset.
const replacePassword = async (Model, user, password, mustChangePassword) => {
  const hash = await bcrypt.hash(password, 10);
  const version = user.sessionVersion || 0;
  const updated = await Model.findOneAndUpdate({
    _id: user._id, password: user.password,
    $or: [{ sessionVersion: version }, ...(version === 0 ? [{ sessionVersion: { $exists: false } }] : [])],
  }, { $set: { password: hash, mustChangePassword, failedLoginAttempts: 0 }, $unset: { lockUntil: 1 }, $inc: { sessionVersion: 1 } }, { new: true }).select('+sessionVersion');
  if (!updated) throw Object.assign(new Error('Account changed. Refresh and try again.'), { statusCode: 409 });
  await revokeSessionRecords(user._id);
  return updated;
};

module.exports = { issueSession, revokeSessionRecords, replacePassword };
