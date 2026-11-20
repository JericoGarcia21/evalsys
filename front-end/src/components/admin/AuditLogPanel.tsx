import { useEffect, useState, type FormEvent } from 'react';
import api from '../../services/api';
import { getApiMessage } from '../../utils/apiError';

interface AuditLog {
  _id: string;
  createdAt: string;
  action: string;
  status: 'success' | 'failed';
  actor?: { name?: string; email?: string; role?: string };
  entity?: { name?: string; type?: string };
  instructor?: { name?: string } | null;
  subject?: { code?: string; title?: string } | null;
}

interface AuditResult {
  items: AuditLog[];
  pagination: { page: number; total: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean };
}

const emptyFilters = { actor: '', action: '', status: '', from: '', to: '' };
type Filters = typeof emptyFilters;
const inputClass = 'evl-input w-full';

export default function AuditLogPanel() {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [request, setRequest] = useState({ filters: emptyFilters, page: 1, revision: 0 });
  const [result, setResult] = useState<{ key: string; data?: AuditResult; error?: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [exportError, setExportError] = useState('');
  const key = JSON.stringify(request);
  const loading = result?.key !== key;
  const data = loading ? undefined : result?.data;
  const error = loading ? undefined : result?.error;

  useEffect(() => {
    const controller = new AbortController();
    api.get<AuditResult>('/operations/audit-logs', {
      params: { ...request.filters, page: request.page, limit: 25 },
      headers: { 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    }).then(response => {
      if (!controller.signal.aborted) setResult({ key, data: response.data });
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setResult({ key, error: getApiMessage(err, 'Failed to load audit logs') });
    });
    return () => controller.abort();
  }, [request, key]);

  const update = (field: keyof Filters, value: string) => setDraft(previous => ({ ...previous, [field]: value }));
  const apply = (event: FormEvent) => {
    event.preventDefault();
    setExportMessage('');
    setExportError('');
    setRequest(previous => ({ filters: { ...draft, actor: draft.actor.trim(), action: draft.action.trim() }, page: 1, revision: previous.revision + 1 }));
  };
  const reset = () => {
    setDraft(emptyFilters);
    setExportMessage('');
    setExportError('');
    setRequest(previous => ({ filters: emptyFilters, page: 1, revision: previous.revision + 1 }));
  };
  const download = async () => {
    setExporting(true);
    setExportMessage('');
    setExportError('');
    try {
      const response = await api.get<string>('/operations/audit-logs/export', { params: request.filters });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `evalsys_audit_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setExportMessage('CSV downloaded for the applied filters. New events may change the exported count.');
    } catch (err: unknown) {
      setExportError(getApiMessage(err, 'Audit CSV export failed. Try again.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <section aria-labelledby="audit-heading" className="evl-card overflow-hidden">
      <div className="p-5 border-b border-muted/30">
        <h3 id="audit-heading" className="font-bold text-text">Audit log</h3>
        <p className="text-sm text-text/70 mt-2">Search platform activity. Dates and timestamps use UTC; both selected dates include the full day.</p>
        <form onSubmit={apply} className="mt-4 space-y-4" aria-label="Audit log filters">
          <fieldset disabled={exporting} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 min-w-0">
            <legend className="sr-only">Filter audit records</legend>
            <label className="text-xs font-bold text-text/80 space-y-1">Actor name or email
              <input className={inputClass} value={draft.actor} onChange={event => update('actor', event.target.value)} maxLength={120} placeholder="Name or email" />
            </label>
            <label className="text-xs font-bold text-text/80 space-y-1">Action (exact)
              <input className={inputClass} value={draft.action} onChange={event => update('action', event.target.value)} maxLength={120} placeholder="e.g. login.success" list="audit-action-examples" />
              <datalist id="audit-action-examples">{['login.success', 'login.failed', 'account.status.update', 'account.password.reset', 'instructor.grading_lock.update', 'instructor.csv_export_lock.update', 'instructor.subject_limit.update', 'audit.export'].map(action => <option key={action} value={action} />)}</datalist>
            </label>
            <div className="text-xs font-bold text-text/80 space-y-1">
              <label htmlFor="audit-status">Status</label>
              <select id="audit-status" className={inputClass} value={draft.status} onChange={event => update('status', event.target.value)}><option value="">All statuses</option><option value="success">Success</option><option value="failed">Failed</option></select>
            </div>
            <label className="text-xs font-bold text-text/80 space-y-1">From date (UTC)
              <input type="date" className={inputClass} value={draft.from} max={draft.to || '9999-12-31'} onChange={event => update('from', event.target.value)} />
            </label>
            <label className="text-xs font-bold text-text/80 space-y-1">To date (UTC)
              <input type="date" className={inputClass} value={draft.to} min={draft.from || undefined} max="9999-12-31" onChange={event => update('to', event.target.value)} />
            </label>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="evl-btn-primary" disabled={exporting}>Apply filters</button>
            <button type="button" className="evl-btn-secondary" onClick={reset} disabled={exporting}>Reset filters</button>
            <button type="button" className="evl-btn-secondary" onClick={() => setRequest(previous => ({ ...previous, revision: previous.revision + 1 }))} disabled={loading || exporting}>Refresh audit log</button>
            <button type="button" className="evl-btn-secondary" onClick={download} disabled={loading || Boolean(error) || exporting}>{exporting ? 'Exporting...' : 'Export filtered CSV'}</button>
          </div>
        </form>
        <p className="text-xs text-text/65 mt-3">Export uses applied filters across all pages, up to 10,000 records. Narrow the filters for larger results. Logs are best-effort, not a guaranteed compliance record.</p>
        {exportMessage && <p role="status" className="text-sm text-success mt-3">{exportMessage}</p>}
        {exportError && <p role="alert" className="text-sm text-danger mt-3">{exportError}</p>}
      </div>
      {loading ? <p role="status" className="p-5 text-sm text-text/70">Loading audit logs...</p> : error ? (
        <div className="p-5"><p role="alert" className="text-sm text-danger mb-3">{error}</p><button type="button" className="evl-btn-secondary" onClick={() => setRequest(previous => ({ ...previous, revision: previous.revision + 1 }))}>Retry audit log</button></div>
      ) : data && (
        <>
          <div className="overflow-x-auto" role="region" aria-label="Audit records" tabIndex={0}>
            <table className="evl-table min-w-[900px]">
              <caption className="sr-only">Audit records matching applied filters, newest first</caption>
              <thead><tr>{['Timestamp (UTC)', 'Actor', 'Action', 'Status', 'Entity', 'Workspace'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
              <tbody>
                {data.items.map(log => (
                  <tr key={log._id}>
                    <td className="whitespace-nowrap text-xs"><time dateTime={log.createdAt}>{new Date(log.createdAt).toISOString().replace('T', ' ').replace('Z', ' UTC')}</time></td>
                    <td className="max-w-[240px] break-words"><p className="font-bold">{log.actor?.name || 'Unknown actor'}</p><p className="text-xs text-text/70">{log.actor?.email}</p><p className="text-xs text-text/65">{log.actor?.role}</p></td>
                    <td className="text-xs break-all">{log.action}</td>
                    <td><span className={log.status === 'success' ? 'evl-badge-success' : 'evl-badge-danger'}>{log.status === 'success' ? 'Success' : 'Failed'}</span></td>
                    <td className="max-w-[240px] break-words">{log.entity?.name || log.entity?.type || '—'}</td>
                    <td className="text-xs"><p>{log.instructor?.name || '—'}</p><p>{log.subject?.code} {log.subject?.title}</p></td>
                  </tr>
                ))}
                {!data.items.length && <tr><td colSpan={6} className="text-center py-10 text-text/70">No audit records match the applied filters.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="p-5 border-t border-muted/30 flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm text-text/70">{data.pagination.total.toLocaleString()} records · Page {data.pagination.page} of {data.pagination.totalPages}</p>
            <div className="flex gap-2">
              <button type="button" className="evl-btn-secondary" disabled={!data.pagination.hasPreviousPage || exporting} onClick={() => setRequest(previous => ({ ...previous, page: previous.page - 1 }))}>Previous page</button>
              <button type="button" className="evl-btn-secondary" disabled={!data.pagination.hasNextPage || exporting} onClick={() => setRequest(previous => ({ ...previous, page: previous.page + 1 }))}>Next page</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
