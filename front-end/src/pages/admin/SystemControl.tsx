import { getApiMessage } from '../../utils/apiError';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { maintenanceStatus, formatMaintenanceDate, localDateTimeInput, formatMaintenanceCountdown } from '../../utils/maintenance';
import api from '../../services/api';
import { notify } from '../../utils/notify';

interface SystemSettings {
  isMaintenanceMode: boolean;
  maintenanceStartsAt?: string | null;
  maintenanceEndsAt?: string | null;
  maintenanceMessage: string;
  announcement?: {
    isActive?: boolean;
    title?: string;
    message?: string;
    updatedAt?: string;
  };
}

interface ConfirmAction {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

const defaultSettings: SystemSettings = {
  isMaintenanceMode: false,
  maintenanceStartsAt: null,
  maintenanceEndsAt: null,
  maintenanceMessage: 'EvalSys is temporarily unavailable while maintenance is in progress.',
  announcement: {
    isActive: false,
    title: '',
    message: '',
  },
};

export default function SystemControl() {
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [maintenanceDelayMinutes, setMaintenanceDelayMinutes] = useState(5);
  const [now, setNow] = useState(0);
  const [scheduleMode, setScheduleMode] = useState<'calendar' | 'quick'>('calendar');
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleEnd, setScheduleEnd] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [loadError, setLoadError] = useState('');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.get('/settings');
      setNow(Date.now());
      setScheduleStart(res.data.maintenanceStartsAt ? localDateTimeInput(res.data.maintenanceStartsAt) : '');
      setScheduleEnd(res.data.maintenanceEndsAt ? localDateTimeInput(res.data.maintenanceEndsAt) : '');
      setSettings({
        isMaintenanceMode: Boolean(res.data.isMaintenanceMode),
        maintenanceStartsAt: res.data.maintenanceStartsAt || null,
        maintenanceEndsAt: res.data.maintenanceEndsAt || null,
        maintenanceMessage: res.data.maintenanceMessage || defaultSettings.maintenanceMessage,
        announcement: {
          isActive: Boolean(res.data.announcement?.isActive),
          title: res.data.announcement?.title || '',
          message: res.data.announcement?.message || '',
          updatedAt: res.data.announcement?.updatedAt,
        },
      });
    } catch (err: unknown) {
      setLoadError(getApiMessage(err, 'Failed to load system controls'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load system controls when this page opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const updateSettings = async (
    next: Partial<SystemSettings> & { maintenanceDelayMinutes?: number },
    successMessage: string,
  ) => {
    setSaving(true);
    try {
      const res = await api.patch('/settings/system-controls', next);
      setNow(Date.now());
      setScheduleStart(res.data.maintenanceStartsAt ? localDateTimeInput(res.data.maintenanceStartsAt) : '');
      setScheduleEnd(res.data.maintenanceEndsAt ? localDateTimeInput(res.data.maintenanceEndsAt) : '');
      setScheduleMode('calendar');
      setScheduleError('');
      setSettings({
        isMaintenanceMode: Boolean(res.data.isMaintenanceMode),
        maintenanceStartsAt: res.data.maintenanceStartsAt || null,
        maintenanceEndsAt: res.data.maintenanceEndsAt || null,
        maintenanceMessage: res.data.maintenanceMessage || defaultSettings.maintenanceMessage,
        announcement: {
          isActive: Boolean(res.data.announcement?.isActive),
          title: res.data.announcement?.title || '',
          message: res.data.announcement?.message || '',
          updatedAt: res.data.announcement?.updatedAt,
        },
      });
      notify(successMessage, { type: 'success' });
    } catch (err: unknown) {
      notify(getApiMessage(err, 'Failed to update system controls'), { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const applyAnnouncement = () => {
    const title = settings.announcement?.title?.trim() || '';
    const message = settings.announcement?.message?.trim() || '';
    updateSettings({
      announcement: {
        isActive: Boolean(settings.announcement?.isActive),
        title,
        message,
      },
    }, settings.announcement?.isActive ? 'Announcement published' : 'Announcement saved');
  };

  const saveAnnouncement = () => {
    const title = settings.announcement?.title?.trim() || '';
    const message = settings.announcement?.message?.trim() || '';
    const willPublish = Boolean(settings.announcement?.isActive);
    if (willPublish && (!title || !message)) {
      notify('Add an announcement title and message before publishing.', { type: 'error' });
      return;
    }
    setConfirmAction({
      title: willPublish ? 'Publish Announcement?' : 'Save Announcement as Hidden?',
      message: willPublish
        ? 'This notice will be shown to all instructors and panels.'
        : 'This saves the announcement content, but users will not see it until you publish it.',
      confirmLabel: willPublish ? 'Publish Announcement' : 'Save Hidden',
      onConfirm: applyAnnouncement,
    });
  };

  const applyClearAnnouncement = () => {
    updateSettings({
      announcement: { isActive: false, title: '', message: '' },
    }, 'Announcement cleared');
  };

  const clearAnnouncement = () => {
    setConfirmAction({
      title: 'Clear Announcement?',
      message: 'This removes the current announcement title and message for instructors and panels.',
      confirmLabel: 'Clear Announcement',
      danger: true,
      onConfirm: applyClearAnnouncement,
    });
  };

  const scheduleMaintenance = () => {
    setScheduleError('');
    let startsAt: Date;
    const payload: Partial<SystemSettings> & { maintenanceDelayMinutes?: number } = {
      isMaintenanceMode: true,
      maintenanceMessage: settings.maintenanceMessage.trim() || defaultSettings.maintenanceMessage,
    };
    if (scheduleMode === 'calendar') {
      startsAt = new Date(scheduleStart);
      if (!scheduleStart || !Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
        setScheduleError('Choose a future maintenance start date and time.');
        return;
      }
      payload.maintenanceStartsAt = startsAt.toISOString();
    } else {
      startsAt = new Date(Date.now() + maintenanceDelayMinutes * 60000);
      payload.maintenanceDelayMinutes = maintenanceDelayMinutes;
    }
    if (scheduleEnd) {
      const endsAt = new Date(scheduleEnd);
      if (!Number.isFinite(endsAt.getTime()) || endsAt.getTime() <= startsAt.getTime()) {
        setScheduleError('The maintenance end must be after the start.');
        return;
      }
      payload.maintenanceEndsAt = endsAt.toISOString();
    } else {
      payload.maintenanceEndsAt = null;
    }
    const immediate = scheduleMode === 'quick' && maintenanceDelayMinutes === 0;
    setConfirmAction({
      title: immediate ? 'Start Maintenance Now?' : 'Save Maintenance Schedule?',
      message: (immediate ? 'Access pauses immediately.' : 'Access pauses on ' + formatMaintenanceDate(startsAt.getTime()) + '.') +
        (payload.maintenanceEndsAt ? ' Access automatically resumes on ' + formatMaintenanceDate(payload.maintenanceEndsAt) + '.' : ' End maintenance manually when your work is complete.') +
        ' Instructors, panels and student registrations are affected. Super Admin retains access.',
      confirmLabel: immediate ? 'Start Now' : 'Save Schedule',
      danger: immediate,
      onConfirm: () => { void updateSettings(payload, immediate ? 'Maintenance started' : 'Maintenance schedule saved'); },
    });
  };

  const stopMaintenance = () => {
    const active = maintenanceStatus(settings, Date.now()).active;
    setConfirmAction({
      title: active ? 'End Maintenance?' : 'Cancel Maintenance Schedule?',
      message: active ? 'Restore instructor, panel and student registration access now.' : 'Remove this schedule. Users can continue using EvalSys normally.',
      confirmLabel: active ? 'End Maintenance' : 'Cancel Schedule',
      onConfirm: () => { void updateSettings({ isMaintenanceMode: false }, active ? 'Maintenance ended' : 'Schedule cancelled'); },
    });
  };

  const saveMaintenanceMessage = () => {
    setConfirmAction({
      title: 'Update Maintenance Message?',
      message: 'Save the message users see during maintenance. The current start and end times stay the same.',
      confirmLabel: 'Save Message',
      onConfirm: () => { void updateSettings({ maintenanceMessage: settings.maintenanceMessage }, 'Maintenance message saved'); },
    });
  };

  const confirmSelectedAction = () => {
    const action = confirmAction;
    if (!action) return;
    setConfirmAction(null);
    action.onConfirm();
  };

  if (loading) {
    return (
      <div>
        <h2 className="evl-page-title mb-2">System Control</h2>
        <p className="evl-page-subtitle mb-6">Manage platform-wide notices and maintenance access.</p>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="h-72 rounded-xl bg-surface border border-muted/30 animate-pulse" />
          <div className="h-72 rounded-xl bg-surface border border-muted/30 animate-pulse" />
        </div>
      </div>
    );
  }

  if (loadError) return <div role="alert" className="evl-card p-8"><h2 className="evl-page-title mb-3">System Control</h2><p className="text-danger mb-4">{loadError}</p><button onClick={() => { void load(); }} className="evl-btn-secondary">Try again</button></div>;
  const status = maintenanceStatus(settings, now);
  const hasMaintenanceStarted = status.active;
  const isMaintenanceScheduled = status.scheduled;
  const remainingTime = formatMaintenanceCountdown((status.start || now) - now);

  return (
    <div>
      <div className="mb-6">
        <h2 className="evl-page-title mb-2">System Control</h2>
        <p className="evl-page-subtitle">Show announcements to instructors and panels, or pause access during updates.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <section className="evl-card p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-primary mb-1">System Announcement</p>
              <h3 className="text-xl font-black text-text">Notice for instructors and panels</h3>
              <p className="text-sm text-text/70 mt-1">Use this for reminders, deadlines, or temporary instructions.</p>
            </div>
            <span className={settings.announcement?.isActive ? 'evl-badge-success' : 'evl-badge-primary'}>
              {settings.announcement?.isActive ? 'Visible' : 'Hidden'}
            </span>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm font-bold text-text">
              <input
                type="checkbox"
                checked={Boolean(settings.announcement?.isActive)}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  announcement: { ...current.announcement, isActive: e.target.checked },
                }))}
                className="w-4 h-4 accent-primary"
              />
              Publish announcement
            </label>

            <div>
              <label className="evl-label">Title</label>
              <input
                value={settings.announcement?.title || ''}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  announcement: { ...current.announcement, title: e.target.value },
                }))}
                className="evl-input"
                placeholder="e.g. Final grading reminder"
                maxLength={80}
              />
            </div>

            <div>
              <label className="evl-label">Message</label>
              <textarea
                value={settings.announcement?.message || ''}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  announcement: { ...current.announcement, message: e.target.value },
                }))}
                className="evl-input min-h-[130px] resize-y"
                placeholder="Write the notice instructors and panels should see."
                maxLength={500}
              />
              <p className="text-xs text-text/60 mt-2">{settings.announcement?.message?.length || 0}/500 characters</p>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button disabled={saving} onClick={saveAnnouncement} className="evl-btn-primary">
                Save Announcement
              </button>
              <button disabled={saving} onClick={clearAnnouncement} className="evl-btn-ghost">
                Clear
              </button>
            </div>
          </div>
        </section>

        <section className={'evl-card p-6 min-w-0 ' + (hasMaintenanceStarted ? 'border-red-200 bg-red-50/60' : isMaintenanceScheduled ? 'border-primary/30' : '')}>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-primary mb-1">Maintenance</p>
              <h3 className="text-xl font-black text-text">Schedule platform downtime</h3>
              <p className="text-sm text-text/70 mt-1">Super Admin keeps access during maintenance.</p>
            </div>
            <span className={hasMaintenanceStarted ? 'evl-badge-danger' : isMaintenanceScheduled ? 'evl-badge-primary' : 'evl-badge-success'}>
              {hasMaintenanceStarted ? 'Active' : isMaintenanceScheduled ? 'Scheduled' : 'System open'}
            </span>
          </div>

          <div className="space-y-4">
            <div className={hasMaintenanceStarted ? 'evl-alert-error' : 'evl-alert-info'} role="status">
              {hasMaintenanceStarted
                ? 'Maintenance is active. Instructor, panel and student registration access is paused.'
                : isMaintenanceScheduled
                  ? 'Maintenance begins in ' + remainingTime + '. Users can continue working until then.'
                  : 'System is open. Users can use EvalSys normally.'}
            </div>

            {(hasMaintenanceStarted || isMaintenanceScheduled) && (
              <dl className="rounded-xl border border-muted/30 p-4 text-sm space-y-2">
                <div><dt className="font-bold text-text">Starts</dt><dd className="text-text/70">{status.start ? formatMaintenanceDate(status.start) : 'Immediately'}</dd></div>
                <div><dt className="font-bold text-text">Ends</dt><dd className="text-text/70">{status.end ? formatMaintenanceDate(status.end) + ' · Access resumes automatically' : 'Manual end · End maintenance when ready'}</dd></div>
              </dl>
            )}
            {status.ended && status.end && <p className="text-xs text-success">The last maintenance window ended on {formatMaintenanceDate(status.end)}. Access has resumed.</p>}

            {!hasMaintenanceStarted && (
              <div className="space-y-4 rounded-xl border border-muted/30 p-4">
                <div>
                  <label htmlFor="maintenance-start-mode" className="evl-label">Start maintenance</label>
                  <select id="maintenance-start-mode" value={scheduleMode} onChange={event => { setScheduleMode(event.target.value as 'calendar' | 'quick'); setScheduleError(''); }} className="evl-input" disabled={saving}>
                    <option value="calendar">Choose calendar date and time</option>
                    <option value="quick">Start now or after a short delay</option>
                  </select>
                </div>
                {scheduleMode === 'calendar' ? (
                  <div>
                    <label htmlFor="maintenance-start-date" className="evl-label">Start date and time</label>
                    <input id="maintenance-start-date" type="datetime-local" value={scheduleStart}
                      min={localDateTimeInput(now)}
                      onChange={event => { setScheduleStart(event.target.value); setScheduleError(''); }}
                      className="evl-input" disabled={saving} />
                  </div>
                ) : (
                  <div>
                    <label htmlFor="maintenance-delay" className="evl-label">Start delay</label>
                    <select id="maintenance-delay" value={maintenanceDelayMinutes} onChange={event => setMaintenanceDelayMinutes(Number(event.target.value))} className="evl-input" disabled={saving}>
                      <option value={0}>Immediately</option>
                      <option value={5}>In 5 minutes</option>
                      <option value={15}>In 15 minutes</option>
                      <option value={30}>In 30 minutes</option>
                    </select>
                  </div>
                )}
                <div>
                  <label htmlFor="maintenance-end-date" className="evl-label">End date and time (optional)</label>
                  <input id="maintenance-end-date" type="datetime-local" value={scheduleEnd}
                    min={scheduleMode === 'calendar' && scheduleStart ? scheduleStart : localDateTimeInput(now)}
                    onChange={event => { setScheduleEnd(event.target.value); setScheduleError(''); }}
                    className="evl-input" disabled={saving} />
                  <p className="text-xs text-text/60 mt-2">Set an end to automatically restore access. Leave blank to end maintenance manually.</p>
                </div>
                <p className="text-xs text-text/65">Calendar times use your timezone: <strong>{timezone}</strong>.</p>
                {scheduleError && <p role="alert" className="text-sm text-danger">{scheduleError}</p>}
              </div>
            )}

            <div>
              <label htmlFor="maintenance-message" className="evl-label">Maintenance message</label>
              <textarea id="maintenance-message" value={settings.maintenanceMessage}
                onChange={event => setSettings(current => ({ ...current, maintenanceMessage: event.target.value }))}
                className="evl-input min-h-[100px] resize-y" maxLength={250} disabled={saving} />
              <p className="text-xs text-text/60 mt-2">{settings.maintenanceMessage.length}/250 characters</p>
            </div>
            <div className="rounded-xl bg-muted/10 p-4">
              <p className="text-xs font-bold text-text/60 mb-1">Message preview</p>
              <p className="text-sm text-text break-words">{settings.maintenanceMessage.trim() || defaultSettings.maintenanceMessage}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              {!hasMaintenanceStarted && <button disabled={saving} onClick={scheduleMaintenance} className="evl-btn-primary">{isMaintenanceScheduled ? 'Update Schedule' : scheduleMode === 'quick' && maintenanceDelayMinutes === 0 ? 'Start Maintenance Now' : 'Schedule Maintenance'}</button>}
              {(hasMaintenanceStarted || isMaintenanceScheduled) && <>
                <button disabled={saving} onClick={stopMaintenance} className="evl-btn-secondary">{hasMaintenanceStarted ? 'End Maintenance' : 'Cancel Schedule'}</button>
                <button disabled={saving} onClick={saveMaintenanceMessage} className="evl-btn-secondary">Save Message</button>
              </>}
            </div>
            <Link to="/security" className="inline-block text-sm font-semibold text-primary hover:underline">View security and change log →</Link>
          </div>
        </section>

      </div>

      {confirmAction && (
        <div role="dialog" aria-modal="true" aria-labelledby="system-action-title" className="fixed inset-0 z-[100] bg-dark/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md evl-card p-6 shadow-2xl">
            <p className={`text-xs font-black uppercase tracking-widest mb-2 ${confirmAction.danger ? 'text-danger' : 'text-primary'}`}>
              Confirm Action
            </p>
            <h3 id="system-action-title" className="text-xl font-black text-text">{confirmAction.title}</h3>
            <p className="text-sm text-text/70 mt-3 leading-relaxed">{confirmAction.message}</p>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={saving}
                className="evl-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSelectedAction}
                disabled={saving}
                className={confirmAction.danger ? 'evl-btn-danger bg-danger text-white hover:bg-red-700 hover:border-danger' : 'evl-btn-primary'}
              >
                {confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
