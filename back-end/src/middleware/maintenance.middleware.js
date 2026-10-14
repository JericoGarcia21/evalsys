const { isMaintenanceActive } = require('../services/maintenance.service');
const Settings = require('../models/Settings');

module.exports = async (_req, res, next) => {
  const settings = await Settings.findOne().select('isMaintenanceMode maintenanceStartsAt maintenanceEndsAt maintenanceMessage');
  if (isMaintenanceActive(settings)) {
    return res.status(503).json({
      maintenanceMode: true,
      message: settings.maintenanceMessage || 'EvalSys is temporarily unavailable while maintenance is in progress.',
    });
  }
  next();
};
