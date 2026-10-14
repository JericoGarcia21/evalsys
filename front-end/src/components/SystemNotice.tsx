import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import { maintenanceStatus, formatMaintenanceDate, formatMaintenanceCountdown } from '../utils/maintenance';

interface PublicSettings {
  isMaintenanceMode: boolean;
  maintenanceStartsAt?: string | null;
  maintenanceEndsAt?: string | null;
  maintenanceMessage?: string;
  announcement?: {
    isActive?: boolean;
    title?: string;
    message?: string;
  };
}

export default function SystemNotice() {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await api.get('/settings/public', {
          params: { t: Date.now() },
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (active) {
          setNow(Date.now());
          setSettings(res.data);
        }
      } catch {
        // The notice should never block app usage if the status check fails.
      }
    };
    const handleMaintenanceMode = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setSettings((current) => ({
        ...(current || { announcement: { isActive: false, title: '', message: '' } }),
        isMaintenanceMode: true,
        maintenanceStartsAt: null,
        maintenanceEndsAt: current?.maintenanceEndsAt && new Date(current.maintenanceEndsAt).getTime() > Date.now() ? current.maintenanceEndsAt : null,
        maintenanceMessage: detail?.message || current?.maintenanceMessage,
      }));
    };
    load();
    window.addEventListener('evalsys:maintenance-mode', handleMaintenanceMode);
    const timer = window.setInterval(load, 10000);
    return () => {
      active = false;
      window.removeEventListener('evalsys:maintenance-mode', handleMaintenanceMode);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const isUserAudience = user?.role === 'admin' || user?.role === 'panel';
  const status = maintenanceStatus(settings, now);
  const showMaintenance = status.active && user?.role !== 'superadmin';
  const showMaintenanceWarning = status.scheduled && user?.role !== 'superadmin';
  const showAnnouncement = isUserAudience && settings?.announcement?.isActive && settings.announcement.message;
  const remainingTime = formatMaintenanceCountdown((status.start || now) - now);

  if (!showMaintenance && !showMaintenanceWarning && !showAnnouncement) return null;

  return (
    <>
      {showMaintenance && (
        <div className="fixed inset-0 z-[80] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-xl border border-danger/25 bg-white p-6 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-widest text-danger">Maintenance Mode</p>
            <h2 className="text-2xl font-black text-text mt-2">EvalSys is temporarily paused</h2>
            <p className="text-sm font-semibold text-text/75 mt-3">
              {settings?.maintenanceMessage || 'EvalSys is temporarily unavailable while maintenance is in progress.'}
            </p>
            <p className="text-xs text-text/55 mt-4">
              {status.end ? 'Access resumes automatically on ' + formatMaintenanceDate(status.end) + '.' : 'This screen updates automatically when maintenance is done.'}
            </p>
            {user && (
              <button
                type="button"
                onClick={logout}
                className="evl-btn-secondary w-full mt-5"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>
      )}

      {(showMaintenanceWarning || showAnnouncement) && (
        <div className="fixed top-3 left-1/2 z-[60] w-[min(720px,calc(100vw-24px))] -translate-x-1/2 space-y-3 pointer-events-none">
          {showMaintenanceWarning && (
            <div className="pointer-events-auto rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg">
              <p className="text-xs font-black uppercase tracking-widest text-amber-700">Scheduled Maintenance</p>
              <p className="text-sm font-bold text-text mt-1">
                Maintenance begins in {remainingTime}. {status.start && formatMaintenanceDate(status.start)}.
              </p>
              <p className="text-xs text-text/70 mt-1">
                {status.start && status.start - now <= 30 * 60000 ? 'Please save and finish your current work.' : 'Plan your work around this maintenance window.'}
                {status.end ? ' Access resumes on ' + formatMaintenanceDate(status.end) + '.' : ''}
              </p>
            </div>
          )}
          {showAnnouncement && (
            <div className="pointer-events-auto rounded-lg border border-primary/20 bg-white px-4 py-3 shadow-lg">
              <p className="text-xs font-black uppercase tracking-widest text-primary">{settings?.announcement?.title || 'System Announcement'}</p>
              <p className="text-sm font-semibold text-text mt-1">{settings?.announcement?.message}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
