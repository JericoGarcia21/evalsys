import { getApiMessage } from '../../utils/apiError';
import { useEffect, useState } from 'react';
import api from '../../services/api';
import { notify } from '../../utils/notify';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { waitForJob } from '../../services/backgroundJobs';

interface AuditLog {
  _id: string;
  action: string;
  status: string;
  createdAt: string;
  actor?: { name?: string; email?: string; role?: string };
  entity?: { type?: string; name?: string };
  metadata?: { reason?: string; failedLoginAttempts?: number; lockUntil?: string };
}

interface ActivityStatus {
  latestLogins: AuditLog[];
  failedLogins: AuditLog[];
  recentActions: AuditLog[];
  latestSubmissions: Array<{
    _id: string;
    updatedAt: string;
    group?: { name?: string };
    panel?: { name?: string; email?: string };
    total?: number;
  }>;
}

interface InstructorSummary {
  _id: string;
  name: string;
  email: string;
  isActive: boolean;
  subjectLimit: number;
  subjectsUsed: number;
  groups: number;
  panels: number;
  evaluationsCompleted: number;
  csvExportLocked: boolean;
  gradingLockedSubjects: string[];
  proposalStorageMb: number;
}

interface ProposalCleanup {
  totalFiles: number;
  linkedFiles: number;
  orphanFiles: number;
  orphans: Array<{ path: string; size: number; updatedAt?: string; mimeType?: string }>;
}

const backupTypes = ['users', 'subjects', 'groups', 'results', 'archive', 'rubrics', 'registrationLinks'];

const formatDate = (value?: string) => value ? new Date(value).toLocaleString() : 'Unknown';

