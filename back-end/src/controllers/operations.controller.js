const Admin = require('../models/Admin');
const Panel = require('../models/Panel');
const Subject = require('../models/Subject');
const Section = require('../models/Section');
const Group = require('../models/Group');
const Evaluation = require('../models/Evaluation');
const Rubric = require('../models/Rubric');
const AuditLog = require('../models/AuditLog');
const RegistrationLink = require('../models/RegistrationLink');
const { listProposalFiles, removeProposalFiles } = require('../services/proposalStorage.service');
const { recordAuditLog } = require('../services/audit.service');
const { getPagination, paginatedPayload } = require('../utils/pagination');
const { AUDIT_EXPORT_LIMIT, buildAuditFilter, validateAuditPagination, auditCsv } = require('../utils/auditQuery');

const serialize = (doc) => {
  const obj = doc?.toObject ? doc.toObject() : doc;
  return JSON.parse(JSON.stringify(obj || {}));
};

const backupMap = {
  users: async () => {
    const [admins, panels] = await Promise.all([
      Admin.find().select('-password').lean(),
      Panel.find().select('-password').lean(),
    ]);
    return [...admins, ...panels].map((user) => ({
      ...user,
      accountType: user.role,
    }));
  },
  groups: async () => Group.find()
    .populate('section', 'block subject')
    .populate('createdBy', 'name email')
    .lean(),
  results: async () => Evaluation.find({ isLegacyArchived: { $ne: true } })
    .populate('group', 'name')
    .populate('panel', 'name email')
    .populate('subject', 'code title')
    .populate('rubric', 'title')
    .lean(),
  archive: async () => Evaluation.find({ isLegacyArchived: true }).lean(),
  rubrics: async () => Rubric.find()
    .populate('subject', 'code title')
    .populate('createdBy', 'name email')
    .lean(),
  subjects: async () => Subject.find()
    .populate('createdBy', 'name email')
    .lean(),
  registrationLinks: async () => RegistrationLink.find()
    .populate('subject', 'code title')
    .populate('createdBy', 'name email')
    .lean(),
};

