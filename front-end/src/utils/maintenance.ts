export interface MaintenanceWindow {
  isMaintenanceMode?: boolean;
  maintenanceStartsAt?: string | null;
  maintenanceEndsAt?: string | null;
}

export const maintenanceStatus = (settings: MaintenanceWindow | null, now: number) => {
  const start = settings?.maintenanceStartsAt ? new Date(settings.maintenanceStartsAt).getTime() : null;
  const end = settings?.maintenanceEndsAt ? new Date(settings.maintenanceEndsAt).getTime() : null;
  const ended = end !== null && end <= now;
  const active = !ended && Boolean(settings?.isMaintenanceMode || (start !== null && start <= now));
  return { start, end, ended, active, scheduled: !ended && !active && start !== null && start > now };
};

export const formatMaintenanceDate = (value: string | number) => new Date(value).toLocaleString([], {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
});

export const localDateTimeInput = (value: string | number) => {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
};

export const formatMaintenanceCountdown = (milliseconds: number) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  const clock = minutes + ':' + String(seconds % 60).padStart(2, '0');
  return (days ? days + 'd ' : '') + (hours || days ? hours + 'h ' : '') + clock;
};
