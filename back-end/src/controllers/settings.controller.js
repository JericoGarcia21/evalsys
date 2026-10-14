const Settings = require('../models/Settings');
const { recordAuditLog } = require('../services/audit.service');

const ALLOWED_MAINTENANCE_DELAYS = [0, 5, 15, 30];

const { isMaintenanceActive } = require('../services/maintenance.service');


const parseScheduleDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59) return null;
  const date = new Date(value);
  const calendarDay = new Date(value.slice(0, 10) + 'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  return date;
};

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
  res.json(maintenanceResponse(settings));
};

exports.getPublicSettings = async (_req, res) => {
  const settings = await getOrCreateSettings();
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json({
    isMaintenanceMode: isMaintenanceActive(settings),
    maintenanceStartsAt: settings.maintenanceStartsAt,
    maintenanceEndsAt: settings.maintenanceEndsAt,
    maintenanceMessage: settings.maintenanceMessage,
    announcement: settings.announcement,
  });
};

exports.toggleGradingLock = async (req, res) => {
  const settings = await getOrCreateSettings();
  settings.isGradingLocked = !settings.isGradingLocked;
  await settings.save();
  res.json(settings);
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
    maintenanceMessage,
    announcement,
  } = req.body;

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
      if (maintenanceEndsAt !== undefined && maintenanceEndsAt !== null) {
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

  if (announcement && typeof announcement === 'object') {
    settings.announcement = {
      isActive: Boolean(announcement.isActive),
      title: String(announcement.title || '').trim(),
      message: String(announcement.message || '').trim(),
      updatedAt: new Date(),
    };
  }

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
    },
  });

  res.json(maintenanceResponse(settings));
};

module.exports.getOrCreateSettings = getOrCreateSettings;
