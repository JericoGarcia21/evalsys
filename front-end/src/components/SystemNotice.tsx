import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import { maintenanceStatus, formatMaintenanceDate, formatMaintenanceCountdown } from '../utils/maintenance';
import { useLocation } from 'react-router-dom';
import LegalLinks from './LegalLinks';

interface PublicSettings {
  noticeOwner?: string;
  isMaintenanceMode: boolean;
  maintenanceStartsAt?: string | null;
  maintenanceEndsAt?: string | null;
  maintenanceMessage?: string;
  announcement?: {
    isActive?: boolean;
    title?: string;
    message?: string;
    startsAt?: string | null;
    endsAt?: string | null;
    updatedAt?: string;
  };
}

export default function SystemNotice() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [now, setNow] = useState(0);
  const [dismissedAnnouncement, setDismissedAnnouncement] = useState('');
  const [dismissedWarning, setDismissedWarning] = useState('');
  const userId = user?.id || user?._id || '';
  const userRole = user?.role || '';
  const noticeOwner = `${userId}:${userRole}`;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let requestId = 0;
    const load = async () => {
      const currentRequest = ++requestId;
      const isCurrent = () => active && currentRequest === requestId;
      const statusRequest = api.get('/settings/public', {
          params: { t: Date.now() },
          headers: { 'Cache-Control': 'no-cache' },
          signal: controller.signal,
        }).then(response => {
          if (!isCurrent()) return;
          setNow(Date.now());
          setSettings(current => ({
            ...response.data,
            // Public status never supplies notice content, even if an older server does.
            announcement: current?.announcement, noticeOwner: current?.noticeOwner,
          }));
        });
      const noticeRequest = ['admin', 'panel'].includes(userRole) ? api.get('/settings/notices', { signal: controller.signal, timeout: 8000, headers: { 'Cache-Control': 'no-cache' } }) : Promise.resolve(null);
      const updateNotice = (announcement: PublicSettings['announcement']) => {
        if (!isCurrent()) return;
        setNow(Date.now());
        setSettings(current => ({ ...(current || { isMaintenanceMode: false }), announcement, noticeOwner }));
      };
      // A stalled private notice must not delay public maintenance status.
      await Promise.allSettled([statusRequest, noticeRequest.then(response => updateNotice(response?.data?.announcement)).catch(() => updateNotice({ isActive: false }))]);
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
      controller.abort();
      window.removeEventListener('evalsys:maintenance-mode', handleMaintenanceMode);
      window.clearInterval(timer);
    };
  }, [userRole, noticeOwner]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const isUserAudience = user?.role === 'admin' || user?.role === 'panel';
  const status = maintenanceStatus(settings, now);
  const showMaintenance = status.active && user?.role !== 'superadmin';
  const announcementKey = `${noticeOwner}::${settings?.announcement?.updatedAt || ''}::${settings?.announcement?.startsAt || ''}::${settings?.announcement?.endsAt || ''}::${settings?.announcement?.title || ''}::${settings?.announcement?.message || ''}`;
  const warningKey = `${status.start || ''}::${status.end || ''}`;
  const showMaintenanceWarning = status.scheduled && user?.role !== 'superadmin' && dismissedWarning !== warningKey;
  const announcementLive = (!settings?.announcement?.startsAt || new Date(settings.announcement.startsAt).getTime() <= now) && (!settings?.announcement?.endsAt || new Date(settings.announcement.endsAt).getTime() > now);
  const showAnnouncement = isUserAudience && settings?.noticeOwner === noticeOwner && settings?.announcement?.isActive && announcementLive && settings.announcement.message && dismissedAnnouncement !== announcementKey;
  const remainingTime = formatMaintenanceCountdown((status.start || now) - now);

  if (['/terms', '/privacy', '/copyright'].includes(pathname)) return null;
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
            <div className="mt-5 text-text/70"><LegalLinks newTab /></div>
          </div>
        </div>
      )}

      {(showMaintenanceWarning || showAnnouncement) && (
        <div className="fixed top-3 left-1/2 z-[60] w-[min(720px,calc(100vw-24px))] -translate-x-1/2 space-y-3 pointer-events-none">
          {showMaintenanceWarning && (
            <div className="pointer-events-auto rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-widest text-amber-700">Scheduled Maintenance</p>
                  <p className="text-sm font-bold text-text mt-1">
                    Maintenance begins in {remainingTime}. {status.start && formatMaintenanceDate(status.start)}.
                  </p>
                  <p className="text-xs text-text/70 mt-1">
                    {status.start && status.start - now <= 30 * 60000 ? 'Please save and finish your current work.' : 'Plan your work around this maintenance window.'}
                    {status.end ? ' Access resumes on ' + formatMaintenanceDate(status.end) + '.' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedWarning(warningKey)}
                  aria-label="Dismiss maintenance warning"
                  title="Dismiss"
                  className="shrink-0 text-amber-700 hover:text-amber-900 text-lg leading-none"
                >
                  &times;
                </button>
              </div>
            </div>
          )}
          {showAnnouncement && (
            <div className="pointer-events-auto rounded-lg border border-primary/20 bg-white px-4 py-3 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-widest text-primary break-words">{settings?.announcement?.title || 'System Announcement'}</p>
                  <p className="text-sm font-semibold text-text mt-1 break-words whitespace-pre-line">{settings?.announcement?.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedAnnouncement(announcementKey)}
                  aria-label="Dismiss announcement"
                  title="Dismiss"
                  className="shrink-0 text-text/50 hover:text-text text-lg leading-none"
                >
                  &times;
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
