import { getApiMessage } from '../../utils/apiError';
import { useEffect, useState } from 'react';
import api from '../../services/api';
import { notify } from '../../utils/notify';

interface AuditLog {
  _id: string;
  action: string;
  status: string;
  createdAt: string;
  ip?: string;
  userAgent?: string;
  actor?: { name?: string; email?: string; role?: string };
  entity?: { type?: string; name?: string };
  metadata?: Record<string, unknown>;
}

interface SuspiciousRow {
  type: string;
  key: string;
  count: number;
  latestAt?: string;
  ip?: string;
  account?: string;
  reason?: string;
  samples?: AuditLog[];
}

interface SecurityResponse {
  windowHours: number;
  totals: {
    failedLogins: number;
    lockedAccounts: number;
    maintenanceAttempts: number;
    deniedAdminRoutes: number;
    invalidTokens: number;
    missingTokens?: number;
    suspicious: number;
  };
  suspicious: SuspiciousRow[];
  recentAccessEvents: AuditLog[];
  failedLoginDetails: AuditLog[];
  recentSecurityEvents: AuditLog[];
}

const formatDate = (value?: string) => value ? new Date(value).toLocaleString() : 'Unknown';

const formatAction = (action = '') => action
  .split('.')
  .map((part) => part.replace(/_/g, ' '))
  .join(' / ');

const securityLabel = (type: string) => {
  const labels: Record<string, string> = {
    many_failed_attempts_same_ip: 'Many failed attempts from same IP',
    many_failed_attempts_same_account: 'Many failed attempts against same account',
    maintenance_login_or_action_attempt: 'Attempt during maintenance mode',
    admin_route_denied: 'Admin route access denied',
    invalid_or_expired_token: 'Invalid or expired token usage',
  };
  return labels[type] || type.replace(/_/g, ' ');
};

const eventLabel = (action: string) => {
  const labels: Record<string, string> = {
    'account.password.reset': 'Password reset',
    'account.password.changed': 'Password changed',
    'account.status.update': 'Role/account status changed',
    'instructor.csv_export_lock.update': 'CSV lock changed',
    'settings.system_control_updated': 'Maintenance or announcement changed',
  };
  return labels[action] || action.replace(/\./g, ' / ');
};