exports.getAuditLogs = async (req, res) => {
  let filter;
  try {
    filter = buildAuditFilter(req.query);
    validateAuditPagination(req.query);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  const pagination = getPagination(req, { defaultLimit: 80, maxLimit: 200 });
  const legacyLimit = Math.min(Number(req.query.limit || 80), 200);
  const query = AuditLog.find(filter)
    .populate('instructor', 'name email')
    .populate('subject', 'code title')
    .sort({ createdAt: -1, _id: -1 });

  if (!pagination) {
    return res.json(await query.limit(legacyLimit).lean());
  }

  const [logs, total] = await Promise.all([
    query.skip(pagination.skip).limit(pagination.limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return res.json(paginatedPayload(logs, total, pagination));
};

exports.exportAuditLogs = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  let filter;
  try {
    filter = buildAuditFilter(req.query);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  // Read at most one over the limit to detect overflow without silently truncating.
  const logs = await AuditLog.find(filter)
    .select('createdAt action status actor entity instructor subject')
    .populate('instructor', 'name')
    .populate('subject', 'code title')
    .sort({ createdAt: -1, _id: -1 })
    .limit(AUDIT_EXPORT_LIMIT + 1)
    .lean();
  if (logs.length > AUDIT_EXPORT_LIMIT) {
    return res.status(413).json({ message: `Export exceeds ${AUDIT_EXPORT_LIMIT.toLocaleString('en-US')} records. Narrow the filters and try again.` });
  }
  const csv = auditCsv(logs);
  await recordAuditLog(req, {
    action: 'audit.export',
    entity: { type: 'audit', name: 'Audit log CSV' },
    metadata: { rows: logs.length, filters: filter },
  });
  res.type('text/csv');
  res.attachment(`evalsys_audit_${new Date().toISOString().slice(0, 10)}.csv`);
  return res.send(csv);
};

exports.getActivity = async (_req, res) => {
  const [latestLogins, latestSubmissions, failedLogins, recentActions] = await Promise.all([
    AuditLog.find({ action: 'login.success' }).sort({ createdAt: -1 }).limit(8).lean(),
    Evaluation.find({ isSubmitted: true, isLegacyArchived: { $ne: true } })
      .populate('group', 'name')
      .populate('panel', 'name email')
      .populate('subject', 'code title')
      .sort({ updatedAt: -1 })
      .limit(8)
      .lean(),
    AuditLog.find({ action: { $in: ['login.failed', 'login.locked'] } }).sort({ createdAt: -1 }).limit(8).lean(),
    AuditLog.find({ action: { $ne: 'login.success' } }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  res.json({ latestLogins, latestSubmissions, failedLogins, recentActions });
};

exports.getSecurityMonitor = async (_req, res) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const securityActions = [
    'login.failed',
    'login.locked',
    'security.maintenance.access_attempt',
    'security.admin_route.denied',
    'security.token.missing',
    'security.token.invalid',
  ];
  const recentEventActions = [
    'account.password.reset',
    'account.password.changed',
    'account.status.update',
    'instructor.csv_export_lock.update',
    'settings.system_control_updated',
  ];

  const [securityLogs, recentSecurityEvents, recentAccessEvents] = await Promise.all([
    AuditLog.find({
      action: { $in: securityActions },
      createdAt: { $gte: since },
    }).sort({ createdAt: -1 }).limit(300).lean(),
    AuditLog.find({
      action: { $in: recentEventActions },
    }).sort({ createdAt: -1 }).limit(80).lean(),
    AuditLog.find({
      action: {
        $in: [
          'login.success',
          'login.failed',
          'login.locked',
          'security.maintenance.access_attempt',
          'security.admin_route.denied',
          'security.token.missing',
          'security.token.invalid',
        ],
      },
    }).sort({ createdAt: -1 }).limit(80).lean(),
  ]);

  const failedLogins = securityLogs.filter((log) => ['login.failed', 'login.locked'].includes(log.action));
  const byIp = new Map();
  const byAccount = new Map();

  failedLogins.forEach((log) => {
    const ip = log.ip || 'Unknown IP';
    const account = log.actor?.email || 'Unknown account';
    if (!byIp.has(ip)) byIp.set(ip, []);
    if (!byAccount.has(account)) byAccount.set(account, []);
    byIp.get(ip).push(log);
    byAccount.get(account).push(log);
  });

  const toSuspiciousRows = (entries, type, threshold) => Array.from(entries.entries())
    .filter(([, logs]) => logs.length >= threshold)
    .map(([key, logs]) => ({
      type,
      key,
      count: logs.length,
      latestAt: logs[0]?.createdAt,
      ip: logs[0]?.ip,
      account: logs[0]?.actor?.email,
      reason: logs[0]?.metadata?.reason,
      samples: logs.slice(0, 5),
    }));

  const suspicious = [
    ...toSuspiciousRows(byIp, 'many_failed_attempts_same_ip', 5),
    ...toSuspiciousRows(byAccount, 'many_failed_attempts_same_account', 3),
    ...securityLogs
      .filter((log) => log.action === 'security.maintenance.access_attempt')
      .slice(0, 20)
      .map((log) => ({
        type: 'maintenance_login_or_action_attempt',
        key: log.actor?.email || log.ip || 'Unknown user',
        count: 1,
        latestAt: log.createdAt,
        ip: log.ip,
        account: log.actor?.email,
        reason: 'maintenance_mode',
        samples: [log],
      })),
    ...securityLogs
      .filter((log) => log.action === 'security.admin_route.denied')
      .slice(0, 20)
      .map((log) => ({
        type: 'admin_route_denied',
        key: log.actor?.email || log.ip || 'Unknown user',
        count: 1,
        latestAt: log.createdAt,
        ip: log.ip,
        account: log.actor?.email,
        reason: log.metadata?.requiredRole || 'unauthorized',
        samples: [log],
      })),
    ...securityLogs
      .filter((log) => ['security.token.invalid', 'security.token.missing'].includes(log.action))
      .slice(0, 20)
      .map((log) => ({
        type: 'invalid_or_expired_token',
        key: log.ip || 'Unknown IP',
        count: 1,
        latestAt: log.createdAt,
        ip: log.ip,
        account: log.actor?.email,
        reason: 'invalid_token',
        samples: [log],
      })),
  ].sort((a, b) => new Date(b.latestAt || 0) - new Date(a.latestAt || 0));

  res.json({
    windowHours: 24,
    totals: {
      failedLogins: failedLogins.length,
      lockedAccounts: securityLogs.filter((log) => log.action === 'login.locked').length,
      maintenanceAttempts: securityLogs.filter((log) => log.action === 'security.maintenance.access_attempt').length,
      deniedAdminRoutes: securityLogs.filter((log) => log.action === 'security.admin_route.denied').length,
      invalidTokens: securityLogs.filter((log) => log.action === 'security.token.invalid').length,
      missingTokens: securityLogs.filter((log) => log.action === 'security.token.missing').length,
      suspicious: suspicious.length,
    },
    suspicious,
    recentAccessEvents,
    failedLoginDetails: failedLogins.slice(0, 80),
    recentSecurityEvents,
  });
};

exports.getInstructorSummary = async (req, res) => {
  const pagination = getPagination(req, { defaultLimit: 25, maxLimit: 100 });
  const query = Admin.find({ role: 'admin' })
    .populate('assignedSubjects', 'code title')
    .sort({ name: 1 });
  const total = pagination ? await Admin.countDocuments({ role: 'admin' }) : null;
  if (pagination) query.skip(pagination.skip).limit(pagination.limit);
  const instructors = await query;

  const summaries = await Promise.all(instructors.map(async (instructor) => {
    const subjectIds = (instructor.assignedSubjects || []).map((subject) => subject._id);
    const sections = await Section.find({ subject: { $in: subjectIds }, createdBy: instructor._id }).select('_id');
    const sectionIds = sections.map((section) => section._id);
    const groups = await Group.find({ section: { $in: sectionIds }, createdBy: instructor._id }).select('_id proposalFile');
    const groupIds = groups.map((group) => group._id);
    const [panelCount, completedEvaluations] = await Promise.all([
      Panel.countDocuments({ createdBy: instructor._id }),
      Evaluation.countDocuments({ group: { $in: groupIds }, isSubmitted: true, isLegacyArchived: { $ne: true } }),
    ]);

    const proposalBytes = groups.reduce((sum, group) => sum + Number(group.proposalFile?.size || 0), 0);
    return {
      _id: instructor._id,
      name: instructor.name,
      email: instructor.email,
      isActive: instructor.isActive,
      subjectLimit: instructor.subjectLimit,
      subjectsUsed: instructor.assignedSubjects?.length || 0,
      subjects: instructor.assignedSubjects || [],
      groups: groups.length,
      panels: panelCount,
      evaluationsCompleted: completedEvaluations,
      csvExportLocked: Boolean(instructor.csvExportLocked),
      gradingLockedSubjects: instructor.gradingLockedSubjects || [],
      proposalStorageMb: Math.round((proposalBytes / 1024 / 1024) * 100) / 100,
    };
  }));

  if (!pagination) return res.json(summaries);
  return res.json(paginatedPayload(summaries, total, pagination));
};

exports.getProposalOrphans = async (_req, res) => {
  const [storageFiles, linkedGroups] = await Promise.all([
    listProposalFiles(),
    Group.find({ 'proposalFile.path': { $exists: true, $ne: '' } }).select('name proposalFile.path').lean(),
  ]);
  const linkedPaths = new Set(linkedGroups.map((group) => group.proposalFile?.path).filter(Boolean));
  const orphans = storageFiles.filter((file) => !linkedPaths.has(file.path));

  res.json({
    totalFiles: storageFiles.length,
    linkedFiles: linkedPaths.size,
    orphanFiles: orphans.length,
    orphans,
  });
};

exports.cleanupProposalOrphans = async (req, res) => {
  const [storageFiles, linkedGroups] = await Promise.all([
    listProposalFiles(),
    Group.find({ 'proposalFile.path': { $exists: true, $ne: '' } }).select('proposalFile.path').lean(),
  ]);
  const linkedPaths = new Set(linkedGroups.map((group) => group.proposalFile?.path).filter(Boolean));
  const orphans = storageFiles.filter((file) => !linkedPaths.has(file.path));
  const paths = orphans.map((file) => file.path);
  const result = await removeProposalFiles(paths);

  await recordAuditLog(req, {
    action: 'proposal.orphans.cleanup',
    entity: { type: 'storage', name: 'Supabase proposal files' },
    metadata: {
      removed: result.removed,
      paths,
    },
  });

  res.json({
    message: result.removed
      ? `Removed ${result.removed} orphan proposal file${result.removed === 1 ? '' : 's'}.`
      : 'No orphan proposal files found.',
    removed: result.removed,
  });
};

exports.exportBackup = async (req, res) => {
  const type = req.params.type;
  const loader = backupMap[type];
  if (!loader) {
    return res.status(400).json({ message: 'Unknown backup type' });
  }

  const data = await loader();
  await recordAuditLog(req, {
    action: `backup.export.${type}`,
    entity: { type: 'backup', name: type },
    metadata: { rows: data.length },
  });

  res.json(data.map(serialize));
};
