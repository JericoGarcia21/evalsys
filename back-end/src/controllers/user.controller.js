const Admin = require('../models/Admin');
const Panel = require('../models/Panel');
const Evaluation = require('../models/Evaluation');
const Group = require('../models/Group');
const Section = require('../models/Section');
const { recordAuditLog } = require('../services/audit.service');
const { getPagination, paginatedPayload } = require('../utils/pagination');
const { validateBody, userCreateSchema, subjectLimitSchema, gradingLockSchema } = require('../utils/validate');
const { replacePassword } = require('../services/session.service');
const { setActive } = require('../services/accountControl.service');

const canManageUser = (req, user) => {
  if (req.user.role === 'superadmin') return true;
  if (user?.role !== 'panel') return false;
  return Boolean(user.createdBy) && user.createdBy.toString() === req.user._id.toString();
};

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

const normalizeLegacyEvalsysEmail = (value = '') => {
  const email = value.trim().toLowerCase();
  if (!email) return '';
  const username = email.split('@')[0];
  if (!/^[a-z0-9._-]+$/.test(username)) return '';
  return `${username}@evalsys.com`;
};

const findAccountByEmail = async (email) => (
  await Admin.findOne({ email }) || await Panel.findOne({ email })
);

const isStrongPassword = (password = '') => (
  typeof password === 'string' &&
  password.length >= 8 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9]/.test(password)
);

const passwordRuleMessage = 'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol';

const snapshotPanelEvaluations = async (panel) => {
  const evaluations = await Evaluation.find({
    panel: panel._id,
    isLegacyArchived: { $ne: true },
  })
    .populate({
      path: 'group',
      select: 'name members section',
      populate: {
        path: 'section',
        select: 'name block subject',
        populate: { path: 'subject', select: 'code title' },
      },
    })
    .populate('subject', 'code title')
    .populate('panel', 'name email');

  for (const evaluation of evaluations) {
    const group = evaluation.group;
    const section = group?.section;
    const subject = section?.subject || evaluation.subject;
    const existingSnapshot = evaluation.legacySnapshot?.toObject
      ? evaluation.legacySnapshot.toObject()
      : evaluation.legacySnapshot || {};
    evaluation.legacySnapshot = {
      ...existingSnapshot,
      groupName: existingSnapshot.groupName || group?.name || 'Deleted group',
      block: existingSnapshot.block || section?.block || section?.name || 'Deleted block',
      subject: existingSnapshot.subject || [subject?.code, subject?.title].filter(Boolean).join(' - '),
      panelName: panel.name,
      panelEmail: panel.email,
      members: existingSnapshot.members || group?.members || [],
    };
    await evaluation.save();
  }

  return evaluations.length;
};

const normalizeLegacyAccountEmails = async (accounts = []) => {
  const normalized = [];

  for (const account of accounts) {
    const normalizedEmail = normalizeLegacyEvalsysEmail(account.email);
    if (normalizedEmail && normalizedEmail !== account.email) {
      const duplicate = await findAccountByEmail(normalizedEmail);
      if (!duplicate || duplicate._id.toString() === account._id.toString()) {
        account.email = normalizedEmail;
        await account.save();
      }
    }
    normalized.push(account);
  }

  return normalized;
};

