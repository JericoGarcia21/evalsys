const Settings = require('../models/Settings');

module.exports = async (_req, res, next) => {
  const settings = await Settings.findOne().select('isMaintenanceMode maintenanceStartsAt maintenanceMessage');
  if (settings?.isMaintenanceMode || (settings?.maintenanceStartsAt && settings.maintenanceStartsAt.getTime() <= Date.now())) {
    return res.status(503).json({
      maintenanceMode: true,
      message: settings.maintenanceMessage || 'EvalSys is temporarily unavailable while maintenance is in progress.',
    });
  }
  next();
};
