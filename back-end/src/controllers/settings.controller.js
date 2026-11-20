const Settings = require('../models/Settings');
const { recordAuditLog } = require('../services/audit.service');

const ALLOWED_MAINTENANCE_DELAYS = [0, 5, 15, 30];

const { isMaintenanceActive } = require('../services/maintenance.service');
const { parseScheduleDate } = require('../utils/scheduleDate');
const { validateAnnouncement, currentAnnouncement } = require('../services/announcement.service');

const maintenanceResponse = (settings) => ({
  ...settings.toObject(),
  isMaintenanceMode: isMaintenanceActive(settings),
});

const getOrCreateSettings = async () => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({
      isGradingLocked: false,
      isCsvExportLocked: false,
      isMaintenanceMode: false,
    });
  }
  return settings;
};

exports.getSettings = async (req, res) => {
  const settings = await getOrCreateSettings();
  res.set('Cache-Control', 'no-store');
  const response = maintenanceResponse(settings);
  if (req.user.role !== 'superadmin') response.announcement = await currentAnnouncement(settings.announcement, req.user);
  res.json(response);
};

exports.getPublicSettings = async (_req, res) => {
  const settings = await getOrCreateSettings();
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json({
    isMaintenanceMode: isMaintenanceActive(settings),
    maintenanceStartsAt: settings.maintenanceStartsAt,
    maintenanceEndsAt: settings.maintenanceEndsAt,
    maintenanceMessage: settings.maintenanceMessage,
    announcement: { isActive: false },
  });
};

exports.getNotices = async (req, res) => {
  const settings = await getOrCreateSettings();
  res.set('Cache-Control', 'no-store');
  res.json({ announcement: await currentAnnouncement(settings.announcement, req.user) });
};

exports.toggleGradingLock = async (req, res) => {
  const settings = await getOrCreateSettings();
  settings.isGradingLocked = !settings.isGradingLocked;
  await settings.save();
  const response = settings.toObject();
  if (req.user.role !== 'superadmin') response.announcement = await currentAnnouncement(settings.announcement, req.user);
  res.set('Cache-Control', 'no-store');
  res.json(response);
};

exports.toggleCsvExportLock = async (req, res) => {
  const settings = await getOrCreateSettings();
  settings.isCsvExportLocked = !settings.isCsvExportLocked;
  await settings.save();
  res.json(settings);
};

exports.updateSystemControls = async (req, res) => {
  const settings = await getOrCreateSettings();
  const {
    isMaintenanceMode,
    maintenanceDelayMinutes,
    maintenanceStartsAt,
    maintenanceEndsAt,
    maintenanceDurationMinutes,
    maintenanceMessage,
    announcement,
  } = req.body;
  // Validate the whole announcement before modifying any maintenance fields.
  const nextAnnouncement = announcement === undefined ? undefined : await validateAnnouncement(announcement);
  if (maintenanceDurationMinutes !== undefined && (isMaintenanceMode !== true || !Number.isInteger(maintenanceDurationMinutes) || maintenanceDurationMinutes < 1 || maintenanceDurationMinutes > 10080)) {
    return res.status(400).json({ message: 'Maintenance duration must be 1–10,080 minutes when enabling maintenance.' });
  }
  if (maintenanceDurationMinutes !== undefined && maintenanceEndsAt !== undefined && maintenanceEndsAt !== null) return res.status(400).json({ message: 'Choose a maintenance duration or a fixed end, not both.' });

  if (isMaintenanceMode !== undefined && typeof isMaintenanceMode !== 'boolean') {
    return res.status(400).json({ message: 'Maintenance mode must be true or false.' });
  }
  if ((maintenanceStartsAt !== undefined || maintenanceEndsAt !== undefined) && isMaintenanceMode !== true) {
    return res.status(400).json({ message: 'Enable maintenance to set a schedule.' });
  }
  if (typeof maintenanceMessage === 'string' && maintenanceMessage.trim().length > 250) {
    return res.status(400).json({ message: 'Maintenance message must be 250 characters or fewer.' });
  }

  if (typeof isMaintenanceMode === 'boolean') {
    if (!isMaintenanceMode) {
      settings.isMaintenanceMode = false;
      settings.maintenanceStartsAt = null;
      settings.maintenanceEndsAt = null;
    } else {
      const calendarSchedule = maintenanceStartsAt !== undefined;
      if (calendarSchedule && maintenanceDelayMinutes !== undefined) {
        return res.status(400).json({ message: 'Choose a calendar start or a delay, not both.' });
      }
      let startsAt;
      let immediate = false;
      if (calendarSchedule) {
        startsAt = parseScheduleDate(maintenanceStartsAt);
        if (!startsAt || startsAt.getTime() <= Date.now()) {
          return res.status(400).json({ message: 'Maintenance start must be a valid future date and time with a timezone.' });
        }
      } else {
        const requestedDelay = Number(maintenanceDelayMinutes ?? 0);
        if (!ALLOWED_MAINTENANCE_DELAYS.includes(requestedDelay)) {
          return res.status(400).json({ message: 'Maintenance delay must be 0, 5, 15, or 30 minutes.' });
        }
        immediate = requestedDelay === 0;
        startsAt = new Date(Date.now() + requestedDelay * 60 * 1000);
      }
      let endsAt = null;
      if (maintenanceDurationMinutes !== undefined) {
        endsAt = new Date(startsAt.getTime() + maintenanceDurationMinutes * 60000);
      } else if (maintenanceEndsAt !== undefined && maintenanceEndsAt !== null) {
        endsAt = parseScheduleDate(maintenanceEndsAt);
        if (!endsAt || endsAt.getTime() <= startsAt.getTime()) {
          return res.status(400).json({ message: 'Maintenance end must be a valid date and time after its start.' });
        }
      }
      settings.isMaintenanceMode = immediate;
      settings.maintenanceStartsAt = startsAt;
      settings.maintenanceEndsAt = endsAt;
    }
  }

  if (typeof maintenanceMessage === 'string') {
    settings.maintenanceMessage = maintenanceMessage.trim() || 'EvalSys is temporarily unavailable while maintenance is in progress.';
  }

  if (nextAnnouncement !== undefined) settings.announcement = nextAnnouncement;

  await settings.save();
  await recordAuditLog(req, {
    action: 'settings.system_control_updated',
    entity: { type: 'settings', id: settings._id, name: 'System Control' },
    metadata: {
      isMaintenanceMode: settings.isMaintenanceMode,
      maintenanceStartsAt: settings.maintenanceStartsAt,
      maintenanceEndsAt: settings.maintenanceEndsAt,
      maintenanceDelayMinutes: typeof maintenanceDelayMinutes === 'number' ? maintenanceDelayMinutes : undefined,
      announcementActive: settings.announcement?.isActive,
      announcementRoles: settings.announcement?.roles,
      announcementSubjects: settings.announcement?.subjectIds,
      announcementStartsAt: settings.announcement?.startsAt,
      announcementEndsAt: settings.announcement?.endsAt,
    },
  });

  res.json(maintenanceResponse(settings));
};

module.exports.getOrCreateSettings = getOrCreateSettings;
