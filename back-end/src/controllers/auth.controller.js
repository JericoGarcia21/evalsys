const { isMaintenanceActive } = require('../services/maintenance.service');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Panel = require('../models/Panel');
const Section = require('../models/Section');
const Settings = require('../models/Settings');
const { recordAuditLog } = require('../services/audit.service');

const signToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '7d' });

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 15;

const isStrongPassword = (password = '') => (
  typeof password === 'string' &&
  password.length >= 8 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9]/.test(password)
);
const passwordRuleMessage = 'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol';

const normalizeEvalsysEmail = (value = '') => {
  const email = value.trim().toLowerCase();
  if (!email) return '';
  let username = email;
  if (email.endsWith('@evalsys.com')) {
    username = email.slice(0, -'@evalsys.com'.length);
  } else if (email.endsWith('@')) {
    username = email.slice(0, -1);
  } else if (email.includes('@')) {
    return '';
  }

  if (!/^[a-z0-9._-]+$/.test(username)) return '';
  if (!username) return '';
  return `${username}@evalsys.com`;
};

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findUserByEmail = async (email) => (
  await Admin.findOne({ email }) || await Panel.findOne({ email })
);

const findLegacyUserByUsername = async (email) => {
  const username = email.split('@')[0];
  if (!username) return null;
  const localPartRegex = new RegExp(`^${escapeRegex(username)}@`, 'i');
  return await Admin.findOne({ email: localPartRegex }) || await Panel.findOne({ email: localPartRegex });
};

const uniqueIds = (ids = []) => [
  ...new Set(ids.filter(Boolean).map((id) => id.toString())),
];

const getPanelLockedSubjects = async (panel) => {
  if (!panel.createdBy) return [];

  const assignedSections = await Section.find({
    assignedPanels: panel._id,
    subject: { $exists: true, $ne: null },
    createdBy: panel.createdBy,
  }).select('subject');
  const assignedSubjectIds = uniqueIds(assignedSections.map((section) => section.subject));

  if (!assignedSubjectIds.length) return [];

  const instructor = await Admin.findOne({
    _id: panel.createdBy,
    role: 'admin',
    isActive: true,
    gradingLockedSubjects: { $in: assignedSubjectIds },
  }).select('gradingLockedSubjects');

  return uniqueIds(instructor?.gradingLockedSubjects || [])
    .filter((subjectId) => assignedSubjectIds.includes(subjectId));
};

const getUserFeatureLocks = async (user) => {
  if (user.role === 'panel') {
    const instructor = user.createdBy
      ? await Admin.findById(user.createdBy).select('csvExportLocked')
      : null;
    return {
      csvExportLocked: Boolean(instructor?.csvExportLocked),
      gradingLocked: false,
      gradingLockedSubjects: await getPanelLockedSubjects(user),
    };
  }

  return {
    csvExportLocked: Boolean(user.csvExportLocked),
    gradingLocked: Boolean(user.gradingLocked),
    gradingLockedSubjects: user.gradingLockedSubjects || [],
  };
};

const isAccountLocked = (user) => user?.lockUntil && user.lockUntil.getTime() > Date.now();
const remainingLockMinutes = (user) => Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);