// Admin: create panel account
exports.createUser = async (req, res) => {
  const { name, email, password, role, assignedSubjects = [], subjectLimit, createdBy } = req.body;
  const schemaError = validateBody(req.body, userCreateSchema);
  if (schemaError) return res.status(400).json({ message: schemaError });
  const normalizedEmail = normalizeEvalsysEmail(email);
  if (!name || !normalizedEmail || !password || !role)
    return res.status(400).json({ message: 'All fields required' });
  if (!isStrongPassword(password))
    return res.status(400).json({ message: passwordRuleMessage });
  if (!['superadmin', 'admin', 'panel'].includes(role))
    return res.status(400).json({ message: 'Role must be superadmin, admin, or panel' });
  if (['superadmin', 'admin'].includes(role) && req.user.role !== 'superadmin')
    return res.status(403).json({ message: 'Only super admin can create instructor/admin accounts' });

  // Check both collections for duplicate email
  if (await findAccountByEmail(normalizedEmail))
    return res.status(409).json({ message: 'Email already in use' });

  const Model = ['superadmin', 'admin'].includes(role) ? Admin : Panel;
  const payload = {
    name,
    email: normalizedEmail,
    password,
    role,
    assignedSubjects,
    mustChangePassword: role !== 'superadmin',
  };
  if (role === 'admin') payload.subjectLimit = Math.max(1, parseInt(subjectLimit, 10) || 1);
  if (role === 'panel') {
    if (req.user.role === 'superadmin') {
      if (!createdBy) return res.status(400).json({ message: 'Select the instructor who owns this panel account' });
      const instructor = await Admin.findOne({ _id: createdBy, role: 'admin', isActive: true });
      if (!instructor) return res.status(400).json({ message: 'Selected instructor is invalid or inactive' });
      payload.createdBy = instructor._id;
    } else {
      payload.createdBy = req.user._id;
    }
  }
  const user = await Model.create(payload);
  res.status(201).json({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    assignedSubjects: user.assignedSubjects || [],
    subjectLimit: user.subjectLimit,
    csvExportLocked: Boolean(user.csvExportLocked),
    gradingLocked: Boolean(user.gradingLocked),
    gradingLockedSubjects: user.gradingLockedSubjects || [],
  });
};

// Bulk create users (for CSV import)
exports.bulkCreateUsers = async (req, res) => {
  const { users } = req.body;
  if (!Array.isArray(users)) return res.status(400).json({ message: 'Users array required' });

  const results = { created: 0, skipped: 0, errors: [] };

  for (const u of users) {
    try {
      const { name, email, password, role, assignedSubjects = [], subjectLimit, createdBy } = u;
      const normalizedEmail = normalizeEvalsysEmail(email);
      if (!name || !normalizedEmail || !password || !role) {
        results.skipped++;
        continue;
      }
      if (!isStrongPassword(password)) {
        results.skipped++;
        results.errors.push(`${email || name}: ${passwordRuleMessage}`);
        continue;
      }

      if (await findAccountByEmail(normalizedEmail)) {
        results.skipped++;
        continue;
      }

      const normalizedRole = role.toLowerCase();
      if (['superadmin', 'admin'].includes(normalizedRole) && req.user.role !== 'superadmin') {
        results.skipped++;
        continue;
      }
      const Model = ['superadmin', 'admin'].includes(normalizedRole) ? Admin : Panel;
      const payload = {
        name,
        email: normalizedEmail,
        password,
        role: normalizedRole,
        assignedSubjects,
        mustChangePassword: normalizedRole !== 'superadmin',
      };
      if (normalizedRole === 'admin') payload.subjectLimit = Math.max(1, parseInt(subjectLimit, 10) || 1);
      if (normalizedRole === 'panel') {
        if (req.user.role === 'superadmin') {
          const ownerId = createdBy || req.headers['x-instructor-id'];
          if (!ownerId) {
            results.skipped++;
            results.errors.push(`${email || name}: select the instructor who owns this panel account`);
            continue;
          }
          const instructor = await Admin.findOne({ _id: ownerId, role: 'admin', isActive: true }).select('_id');
          if (!instructor) {
            results.skipped++;
            results.errors.push(`${email || name}: selected instructor is invalid or inactive`);
            continue;
          }
          payload.createdBy = instructor._id;
        } else {
          payload.createdBy = req.user._id;
        }
      }
      await Model.create(payload);
      results.created++;
    } catch (err) {
      results.errors.push(err.message);
    }
  }

  res.json(results);
};

