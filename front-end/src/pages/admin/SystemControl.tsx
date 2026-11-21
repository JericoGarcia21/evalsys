import { getApiMessage } from '../../utils/apiError';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { maintenanceStatus, formatMaintenanceDate, localDateTimeInput, formatMaintenanceCountdown } from '../../utils/maintenance';
import api from '../../services/api';
import { notify } from '../../utils/notify';
import MaintenancePresets, { type MaintenancePreset } from '../../components/admin/MaintenancePresets';
import './SystemControl.css';

interface SystemSettings {
  sharedPanelsEnabled: boolean;
  isMaintenanceMode: boolean;
  maintenanceStartsAt?: string | null;
  maintenanceEndsAt?: string | null;
  maintenanceMessage: string;
  announcement?: {
    isActive?: boolean;
    title?: string;
    message?: string;
    updatedAt?: string;
    roles?: string[];
    subjectIds?: string[];
    startsAt?: string | null;
    endsAt?: string | null;
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
  sharedPanelsEnabled: false,
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

const normalizeSettings = (value: SystemSettings): SystemSettings => ({
  sharedPanelsEnabled: Boolean(value.sharedPanelsEnabled),
  isMaintenanceMode: Boolean(value.isMaintenanceMode),
  maintenanceStartsAt: value.maintenanceStartsAt || null,
  maintenanceEndsAt: value.maintenanceEndsAt || null,
  maintenanceMessage: value.maintenanceMessage || defaultSettings.maintenanceMessage,
  announcement: {
    isActive: Boolean(value.announcement?.isActive), title: value.announcement?.title || '', message: value.announcement?.message || '',
    updatedAt: value.announcement?.updatedAt, roles: value.announcement?.roles || ['admin', 'panel'],
    subjectIds: value.announcement?.subjectIds || [], startsAt: value.announcement?.startsAt || null, endsAt: value.announcement?.endsAt || null,
  },
});
const noticeFingerprint = (value: SystemSettings['announcement']) => JSON.stringify({
  isActive: Boolean(value?.isActive), title: value?.title || '', message: value?.message || '',
  roles: [...(value?.roles || ['admin', 'panel'])].sort(), subjects: [...(value?.subjectIds || [])].sort(),
  startsAt: value?.startsAt || null, endsAt: value?.endsAt || null,
});

function ControlIcon({ maintenance = false }: { maintenance?: boolean }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {maintenance ? <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></> : <><path d="m4 10 14-5v14L4 14Z" /><path d="M18 9h2v6h-2M6 15l1 5h3l-1-4M4 10H2v4h2" /></>}
  </svg>;
}

function ControlConfirmation({ action, onCancel, onConfirm }: { action: ConfirmAction; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => { dialog?.close(); opener?.focus(); };
  }, []);
  return <dialog ref={dialogRef} className="sc-confirm-dialog" aria-labelledby="system-action-title" onCancel={event => { event.preventDefault(); onCancel(); }}>
    <p className="sc-eyebrow">Confirm change</p>
    <h3 id="system-action-title">{action.title}</h3>
    <p className="sc-confirm-message">{action.message}</p>
    <div className="grid grid-cols-2 gap-3 mt-6">
      <button ref={cancelRef} type="button" className="evl-btn-secondary" onClick={onCancel}>Cancel</button>
      <button type="button" className={`evl-btn-primary ${action.danger ? 'sc-confirm-danger' : ''}`} onClick={onConfirm}>{action.confirmLabel}</button>
    </div>
  </dialog>;
}

export default function SystemControl() {
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [savedSettings, setSavedSettings] = useState<SystemSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'maintenance' ? 'maintenance' : 'announcements';
  const [maintenanceDelayMinutes, setMaintenanceDelayMinutes] = useState(5);
  const [now, setNow] = useState(0);
  const [scheduleMode, setScheduleMode] = useState<'calendar' | 'quick'>('calendar');
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleEnd, setScheduleEnd] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [subjects, setSubjects] = useState<Array<{ _id: string; code: string; title: string }>>([]);
  const [subjectError, setSubjectError] = useState('');
  const [subjectRevision, setSubjectRevision] = useState(0);
  const [subjectTargeting, setSubjectTargeting] = useState(false);
  const [presetDuration, setPresetDuration] = useState<number | null | undefined>(undefined);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.get('/settings');
      setNow(Date.now());
      setScheduleStart(res.data.maintenanceStartsAt ? localDateTimeInput(res.data.maintenanceStartsAt) : '');
      setScheduleEnd(res.data.maintenanceEndsAt ? localDateTimeInput(res.data.maintenanceEndsAt) : '');
      setSubjectTargeting(Boolean(res.data.announcement?.subjectIds?.length));
      const next = normalizeSettings(res.data);
      setSettings(next);
      setSavedSettings(next);
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
    const controller = new AbortController();
    api.get('/subjects', { params: { scope: 'all' }, signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) { setSubjects(response.data); setSubjectError(''); }
    }).catch((err: unknown) => { if (!controller.signal.aborted) setSubjectError(getApiMessage(err, 'Unable to load announcement subjects. Existing selections will be preserved.')); });
    return () => controller.abort();
  }, [subjectRevision]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const updateSettings = async (
    next: Partial<SystemSettings> & { maintenanceDelayMinutes?: number; maintenanceDurationMinutes?: number },
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
      setPresetDuration(undefined);
      setSubjectTargeting(Boolean(res.data.announcement?.subjectIds?.length));
      const saved = normalizeSettings(res.data);
      setSettings(saved);
      setSavedSettings(saved);
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
        ...settings.announcement,
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
    if (!settings.announcement?.roles?.length) { notify('Select at least one announcement audience.', { type: 'error' }); return; }
    if (subjectTargeting && !settings.announcement.subjectIds?.length) { notify('Select at least one subject, or choose all subjects.', { type: 'error' }); return; }
    if (settings.announcement.startsAt && settings.announcement.endsAt && new Date(settings.announcement.endsAt) <= new Date(settings.announcement.startsAt)) { notify('Announcement end must be after its start.', { type: 'error' }); return; }
    if (willPublish && (!title || !message)) {
      notify('Add an announcement title and message before publishing.', { type: 'error' });
      return;
    }
    setConfirmAction({
      title: willPublish ? 'Publish Announcement?' : 'Save Announcement as Hidden?',
      message: willPublish
        ? `Enable this notice for ${settings.announcement.roles.map(role => role === 'admin' ? 'instructors' : 'panels').join(' and ')} in ${subjectTargeting ? 'the selected subjects' : 'all subjects'}. ${settings.announcement.startsAt ? `Starts ${formatMaintenanceDate(settings.announcement.startsAt)}.` : 'Starts immediately.'} ${settings.announcement.endsAt ? `Ends ${formatMaintenanceDate(settings.announcement.endsAt)}.` : 'No scheduled end.'}`
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
    const payload: Partial<SystemSettings> & { maintenanceDelayMinutes?: number; maintenanceDurationMinutes?: number } = {
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
    if (presetDuration !== undefined && presetDuration !== null) {
      payload.maintenanceDurationMinutes = presetDuration;
    } else if (scheduleEnd) {
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
        (payload.maintenanceDurationMinutes ? ` Access automatically resumes ${payload.maintenanceDurationMinutes} minutes after the actual start.` : payload.maintenanceEndsAt ? ' Access automatically resumes on ' + formatMaintenanceDate(payload.maintenanceEndsAt) + '.' : ' End maintenance manually when your work is complete.') +
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

  const loadPreset = (preset: MaintenancePreset) => {
    setSettings(current => ({ ...current, maintenanceMessage: preset.message }));
    setScheduleMode('quick'); setMaintenanceDelayMinutes(preset.delayMinutes); setPresetDuration(preset.durationMinutes);
    setScheduleEnd(preset.durationMinutes === null ? '' : localDateTimeInput(Date.now() + (preset.delayMinutes + preset.durationMinutes) * 60000));
    setScheduleError('');
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
  const savedNotice = savedSettings.announcement;
  const announcementStatus = !savedNotice?.isActive ? 'Hidden' : savedNotice.endsAt && new Date(savedNotice.endsAt).getTime() <= now ? 'Expired' : savedNotice.startsAt && new Date(savedNotice.startsAt).getTime() > now ? 'Scheduled' : 'Visible';
  const announcementChanged = noticeFingerprint(settings.announcement) !== noticeFingerprint(savedNotice);
  const audienceLabel = (settings.announcement?.roles || []).map(role => role === 'admin' ? 'Instructors' : 'Panels').join(' & ') || 'No audience selected';
  const selectedSubjects = subjects.filter(subject => settings.announcement?.subjectIds?.includes(subject._id));

  return (
    <div className="system-control-ui">
      {confirmAction && <ControlConfirmation action={confirmAction} onCancel={() => setConfirmAction(null)} onConfirm={() => { const action = confirmAction; setConfirmAction(null); action.onConfirm(); }} />}
      <header className="sc-page-header">
        <div>
          <p className="sc-eyebrow">Platform operations</p>
          <h2 className="evl-page-title">System Control</h2>
          <p className="evl-page-subtitle">Keep people informed. Manage downtime with confidence.</p>
        </div>
        <Link to="/security" className="evl-btn-secondary">View activity log <span aria-hidden="true">↗</span></Link>
      </header>

      <section className="evl-card p-5 mb-5" aria-label="Shared panel feature control">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-text">Cross-instructor panel assignments</h3>
            <p className="text-sm text-text/70 mt-1">{savedSettings.sharedPanelsEnabled ? 'ON — panels can work across instructors.' : 'OFF — owner-only panel mode (previous behavior).'}</p>
          </div>
          <button type="button" role="switch" aria-checked={savedSettings.sharedPanelsEnabled} aria-label="Cross-instructor panel assignments"
            disabled={saving} className={savedSettings.sharedPanelsEnabled ? 'evl-btn-secondary' : 'evl-btn-primary'}
            onClick={() => { void updateSettings({ sharedPanelsEnabled: !savedSettings.sharedPanelsEnabled }, savedSettings.sharedPanelsEnabled ? 'Owner-only panel mode restored.' : 'Cross-instructor panels enabled.'); }}>
            {saving ? 'Saving...' : savedSettings.sharedPanelsEnabled ? 'Turn OFF — restore owner-only mode' : 'Turn ON shared panels'}
          </button>
        </div>
        <p className="text-xs text-text/65 mt-3">Temporary presentation control, default OFF. Turning OFF blocks new cross-instructor assignments and shared panel access. Assignments and grades stay saved; unfinished shared judges still count toward result completeness. Turn ON to resume. Refresh open pages to update their lists.</p>
      </section>

      <dl className="sc-status-strip" aria-label="Saved platform status">
        <div><dt>Platform access</dt><dd><span className={`sc-status-dot ${hasMaintenanceStarted ? 'sc-dot-danger' : isMaintenanceScheduled ? 'sc-dot-warning' : 'sc-dot-success'}`} />{hasMaintenanceStarted ? 'Access paused' : isMaintenanceScheduled ? 'Downtime scheduled' : 'Available'}</dd></div>
        <div><dt>Announcement</dt><dd>{announcementStatus === 'Visible' ? 'Notice is live' : announcementStatus === 'Scheduled' ? 'Notice scheduled' : announcementStatus === 'Expired' ? 'Notice expired' : 'No live notice'}</dd></div>
        <div><dt>Administrator access</dt><dd>Always available</dd><p>Times shown in {timezone}</p></div>
      </dl>

      <nav className="sc-view-nav" aria-label="System control views">
        <button type="button" aria-pressed={view === 'announcements'} disabled={saving} onClick={() => setParams({})}><ControlIcon /><span>Announcements</span></button>
        <button type="button" aria-pressed={view === 'maintenance'} disabled={saving} onClick={() => setParams({ view: 'maintenance' })}><ControlIcon maintenance /><span>Maintenance</span></button>
      </nav>

      <div className="sc-workspace">
        <section hidden={view !== 'announcements'} aria-label="Announcement controls" className="evl-card sc-panel">
          <div className="sc-panel-header">
            <div>
              <h3>Keep your workspace informed</h3>
              <p>Write a notice, choose its audience, and decide when it appears.</p>
            </div>
            <span className={announcementStatus === 'Visible' ? 'evl-badge-success' : 'evl-badge-primary'}>
              {announcementStatus}
            </span>
          </div>

          <div className="sc-panel-grid">
            <div className="sc-form">
            <div className="sc-section-heading"><span>01</span><div><h4>Compose your notice</h4><p>A clear title and a short message work best.</p></div></div>
            <label className="sc-publish-option">
              <input
                type="checkbox"
                aria-label="Publish announcement"
                disabled={saving}
                checked={Boolean(settings.announcement?.isActive)}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  announcement: { ...current.announcement, isActive: e.target.checked },
                }))}
                className="w-4 h-4 accent-primary"
              />
              <span>Publish announcement<small>Enable delivery when you save. Unchecked notices stay hidden.</small></span>
            </label>

            <div>
              <label htmlFor="announcement-title" className="evl-label">Title</label>
              <input
                id="announcement-title"
                disabled={saving}
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
              <label htmlFor="announcement-message" className="evl-label">Message</label>
              <textarea
                id="announcement-message"
                disabled={saving}
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

            <fieldset className="sc-form-section space-y-3" disabled={saving}>
              <legend className="sc-legend"><span>02</span> Announcement audience</legend>
              <div className="sc-audience-options">
                {([['admin', 'Instructors'], ['panel', 'Panels']] as const).map(([role, label]) => <label key={role}><input type="checkbox" checked={(settings.announcement?.roles || ['admin', 'panel']).includes(role)} onChange={event => setSettings(current => ({ ...current, announcement: { ...current.announcement, roles: event.target.checked ? [...(current.announcement?.roles || []), role] : (current.announcement?.roles || []).filter(value => value !== role) } }))} />{label}</label>)}
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={subjectTargeting} onChange={event => { setSubjectTargeting(event.target.checked); if (!event.target.checked) setSettings(current => ({ ...current, announcement: { ...current.announcement, subjectIds: [] } })); }} />Limit announcement to selected subjects</label>
              {subjectTargeting && <div><label htmlFor="announcement-subjects" className="evl-label">Announcement subjects</label><select id="announcement-subjects" multiple size={4} className="evl-input" value={settings.announcement?.subjectIds || []} disabled={Boolean(subjectError)} onChange={event => setSettings(current => ({ ...current, announcement: { ...current.announcement, subjectIds: Array.from(event.target.selectedOptions, option => option.value) } }))}>{subjects.map(subject => <option key={subject._id} value={subject._id}>{subject.code} — {subject.title}</option>)}</select><p className="text-xs text-text/65 mt-1">Choose up to 100 subjects. Panels must currently be assigned to a matching block or group.</p></div>}
              {subjectError && <div><p role="alert" className="text-xs text-danger">{subjectError}</p><button type="button" className="evl-btn-secondary mt-2" onClick={() => setSubjectRevision(value => value + 1)}>Retry announcement subjects</button></div>}
            </fieldset>
            <fieldset className="sc-form-section space-y-3" disabled={saving}>
              <legend className="sc-legend"><span>03</span> Delivery schedule</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label htmlFor="announcement-start" className="evl-label">Announcement start (optional)</label><input id="announcement-start" type="datetime-local" className="evl-input" value={settings.announcement?.startsAt ? localDateTimeInput(settings.announcement.startsAt) : ''} onChange={event => setSettings(current => ({ ...current, announcement: { ...current.announcement, startsAt: event.target.value ? new Date(event.target.value).toISOString() : null } }))} /></div>
                <div><label htmlFor="announcement-end" className="evl-label">Announcement end (optional)</label><input id="announcement-end" type="datetime-local" className="evl-input" value={settings.announcement?.endsAt ? localDateTimeInput(settings.announcement.endsAt) : ''} onChange={event => setSettings(current => ({ ...current, announcement: { ...current.announcement, endsAt: event.target.value ? new Date(event.target.value).toISOString() : null } }))} /></div>
              </div>
              <p className="text-xs text-text/65">Times use {timezone}. Blank start means immediately; blank end means no expiry. Delivery refreshes approximately every 10 seconds.</p>
            </fieldset>
            </div>

            <aside className="sc-preview" aria-label="Announcement preview">
              <p className="sc-eyebrow">Draft preview</p>
              <h4>What your audience will see</h4>
              <p className="sc-preview-hint">Preview only. Nothing changes until you save.</p>
              <div className="sc-notice-preview">
                <div className="sc-preview-icon"><ControlIcon /></div>
                <h5>{settings.announcement?.title?.trim() || 'Your announcement title'}</h5>
                <p>{settings.announcement?.message?.trim() || 'Your message will appear here as you type.'}</p>
              </div>
              <dl className="sc-review-list">
                <div><dt>Audience</dt><dd>{audienceLabel}</dd></div>
                <div><dt>Subjects</dt><dd>{subjectTargeting ? `${settings.announcement?.subjectIds?.length || 0} selected subjects` : 'All assigned subjects'}</dd></div>
                <div><dt>Starts</dt><dd>{settings.announcement?.startsAt ? formatMaintenanceDate(settings.announcement.startsAt) : 'Immediately after saving'}</dd></div>
                <div><dt>Ends</dt><dd>{settings.announcement?.endsAt ? formatMaintenanceDate(settings.announcement.endsAt) : 'Until you hide or clear it'}</dd></div>
                <div><dt>On save</dt><dd>{settings.announcement?.isActive ? 'Enabled for the selected audience' : 'Saved as hidden'}</dd></div>
              </dl>
              {subjectTargeting && selectedSubjects.length > 0 && <div className="sc-subject-tags">{selectedSubjects.slice(0, 8).map(subject => <span key={subject._id} title={subject.title}>{subject.code}</span>)}{selectedSubjects.length > 8 && <span>+{selectedSubjects.length - 8} more</span>}</div>}
              <p className="sc-preview-note">Only matching instructors and currently assigned panels receive the notice. Delivery refreshes about every 10 seconds.</p>
            </aside>
          </div>

            <footer className="sc-action-bar">
              <p>{saving ? 'Saving changes…' : announcementChanged ? 'Unsaved changes · preview is not published' : 'All changes saved'}</p>
              <div className="flex flex-wrap gap-2">
              <button disabled={saving} onClick={clearAnnouncement} className="evl-btn-secondary">
                Clear
              </button>
              <button disabled={saving} onClick={saveAnnouncement} className="evl-btn-primary">
                Save Announcement
              </button>
              </div>
            </footer>
        </section>

        <section hidden={view !== 'maintenance'} aria-label="Maintenance controls" className="evl-card sc-panel">
          <div className="sc-panel-header">
            <div className="min-w-0">
              <h3>Plan a safe maintenance window</h3>
              <p>Set the timing and message before pausing access. Super Admin stays connected.</p>
            </div>
            <span className={hasMaintenanceStarted ? 'evl-badge-danger' : isMaintenanceScheduled ? 'evl-badge-primary' : 'evl-badge-success'}>
              {hasMaintenanceStarted ? 'Active' : isMaintenanceScheduled ? 'Scheduled' : 'System open'}
            </span>
          </div>

          <div className="sc-panel-grid">
            <div className="sc-form">
            {hasMaintenanceStarted && <p className="sc-running-notice">Maintenance is running. You can edit the message or restore access below. The saved start and end stay unchanged.</p>}

            {!hasMaintenanceStarted && (
              <div className="space-y-4">
                <div className="sc-section-heading"><span>01</span><div><h4>Choose the timing</h4><p>Schedule ahead or use a short start delay.</p></div></div>
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
                      onChange={event => { setScheduleEnd(event.target.value); setPresetDuration(undefined); setScheduleError(''); }}
                    className="evl-input" disabled={saving} />
                  <p className="text-xs text-text/60 mt-2">Set an end to automatically restore access. Leave blank to end maintenance manually.</p>
                  {presetDuration !== undefined && presetDuration !== null && <p className="text-xs text-primary mt-1">Preset duration: {presetDuration} minutes from the actual start when you confirm. Editing the end time switches to a fixed end.</p>}
                </div>
                <p className="text-xs text-text/65">Calendar times use your timezone: <strong>{timezone}</strong>.</p>
                {scheduleError && <p role="alert" className="text-sm text-danger">{scheduleError}</p>}
              </div>
            )}

            <div className="sc-form-section">
              <div className="sc-section-heading"><span>02</span><div><h4>Explain the downtime</h4><p>This message appears while access is paused.</p></div></div>
              <label htmlFor="maintenance-message" className="evl-label">Maintenance message</label>
              <textarea id="maintenance-message" value={settings.maintenanceMessage}
                onChange={event => setSettings(current => ({ ...current, maintenanceMessage: event.target.value }))}
                className="evl-input min-h-[100px] resize-y" maxLength={250} disabled={saving} />
              <p className="text-xs text-text/60 mt-2">{settings.maintenanceMessage.length}/250 characters</p>
            </div>
            <MaintenancePresets message={settings.maintenanceMessage} onLoad={loadPreset} disabled={saving} />
            </div>

            <aside className="sc-preview" aria-label="Maintenance impact preview">
              <p className="sc-eyebrow">Access & safety</p>
              <h4>Know what will change</h4>
              <div className={`sc-access-status ${hasMaintenanceStarted ? 'sc-access-paused' : ''}`} role="status">
                {hasMaintenanceStarted
                  ? 'Maintenance is active. Instructor, panel and student registration access is paused.'
                  : isMaintenanceScheduled
                    ? 'Maintenance begins in ' + remainingTime + '. Users can continue working until then.'
                    : 'System is open. Users can use EvalSys normally.'}
              </div>
              <ul className="sc-impact-list">{['Instructors', 'Panel judges', 'Student registration'].map(label => <li key={label}><span>{label}</span><strong className={hasMaintenanceStarted ? 'sc-text-danger' : ''}>{hasMaintenanceStarted ? 'Paused' : isMaintenanceScheduled ? 'Pauses at start' : 'Available'}</strong></li>)}<li><span>Super Admin</span><strong>Always available</strong></li></ul>
              {(hasMaintenanceStarted || isMaintenanceScheduled) && <dl className="sc-review-list">
                <div><dt>Starts</dt><dd>{status.start ? formatMaintenanceDate(status.start) : 'Immediately'}</dd></div>
                <div><dt>Ends</dt><dd>{status.end ? formatMaintenanceDate(status.end) + ' · Access resumes automatically' : 'Manual end · End maintenance when ready'}</dd></div>
              </dl>}
              {status.ended && status.end && <p className="text-xs text-success mt-4">The last maintenance window ended on {formatMaintenanceDate(status.end)}. Access has resumed.</p>}
              <div className="sc-maintenance-preview"><p className="sc-eyebrow">Message preview</p><p>{settings.maintenanceMessage.trim() || defaultSettings.maintenanceMessage}</p></div>
              <p className="sc-preview-note">Changes require confirmation. Loading or saving a preset never starts maintenance.</p>
            </aside>
          </div>

            <footer className="sc-action-bar">
              <p>{saving ? 'Saving changes…' : hasMaintenanceStarted ? 'Restore access when your work is complete.' : 'Review the window before confirming.'}</p>
              <div className="flex flex-wrap gap-2">
              {!hasMaintenanceStarted && <button disabled={saving} onClick={scheduleMaintenance} className={scheduleMode === 'quick' && maintenanceDelayMinutes === 0 ? 'evl-btn-danger' : 'evl-btn-primary'}>{isMaintenanceScheduled ? 'Update Schedule' : scheduleMode === 'quick' && maintenanceDelayMinutes === 0 ? 'Start Maintenance Now' : 'Schedule Maintenance'}</button>}
              {(hasMaintenanceStarted || isMaintenanceScheduled) && <>
                <button disabled={saving} onClick={stopMaintenance} className="evl-btn-secondary">{hasMaintenanceStarted ? 'End Maintenance' : 'Cancel Schedule'}</button>
                <button disabled={saving} onClick={saveMaintenanceMessage} className="evl-btn-secondary">Save Message</button>
              </>}
              </div>
            </footer>
        </section>

      </div>

    </div>
  );
}