export default function SecurityMonitor() {
  const [data, setData] = useState<SecurityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewItem, setReviewItem] = useState<SuspiciousRow | null>(null);

  const load = async () => {
    try {
      const res = await api.get('/operations/security');
      setData(res.data);
    } catch (err: unknown) {
      notify(getApiMessage(err, 'Failed to load security monitor'), { type: 'error' });
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

  if (loading) {
    return (
      <div>
        <h2 className="evl-page-title mb-6">Security Monitor</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-surface border border-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const totals = data?.totals;

  return (
    <div>
      <div className="mb-8">
        <h2 className="evl-page-title">Security Monitor</h2>
        <p className="evl-page-subtitle">
          Watch failed logins, blocked access, invalid tokens, and important security changes.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
        <SecurityMetric label="Failed Logins" value={totals?.failedLogins ?? 0} danger={Boolean(totals?.failedLogins)} />
        <SecurityMetric label="Locked" value={totals?.lockedAccounts ?? 0} danger={Boolean(totals?.lockedAccounts)} />
        <SecurityMetric label="Maintenance" value={totals?.maintenanceAttempts ?? 0} danger={Boolean(totals?.maintenanceAttempts)} />
        <SecurityMetric label="Denied Routes" value={totals?.deniedAdminRoutes ?? 0} danger={Boolean(totals?.deniedAdminRoutes)} />
        <SecurityMetric label="Invalid Tokens" value={totals?.invalidTokens ?? 0} danger={Boolean(totals?.invalidTokens)} />
        <SecurityMetric label="Suspicious" value={totals?.suspicious ?? 0} danger={Boolean(totals?.suspicious)} />
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)] gap-5">
        <section className="evl-card overflow-hidden">
          <div className="px-5 py-4 border-b border-muted/30">
            <h3 className="font-bold text-text text-sm">Suspicious Activity</h3>
            <p className="text-xs text-text/65 mt-0.5">Detected from the last {data?.windowHours || 24} hours.</p>
          </div>
          <div className="divide-y divide-muted/30 max-h-[560px] overflow-y-auto">
            {(data?.suspicious || []).map((item, index) => (
              <div key={`${item.type}-${item.key}-${index}`} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-text text-sm">{securityLabel(item.type)}</p>
                    <p className="text-xs text-text/70 mt-1 break-words">
                      {item.key} {item.count > 1 ? `(${item.count} events)` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReviewItem(item)}
                    className="evl-btn-danger !py-1.5 !px-3 !text-xs shrink-0"
                  >
                    Review
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                  <InfoBox label="IP" value={item.ip || 'Unknown'} />
                  <InfoBox label="Account" value={item.account || 'Unknown'} />
                  <InfoBox label="Latest" value={formatDate(item.latestAt)} />
                </div>
                <p className="text-xs text-text/70 mt-3">Reason: {item.reason || 'security rule matched'}</p>
              </div>
            ))}
            {!data?.suspicious?.length && (
              <p className="p-5 text-sm text-text/70">No suspicious activity detected in the current window.</p>
            )}
          </div>
        </section>

        <section className="evl-card overflow-hidden">
          <div className="px-5 py-4 border-b border-muted/30">
            <h3 className="font-bold text-text text-sm">Recent Security Events</h3>
            <p className="text-xs text-text/65 mt-0.5">Password, account, CSV lock, and maintenance changes.</p>
          </div>
          <div className="divide-y divide-muted/30 max-h-[560px] overflow-y-auto">
            {(data?.recentSecurityEvents || []).map((event) => (
              <div key={event._id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-black text-text text-sm">{eventLabel(event.action)}</p>
                  <span className={event.status === 'failed' ? 'evl-badge-danger' : 'evl-badge-success'}>
                    {event.status}
                  </span>
                </div>
                <p className="text-xs text-text/70 mt-1">
                  {event.actor?.name || event.actor?.email || 'System'} - {formatDate(event.createdAt)}
                </p>
                <p className="text-xs text-text/60 mt-1 break-words">
                  Target: {event.entity?.name || event.entity?.type || 'System setting'}
                </p>
              </div>
            ))}
            {!data?.recentSecurityEvents?.length && (
              <p className="p-5 text-sm text-text/70">No recent security events found.</p>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-6">
        <SecurityLogPanel title="Recent Access Events" logs={data?.recentAccessEvents || []} />
        <SecurityLogPanel title="Failed Login Details" logs={data?.failedLoginDetails || []} showFailureMeta />
      </div>

      {reviewItem && (
        <SecurityReviewModal item={reviewItem} onClose={() => setReviewItem(null)} />
      )}
    </div>
  );
}

function SecurityMetric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="evl-card p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-text/60">{label}</p>
      <p className={`text-2xl font-black mt-1 ${danger ? 'text-danger' : 'text-text'}`}>{value}</p>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-muted/40 bg-bg/60 px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-text/55">{label}</p>
      <p className="text-xs font-bold text-text/80 mt-0.5 break-words">{value}</p>
    </div>
  );
}

function SecurityLogPanel({
  title,
  logs,
  showFailureMeta = false,
}: {
  title: string;
  logs: AuditLog[];
  showFailureMeta?: boolean;
}) {
  return (
    <section className="evl-card overflow-hidden">
      <div className="px-5 py-4 border-b border-muted/30">
        <h3 className="font-bold text-text text-sm">{title}</h3>
      </div>
      <div className="divide-y divide-muted/30 max-h-[460px] overflow-y-auto">
        {logs.map((log) => (
          <div key={log._id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-text capitalize">{formatAction(log.action)}</p>
                <p className="text-xs text-text/70 mt-1 break-words">
                  {log.actor?.name || log.actor?.email || 'Unknown'} - {formatDate(log.createdAt)}
                </p>
              </div>
              <span className={log.status === 'failed' ? 'evl-badge-danger' : 'evl-badge-success'}>
                {log.status}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              <InfoBox label="IP" value={log.ip || 'Unknown'} />
              <InfoBox label="Browser" value={log.userAgent || 'Unknown'} />
            </div>
            {showFailureMeta && (
              <p className="text-xs text-text/70 mt-3">
                Reason: {String(log.metadata?.reason || 'unknown')}
                {log.metadata?.failedLoginAttempts ? ` - Attempts: ${String(log.metadata.failedLoginAttempts)}` : ''}
                {log.metadata?.lockUntil ? ` - Locked until ${formatDate(String(log.metadata.lockUntil))}` : ''}
              </p>
            )}
          </div>
        ))}
        {!logs.length && <p className="p-5 text-sm text-text/70">No security log entries found.</p>}
      </div>
    </section>
  );
}

function SecurityReviewModal({ item, onClose }: { item: SuspiciousRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-muted/40 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-muted/30 px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-danger">Security Review</p>
            <h3 className="mt-1 text-xl font-black text-text">{securityLabel(item.type)}</h3>
            <p className="mt-1 text-sm text-text/65">{item.key}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xl font-bold text-text/55 hover:bg-bg hover:text-text"
            aria-label="Close security review"
          >
            x
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <InfoBox label="Events" value={String(item.count)} />
            <InfoBox label="IP" value={item.ip || 'Unknown'} />
            <InfoBox label="Account" value={item.account || 'Unknown'} />
            <InfoBox label="Latest" value={formatDate(item.latestAt)} />
          </div>

          <div className="mt-4 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3">
            <p className="text-sm font-bold text-danger">Reason: {item.reason || 'security rule matched'}</p>
            <p className="mt-1 text-xs text-text/70">
              Review the sample events below. If this looks suspicious, block or reset the affected account and check recent access attempts.
            </p>
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border border-muted/40">
            <div className="border-b border-muted/30 bg-bg px-4 py-3">
              <h4 className="text-sm font-black text-text">Sample Events</h4>
            </div>
            <div className="divide-y divide-muted/30">
              {(item.samples || []).map((log) => (
                <div key={log._id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-text capitalize">{formatAction(log.action)}</p>
                      <p className="mt-1 text-xs text-text/70">
                        {log.actor?.name || log.actor?.email || 'Unknown'} - {formatDate(log.createdAt)}
                      </p>
                    </div>
                    <span className={log.status === 'failed' ? 'evl-badge-danger' : 'evl-badge-success'}>
                      {log.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <InfoBox label="IP" value={log.ip || 'Unknown'} />
                    <InfoBox label="Browser" value={log.userAgent || 'Unknown'} />
                  </div>
                  <p className="mt-3 text-xs text-text/70">
                    Path: {String(log.metadata?.path || 'Not recorded')}
                    {log.metadata?.reason ? ` - Reason: ${String(log.metadata.reason)}` : ''}
                  </p>
                </div>
              ))}
              {!item.samples?.length && (
                <p className="p-4 text-sm text-text/70">No sample events available.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-muted/30 bg-bg px-5 py-4">
          <button type="button" onClick={onClose} className="evl-btn-secondary !py-2 !text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