// Get all users from both collections
exports.getUsers = async (req, res) => {
  const pagination = getPagination(req, { defaultLimit: 25, maxLimit: 100 });
  if (pagination) {
    const search = String(req.query.search || '').trim();
    const role = String(req.query.role || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim().toLowerCase();
    const accountMatch = {};

    if (['superadmin', 'admin', 'panel'].includes(role)) accountMatch.role = role;
    if (status === 'active') accountMatch.isActive = true;
    if (status === 'inactive') accountMatch.isActive = false;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      accountMatch.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    const adminMatch = req.user.role === 'superadmin' ? {} : { _id: null };
    const panelMatch = req.user.role === 'superadmin' ? {} : { createdBy: req.user._id };
    const [result] = await Admin.aggregate([
      { $match: adminMatch },
      {
        $unionWith: {
          coll: 'panel_acc',
          pipeline: [{ $match: panelMatch }],
        },
      },
      { $match: accountMatch },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          items: [
            { $skip: pagination.skip },
            { $limit: pagination.limit },
            {
              $lookup: {
                from: 'subjects',
                localField: 'assignedSubjects',
                foreignField: '_id',
                as: 'assignedSubjects',
                pipeline: [{ $project: { code: 1, title: 1 } }],
              },
            },
            {
              $lookup: {
                from: 'admin_acc',
                localField: 'createdBy',
                foreignField: '_id',
                as: 'createdByAccount',
                pipeline: [{ $project: { name: 1, email: 1 } }],
              },
            },
            { $set: { createdBy: { $first: '$createdByAccount' } } },
            { $unset: ['password', 'createdByAccount'] },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ]);
    return res.json(paginatedPayload(result?.items || [], result?.total?.[0]?.count || 0, pagination));
  }


  const admins = req.user.role === 'superadmin'
    ? await Admin.find().select('-password').populate('assignedSubjects', 'code title').sort({ createdAt: -1 })
    : [];

  let panelFilter = {};
  if (req.user.role !== 'superadmin') {
    panelFilter = { createdBy: req.user._id };
  }

  const panels = await Panel.find(panelFilter)
    .select('-password')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });
  const normalizedAccounts = await normalizeLegacyAccountEmails([...admins, ...panels]);
  res.json(normalizedAccounts);
};

exports.toggleActive = async (req, res) => {
  let user = await Admin.findById(req.params.id) || await Panel.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (!canManageUser(req, user)) return res.status(403).json({ message: 'You can only manage panel accounts created by you' });
  if (user._id.toString() === req.user._id.toString()) return res.status(409).json({ message: 'You cannot deactivate your own account' });
  const isActive = !user.isActive;
  await setActive(user, isActive);
  user.isActive = isActive;
  await recordAuditLog(req, {
    action: 'account.status.update',
    entity: { type: user.role, id: user._id, name: user.name },
    instructor: user.role === 'panel' ? user.createdBy : user._id,
    metadata: { isActive: user.isActive },
  });
  res.json({ id: user._id, isActive: user.isActive });
};

exports.resetPassword = async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ message: 'New password required' });
  if (!isStrongPassword(newPassword)) return res.status(400).json({ message: passwordRuleMessage });

  let user = await Admin.findById(req.params.id).select('+sessionVersion') || await Panel.findById(req.params.id).select('+sessionVersion');
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (!canManageUser(req, user)) return res.status(403).json({ message: 'You can only manage panel accounts created by you' });

  await replacePassword(user.role === 'panel' ? Panel : Admin, user, newPassword, user.role !== 'superadmin');
  await recordAuditLog(req, {
    action: 'account.password.reset',
    entity: { type: user.role, id: user._id, name: user.name },
    instructor: user.role === 'panel' ? user.createdBy : user._id,
  });
  res.json({
    message: user.role === 'superadmin'
      ? 'Temporary password saved successfully'
      : 'Temporary password saved. The user can sign in with it and must change it after signing in.',
  });
};

exports.updateSubjectLimit = async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ message: 'Only super admin can update instructor subject limits' });
  }

  const schemaError = validateBody(req.body, subjectLimitSchema);
  if (schemaError) return res.status(400).json({ message: schemaError });
  const val = parseInt(req.body.subjectLimit, 10);

  const instructor = await Admin.findOne({ _id: req.params.id, role: 'admin' }).select('-password');
  if (!instructor) return res.status(404).json({ message: 'Instructor not found' });

  instructor.subjectLimit = val;
  await instructor.save();
  await recordAuditLog(req, {
    action: 'instructor.subject_limit.update',
    entity: { type: 'admin', id: instructor._id, name: instructor.name },
    instructor: instructor._id,
    metadata: { subjectLimit: val },
  });
  res.json(instructor);
};