const recordFailedLoginForUser = async (req, user, reason) => {
  user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
  const lockedNow = user.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
  if (lockedNow) {
    user.lockUntil = new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000);
  }
  await user.save();
  await recordAuditLog(req, {
    action: lockedNow ? 'login.locked' : 'login.failed',
    status: 'failed',
    actor: { id: user._id, name: user.name, email: user.email, role: user.role },
    metadata: {
      reason,
      failedLoginAttempts: user.failedLoginAttempts,
      lockUntil: user.lockUntil,
    },
  });
  return lockedNow;
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password required' });

  const normalizedEmail = normalizeEvalsysEmail(email);
  if (!normalizedEmail)
    return res.status(400).json({ message: 'Valid @evalsys.com email required' });

  // Check admin_acc first, then panel_acc
  let user = await findUserByEmail(normalizedEmail);
  if (!user) {
    const legacyUser = await findLegacyUserByUsername(email.trim().toLowerCase());
    if (legacyUser) {
      const duplicate = await findUserByEmail(normalizedEmail);
      if (!duplicate || duplicate._id.toString() === legacyUser._id.toString()) {
        legacyUser.email = normalizedEmail;
        await legacyUser.save();
        user = legacyUser;
      }
    }
  }

  if (user && isAccountLocked(user)) {
    await recordAuditLog(req, {
      action: 'login.failed',
      status: 'failed',
      actor: { id: user._id, name: user.name, email: user.email, role: user.role },
      metadata: { reason: 'account_locked', lockUntil: user.lockUntil },
    });
    return res.status(423).json({ message: `Account temporarily locked. Try again in ${remainingLockMinutes(user)} minute(s).` });
  }

  if (!user) {
    await recordAuditLog(req, {
      action: 'login.failed',
      status: 'failed',
      actor: { email: normalizedEmail },
      metadata: { reason: 'unknown_account' },
    });
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (!(await user.matchPassword(password))) {
    const lockedNow = await recordFailedLoginForUser(req, user, 'invalid_password');
    return res.status(lockedNow ? 423 : 401).json({
      message: lockedNow
        ? `Too many failed attempts. Account locked for ${LOGIN_LOCK_MINUTES} minutes.`
        : 'Invalid credentials',
    });
  }

  if (!user.isActive) {
    await recordAuditLog(req, {
      action: 'login.failed',
      status: 'failed',
      actor: { id: user._id, name: user.name, email: user.email, role: user.role },
      metadata: { reason: 'inactive_account' },
    });
    return res.status(403).json({ message: 'Account is deactivated' });
  }

  const settings = await Settings.findOne().select('isMaintenanceMode maintenanceStartsAt maintenanceEndsAt maintenanceMessage');
  if (isMaintenanceActive(settings) && user.role !== 'superadmin') {
    await recordAuditLog(req, {
      action: 'login.failed',
      status: 'failed',
      actor: { id: user._id, name: user.name, email: user.email, role: user.role },
      metadata: { reason: 'maintenance_mode' },
    });
    return res.status(503).json({
      message: settings.maintenanceMessage || 'EvalSys is temporarily unavailable while maintenance is in progress.',
      maintenanceMode: true,
    });
  }

  const locks = await getUserFeatureLocks(user);
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  await recordAuditLog(req, {
    action: 'login.success',
    actor: { id: user._id, name: user.name, email: user.email, role: user.role },
  });

  res.json({
    token: signToken(user._id, user.role),
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: Boolean(user.mustChangePassword),
      assignedSubjects: user.assignedSubjects || [],
      ...locks,
    },
  });
};

exports.getMe = async (req, res) => {
  const user = req.user.toObject ? req.user.toObject() : req.user;
  const locks = await getUserFeatureLocks(req.user);
  res.json({ ...user, ...locks });
};

exports.changePassword = async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) {
    return res.status(400).json({ message: 'New password is required' });
  }
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ message: passwordRuleMessage });
  }
  const Model = ['admin', 'superadmin'].includes(req.user.role) ? Admin : Panel;
  const user = await Model.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'Account not found' });

  if (await user.matchPassword(newPassword)) {
    return res.status(400).json({ message: 'New password must be different from the temporary password' });
  }

  user.password = newPassword;
  user.mustChangePassword = false;
  await user.save();
  await recordAuditLog(req, {
    action: 'account.password.changed',
    actor: { id: user._id, name: user.name, email: user.email, role: user.role },
    entity: { type: user.role, id: user._id, name: user.name },
    metadata: { temporaryPasswordFlow: true },
  });
  res.json({ message: 'Password changed successfully', mustChangePassword: false });
};

exports.updateOwnPassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' });
  }
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ message: passwordRuleMessage });
  }

  const Model = ['admin', 'superadmin'].includes(req.user.role) ? Admin : Panel;
  const user = await Model.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'Account not found' });

  if (!(await user.matchPassword(currentPassword))) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }
  if (await user.matchPassword(newPassword)) {
    return res.status(400).json({ message: 'New password must be different from the current password' });
  }

  user.password = newPassword;
  user.mustChangePassword = false;
  await user.save();
  await recordAuditLog(req, {
    action: 'account.password.changed',
    actor: { id: user._id, name: user.name, email: user.email, role: user.role },
    entity: { type: user.role, id: user._id, name: user.name },
    metadata: { temporaryPasswordFlow: false },
  });
  res.json({ message: 'Password updated successfully' });
};