const downloadJson = (filename: string, data: unknown) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export default function Operations() {
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityStatus | null>(null);
  const [summary, setSummary] = useState<InstructorSummary[]>([]);
  const [cleanup, setCleanup] = useState<ProposalCleanup | null>(null);
  const [backupAction, setBackupAction] = useState('');
  const [cleanupAction, setCleanupAction] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const load = async () => {
    try {
      const [activityRes, summaryRes, cleanupRes] = await Promise.all([
        api.get('/operations/activity'),
        api.get('/operations/instructor-summary'),
        api.get('/operations/proposal-orphans'),
      ]);
      setActivity(activityRes.data);
      setSummary(summaryRes.data);
      setCleanup(cleanupRes.data);
    } catch (err: unknown) {
      notify(getApiMessage(err, 'Failed to load operations data'), { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // This loader updates state only after awaited API responses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const timer = window.setInterval(() => load(), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const handleBackup = async (type: string) => {
    setBackupAction(type);
    try {
      const queued = await api.get(`/operations/backup/${type}`, {
        params: { background: 'true' },
      });
      const result = await waitForJob<unknown>(queued.data.job.id);
      downloadJson(`evalsys_${type}_backup.json`, result);
      notify(`${type} backup downloaded`, { type: 'success' });
    } catch (err: unknown) {
      notify(getApiMessage(err, 'Backup export failed'), { type: 'error' });
    } finally {
      setBackupAction('');
    }
  };

  const handleCleanupOrphans = async () => {
    const orphanCount = cleanup?.orphanFiles || 0;
    if (!orphanCount) return;
    const ok = await confirm({
      title: 'Clean Orphan Proposal Files?',
      message: `This will permanently remove ${orphanCount} Supabase proposal file${orphanCount === 1 ? '' : 's'} that are not linked to any group.\n\nLinked proposal files will not be touched.`,
      confirmLabel: 'Clean Files',
      danger: true,
    });
    if (!ok) return;

    setCleanupAction(true);
    try {
      const res = await api.delete('/operations/proposal-orphans');
      notify(res.data.message || 'Proposal cleanup complete', { type: 'success' });
      await load();
    } catch (err: unknown) {
      notify(getApiMessage(err, 'Failed to clean orphan proposal files'), { type: 'error' });
    } finally {
      setCleanupAction(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h2 className="evl-page-title mb-6">Operations</h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-surface border border-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <ConfirmDialog />
      <div className="mb-8">
        <div>
          <h2 className="evl-page-title">Operations</h2>
          <p className="evl-page-subtitle">Monitor system activity, instructor usage, proposal storage, and backups.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)] gap-5 mb-6">
        <ActivityMonitor activity={activity} />

        <div className="space-y-5">
          <ProposalCleanupPanel
            cleanup={cleanup}
            cleanupAction={cleanupAction}
            onCleanup={handleCleanupOrphans}
          />
          <BackupCenterPanel backupAction={backupAction} onBackup={handleBackup} />
        </div>
      </div>

      <div className="evl-card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-muted/30">
          <h3 className="font-bold text-text text-sm">Per-Instructor Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="evl-table min-w-[860px]">
            <thead>
              <tr>
                <th>Instructor</th>
                <th>Subjects</th>
                <th>Groups</th>
                <th>Panels</th>
                <th>Evaluations</th>
                <th>CSV</th>
                <th>Locked Subjects</th>
                <th>Proposal MB</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row._id}>
                  <td>
                    <p className="font-bold text-text text-sm">{row.name}</p>
                    <p className="text-xs text-text/65">{row.email}</p>
                  </td>
                  <td className="font-bold text-text/80">{row.subjectsUsed}/{row.subjectLimit}</td>
                  <td>{row.groups}</td>
                  <td>{row.panels}</td>
                  <td>{row.evaluationsCompleted}</td>
                  <td>
                    <span className={row.csvExportLocked ? 'evl-badge-danger' : 'evl-badge-success'}>
                      {row.csvExportLocked ? 'Locked' : 'Allowed'}
                    </span>
                  </td>
                  <td>{row.gradingLockedSubjects?.length || 0}</td>
                  <td>{row.proposalStorageMb}</td>
                </tr>
              ))}
              {!summary.length && (
                <tr><td colSpan={8} className="text-center text-text/70 py-10">No instructors found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-6">
        <div className="evl-card overflow-hidden">
          <div className="px-5 py-4 border-b border-muted/30">
            <h3 className="font-bold text-text text-sm">Latest Panel Submissions</h3>
          </div>
          <div className="divide-y divide-muted/30 max-h-[420px] overflow-y-auto">
            {(activity?.latestSubmissions || []).map((item) => (
              <div key={item._id} className="p-4">
                <p className="text-sm font-bold text-text">{item.group?.name || 'Deleted group'}</p>
                <p className="text-xs text-text/70 mt-1">
                  {item.panel?.name || 'Panel'} submitted {item.total ?? 0} pts · {formatDate(item.updatedAt)}
                </p>
              </div>
            ))}
            {!activity?.latestSubmissions?.length && (
              <p className="p-5 text-sm text-text/70">No submissions yet.</p>
            )}
          </div>
        </div>
      </div>

      {cleanup?.orphans?.length ? (
        <div className="evl-card overflow-hidden mt-6">
          <div className="px-5 py-4 border-b border-muted/30">
            <h3 className="font-bold text-text text-sm">Orphan Proposal Files</h3>
          </div>
          <div className="overflow-auto max-h-[420px]">
          <table className="evl-table min-w-[720px]">
            <thead>
              <tr>
                <th>Path</th>
                <th>Size</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {cleanup.orphans.map((file) => (
                <tr key={file.path}>
                  <td className="text-xs text-text/70 max-w-[520px] truncate">{file.path}</td>
                  <td>{Math.round((file.size / 1024 / 1024) * 100) / 100} MB</td>
                  <td>{formatDate(file.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActivityMonitor({ activity }: { activity: ActivityStatus | null }) {
  const latestLogin = activity?.latestLogins?.[0];
  const latestSubmission = activity?.latestSubmissions?.[0];
  const latestFailed = activity?.failedLogins?.[0];

  return (
    <div className="evl-card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-bold text-text text-sm">Activity Monitor</h3>
          <p className="text-xs text-text/65 mt-0.5">Recent login and grading activity.</p>
        </div>
        <span className={activity?.failedLogins?.length ? 'evl-badge-warning' : 'evl-badge-success'}>
          Live
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Metric label="Logins" value={activity?.latestLogins.length ?? 0} />
        <Metric label="Submits" value={activity?.latestSubmissions.length ?? 0} />
        <Metric label="Failed" value={activity?.failedLogins.length ?? 0} danger={Boolean(activity?.failedLogins.length)} />
      </div>

      <div className="space-y-3">
        <ActivityLine
          label="Latest login"
          title={latestLogin?.actor?.name || latestLogin?.actor?.email || 'No login yet'}
          detail={latestLogin ? `${latestLogin.actor?.role || 'account'} · ${formatDate(latestLogin.createdAt)}` : 'No successful login recorded.'}
        />
        <ActivityLine
          label="Latest submission"
          title={latestSubmission?.group?.name || 'No submission yet'}
          detail={latestSubmission ? `${latestSubmission.panel?.name || 'Panel'} · ${latestSubmission.total ?? 0} pts · ${formatDate(latestSubmission.updatedAt)}` : 'No panel submission recorded.'}
        />
        <ActivityLine
          label="Latest failed login"
          title={latestFailed?.actor?.email || latestFailed?.actor?.name || 'No failed login'}
          detail={latestFailed ? `${latestFailed.metadata?.reason || 'failed'} · ${formatDate(latestFailed.createdAt)}` : 'No failed login recorded.'}
          danger={Boolean(latestFailed)}
        />
      </div>
    </div>
  );
}

function ProposalCleanupPanel({
  cleanup,
  cleanupAction,
  onCleanup,
}: {
  cleanup: ProposalCleanup | null;
  cleanupAction: boolean;
  onCleanup: () => void;
}) {
  const orphanCount = cleanup?.orphanFiles ?? 0;

  return (
    <div className="evl-card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-bold text-text text-sm">Proposal Cleanup</h3>
          <p className="text-xs text-text/65 mt-0.5">Find uploaded files that are no longer linked to a group.</p>
        </div>
        <span className={orphanCount ? 'evl-badge-warning' : 'evl-badge-success'}>
          {orphanCount ? `${orphanCount} orphan` : 'Clean'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Metric label="Files" value={cleanup?.totalFiles ?? 0} />
        <Metric label="Linked" value={cleanup?.linkedFiles ?? 0} />
        <Metric label="Orphan" value={orphanCount} danger={Boolean(orphanCount)} />
      </div>

      <div className="mt-4 rounded-lg border border-muted/40 bg-bg/60 px-3 py-3">
        <p className="text-xs text-text/75 leading-relaxed">
          Linked proposal files are still used by groups and will stay untouched. Cleanup only removes files that have no group record.
        </p>
      </div>

      <button
        type="button"
        onClick={onCleanup}
        disabled={!orphanCount || cleanupAction}
        className="evl-btn-danger !py-2.5 !px-3 !text-xs mt-4 w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {cleanupAction ? 'Cleaning...' : orphanCount ? 'Clean Orphan Files' : 'No Orphan Files to Clean'}
      </button>
    </div>
  );
}

function BackupCenterPanel({
  backupAction,
  onBackup,
}: {
  backupAction: string;
  onBackup: (type: string) => void;
}) {
  return (
    <div className="evl-card p-5">
      <div className="mb-4">
        <h3 className="font-bold text-text text-sm">Backup Center</h3>
        <p className="text-xs text-text/65 mt-0.5">Download system data as JSON backups.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-2 gap-2">
        {backupTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onBackup(type)}
            disabled={Boolean(backupAction)}
            className="evl-btn-secondary !py-2.5 !px-3 !text-xs capitalize"
          >
            {backupAction === type ? 'Exporting...' : type}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActivityLine({
  label,
  title,
  detail,
  danger = false,
}: {
  label: string;
  title: string;
  detail: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-muted/40 bg-bg/60 px-3 py-2.5">
      <p className="text-[10px] font-black uppercase tracking-widest text-text/60">{label}</p>
      <p className={`text-sm font-black mt-0.5 truncate ${danger ? 'text-danger' : 'text-text'}`}>{title}</p>
      <p className="text-xs text-text/70 mt-0.5 truncate">{detail}</p>
    </div>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-text/60">{label}</p>
      <p className={`text-2xl font-black ${danger ? 'text-danger' : 'text-text'}`}>{value}</p>
    </div>
  );
}