exports.updateCsvExportLock = async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ message: 'Only super admin can update instructor CSV export access' });
  }

  if (typeof req.body.csvExportLocked !== 'boolean') {
    return res.status(400).json({ message: 'csvExportLocked must be true or false' });
  }

  const instructor = await Admin.findOne({ _id: req.params.id, role: 'admin' }).select('-password');
  if (!instructor) return res.status(404).json({ message: 'Instructor not found' });

  instructor.csvExportLocked = req.body.csvExportLocked;
  await instructor.save();
  await recordAuditLog(req, {
    action: 'instructor.csv_export_lock.update',
    entity: { type: 'admin', id: instructor._id, name: instructor.name },
    instructor: instructor._id,
    metadata: { csvExportLocked: instructor.csvExportLocked },
  });
  res.json(instructor);
};

exports.updateAiRubricCredits = async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ message: 'Only super admin can update AI rubric credits' });
  }

  const { credits } = req.body;
  const val = parseInt(credits, 10);
  if (!Number.isFinite(val) || val < 0) {
    return res.status(400).json({ message: 'Credits must be a non-negative number' });
  }

  const instructor = await Admin.findOne({ _id: req.params.id, role: 'admin' }).select('-password');
  if (!instructor) return res.status(404).json({ message: 'Instructor not found' });

  instructor.aiRubricCredits = val;
  await instructor.save();
  await recordAuditLog(req, {
    action: 'instructor.ai_rubric_credits.update',
    entity: { type: 'admin', id: instructor._id, name: instructor.name },
    instructor: instructor._id,
    metadata: { aiRubricCredits: val },
  });
  res.json(instructor);
};

exports.updateGradingLock = async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Instructor access required' });
  }

  const schemaError = validateBody(req.body, gradingLockSchema);
  if (schemaError) return res.status(400).json({ message: schemaError });

  if (req.params.id !== req.user._id.toString()) {
    return res.status(403).json({ message: 'You can only update grading access for your own subjects' });
  }

  const instructor = await Admin.findOne({ _id: req.params.id, role: 'admin' }).select('-password');
  if (!instructor) return res.status(404).json({ message: 'Instructor not found' });

  const subjectId = req.body.subject.toString();
  const assignedSubjectIds = (instructor.assignedSubjects || []).map((id) => id.toString());
  if (!assignedSubjectIds.includes(subjectId)) {
    return res.status(400).json({ message: 'Instructor is not assigned to this subject' });
  }

  const currentLocked = (instructor.gradingLockedSubjects || []).map((id) => id.toString());
  if (req.body.gradingLocked && !currentLocked.includes(subjectId)) {
    instructor.gradingLockedSubjects.push(req.body.subject);
  }
  if (!req.body.gradingLocked) {
    instructor.gradingLocked = false;
    instructor.gradingLockedSubjects = instructor.gradingLockedSubjects.filter(
      (id) => id.toString() !== subjectId
    );
  }
  await instructor.save();
  await recordAuditLog(req, {
    action: 'instructor.grading_lock.update',
    entity: { type: 'admin', id: instructor._id, name: instructor.name },
    instructor: instructor._id,
    subject: subjectId,
    metadata: { gradingLocked: req.body.gradingLocked },
  });
  res.json(instructor);
};

exports.deleteUser = async (req, res) => {
  const user = await Admin.findById(req.params.id) || await Panel.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (!canManageUser(req, user)) return res.status(403).json({ message: 'You can only manage panel accounts created by you' });

  if (user.role === 'panel') {
    const preservedEvaluations = await snapshotPanelEvaluations(user);
    await Section.updateMany(
      { assignedPanels: user._id },
      { $pull: { assignedPanels: user._id } }
    );
    await Group.updateMany(
      { assignedPanels: user._id },
      { $pull: { assignedPanels: user._id } }
    );
    await user.deleteOne();
    return res.json({
      message: preservedEvaluations > 0
        ? 'Panel account deleted. Existing submitted results were kept.'
        : 'Panel account and its assignments deleted',
    });
  }
  await user.deleteOne();
  res.json({ message: 'User deleted' });
};
