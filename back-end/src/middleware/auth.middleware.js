const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Panel = require('../models/Panel');
const Settings = require('../models/Settings');
const { recordAuditLog } = require('../services/audit.service');

const protect = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    await recordAuditLog(req, {
      action: 'security.token.missing',
      status: 'failed',
      actor: { email: 'unknown' },
      metadata: { path: req.originalUrl, method: req.method },
    });
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Look up in correct collection based on role in token
    let user;
    if (decoded.role === 'admin' || decoded.role === 'superadmin') {
      user = await Admin.findById(decoded.id).select('-password');
    } else {
      user = await Panel.findById(decoded.id).select('-password');
    }

    if (!user || !user.isActive)
      return res.status(401).json({ message: 'Account inactive or not found' });

    req.user = user;
    const passwordChangeAllowed = [
      '/api/auth/me',
      '/api/auth/change-password',
    ].includes(req.originalUrl.split('?')[0]);

    if (user.role !== 'superadmin' && !passwordChangeAllowed) {
      const settings = await Settings.findOne().select('isMaintenanceMode maintenanceStartsAt maintenanceMessage');
      const scheduledMaintenanceStarted = settings?.maintenanceStartsAt
        && settings.maintenanceStartsAt.getTime() <= Date.now();
      if (settings?.isMaintenanceMode || scheduledMaintenanceStarted) {
        await recordAuditLog(req, {
          action: 'security.maintenance.access_attempt',
          status: 'failed',
          actor: { id: user._id, name: user.name, email: user.email, role: user.role },
          metadata: { path: req.originalUrl, method: req.method },
        });
        return res.status(503).json({
          message: settings.maintenanceMessage || 'EvalSys is temporarily unavailable while maintenance is in progress.',
          maintenanceMode: true,
        });
      }
    }

    if (user.mustChangePassword && !passwordChangeAllowed) {
      return res.status(403).json({
        message: 'You must change your temporary password before continuing',
        mustChangePassword: true,
      });
    }
    next();
  } catch (error) {
    if (!['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) return next(error);
    await recordAuditLog(req, {
      action: 'security.token.invalid',
      status: 'failed',
      actor: { email: 'unknown' },
      metadata: { path: req.originalUrl, method: req.method },
    });
    res.status(401).json({ message: 'Invalid token' });
  }
};

const adminOnly = async (req, res, next) => {
  if (!['admin', 'superadmin'].includes(req.user?.role)) {
    await recordAuditLog(req, {
      action: 'security.admin_route.denied',
      status: 'failed',
      metadata: { path: req.originalUrl, method: req.method, requiredRole: 'admin' },
    });
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

const instructorOnly = async (req, res, next) => {
  if (req.user?.role !== 'admin') {
    await recordAuditLog(req, {
      action: 'security.admin_route.denied',
      status: 'failed',
      metadata: { path: req.originalUrl, method: req.method, requiredRole: 'instructor' },
    });
    return res.status(403).json({ message: 'Instructor access required' });
  }
  next();
};

const instructorOrPanelOnly = async (req, res, next) => {
  if (!['admin', 'panel'].includes(req.user?.role)) {
    await recordAuditLog(req, {
      action: 'security.admin_route.denied',
      status: 'failed',
      metadata: { path: req.originalUrl, method: req.method, requiredRole: 'instructor_or_panel' },
    });
    return res.status(403).json({ message: 'Instructor or panel access required' });
  }
  next();
};

const superadminInstructorContext = async (req, res, next) => {
  if (req.user?.role !== 'superadmin') return next();

  const instructorId = req.headers['x-instructor-id'];
  if (!instructorId) {
    return res.status(400).json({ message: 'Select an instructor before managing operational data' });
  }

  const instructor = await Admin.findOne({ _id: instructorId, role: 'admin', isActive: true }).select('assignedSubjects');
  if (!instructor) return res.status(400).json({ message: 'Selected instructor is invalid or inactive' });

  const subjectId = req.headers['x-subject-id'] || req.query.subject || req.body?.subject;
  if (!subjectId) return res.status(400).json({ message: 'Select a subject before managing operational data' });

  const assigned = (instructor.assignedSubjects || []).some((id) => id.toString() === subjectId.toString());
  if (!assigned) return res.status(403).json({ message: 'Selected subject does not belong to the selected instructor' });

  req.instructorContext = instructor;
  next();
};

const superadminOnly = async (req, res, next) => {
  if (req.user?.role !== 'superadmin') {
    await recordAuditLog(req, {
      action: 'security.admin_route.denied',
      status: 'failed',
      metadata: { path: req.originalUrl, method: req.method, requiredRole: 'superadmin' },
    });
    return res.status(403).json({ message: 'Super admin access required' });
  }
  next();
};

const panelOnly = async (req, res, next) => {
  if (req.user?.role !== 'panel') {
    await recordAuditLog(req, {
      action: 'security.admin_route.denied',
      status: 'failed',
      metadata: { path: req.originalUrl, method: req.method, requiredRole: 'panel' },
    });
    return res.status(403).json({ message: 'Panel access required' });
  }
  next();
};

module.exports = {
  protect,
  adminOnly,
  instructorOnly,
  instructorOrPanelOnly,
  panelOnly,
  superadminOnly,
  superadminInstructorContext,
};
