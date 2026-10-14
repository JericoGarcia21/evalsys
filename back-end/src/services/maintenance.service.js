const isMaintenanceActive = (settings, now = Date.now()) => {
  if (!settings) return false;
  if (settings.maintenanceEndsAt && new Date(settings.maintenanceEndsAt).getTime() <= now) return false;
  return Boolean(settings.isMaintenanceMode || (
    settings.maintenanceStartsAt && new Date(settings.maintenanceStartsAt).getTime() <= now
  ));
};

module.exports = { isMaintenanceActive };
