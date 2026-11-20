import { useEffect, useState, type FormEvent } from 'react';
import api from '../../services/api';
import { getApiMessage } from '../../utils/apiError';
import { downloadCsvText } from '../../utils/downloadCsv';
import { formatMemberList, type Member } from '../../utils/members';

interface ArchivedResult {
  _id: string; total?: number; legacyArchivedAt?: string; updatedAt?: string;
  legacySnapshot?: { subject?: string; block?: string; groupName?: string; panelName?: string; panelEmail?: string; instructorName?: string; members?: Member[] };
}
interface ResultPage {
  items: ArchivedResult[];
  pagination: { page: number; total: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean };
}
const blank = { subject: '', block: '', group: '', from: '', to: '' };

export default function ArchiveResultsPanel({ revision, totalArchived, onDelete, onDeleteAll }: {
  revision: number; totalArchived: number;
  onDelete: (id: string, name: string) => void; onDeleteAll: () => void;
}) {
  const [draft, setDraft] = useState(blank);
  const [request, setRequest] = useState({ filters: blank, page: 1, refresh: 0 });
  const [result, setResult] = useState<{ key: string; data?: ResultPage; error?: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [feedback, setFeedback] = useState('');
  const key = JSON.stringify([request, revision]);
  const loading = result?.key !== key;
  const data = loading ? undefined : result?.data;
  const error = loading ? undefined : result?.error;
  useEffect(() => {
    const controller = new AbortController();
    api.get<ResultPage>('/legacy-data/results', { params: { ...request.filters, page: request.page, limit: 25 }, signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) setResult({ key, data: response.data });
    }).catch((err: unknown) => { if (!controller.signal.aborted) setResult({ key, error: getApiMessage(err, 'Failed to load archived results') }); });
    return () => controller.abort();
  }, [request, key]);
  const apply = (event: FormEvent) => {
    event.preventDefault(); setExportError(''); setFeedback('');
    setRequest(previous => ({ filters: { ...draft }, page: 1, refresh: previous.refresh + 1 }));
  };
  const download = async () => {
    setExporting(true); setExportError(''); setFeedback('');
    try {
      const response = await api.get<string>('/legacy-data/results/export', { params: request.filters });
      downloadCsvText(`evalsys_archived_results_${new Date().toISOString().slice(0, 10)}.csv`, response.data);
      setFeedback('Archived results CSV downloaded for all pages matching the applied filters.');
    } catch (err: unknown) { setExportError(getApiMessage(err, 'Failed to export archived results')); }
    finally { setExporting(false); }
  };
  return <section className="evl-card overflow-hidden" aria-label="Archived result search">
    <form onSubmit={apply} className="p-5 border-b border-muted/30 space-y-3" aria-label="Archive filters">
      <fieldset disabled={exporting} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 min-w-0"><legend className="sr-only">Search archived result snapshots</legend>
        {(['subject', 'block', 'group'] as const).map(field => <div key={field}><label htmlFor={`archive-${field}`} className="evl-label">Archive {field}</label><input id={`archive-${field}`} className="evl-input" maxLength={120} value={draft[field]} onChange={event => setDraft(previous => ({ ...previous, [field]: event.target.value }))} /></div>)}
        <div><label htmlFor="archive-from" className="evl-label">Archived from (UTC)</label><input id="archive-from" className="evl-input" type="date" max={draft.to || '9999-12-31'} value={draft.from} onChange={event => setDraft(previous => ({ ...previous, from: event.target.value }))} /></div>
        <div><label htmlFor="archive-to" className="evl-label">Archived through (UTC)</label><input id="archive-to" className="evl-input" type="date" min={draft.from || undefined} max="9999-12-31" value={draft.to} onChange={event => setDraft(previous => ({ ...previous, to: event.target.value }))} /></div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="evl-btn-primary" disabled={exporting}>Search archive</button>
        <button type="button" className="evl-btn-secondary" disabled={exporting} onClick={() => { setDraft(blank); setExportError(''); setFeedback(''); setRequest(previous => ({ filters: blank, page: 1, refresh: previous.refresh + 1 })); }}>Reset archive filters</button>
        <button type="button" className="evl-btn-secondary" disabled={loading || exporting || Boolean(error)} onClick={download}>{exporting ? 'Exporting archive...' : 'Download Archived Results CSV'}</button>
      </div>
      <p className="text-xs text-text/65">Searches retained subject, block, and group names even after deletion. Dates include whole UTC days; missing archive dates use the last update. CSV uses applied filters across all pages, up to 10,000 records.</p>
      {exportError && <p role="alert" className="text-sm text-danger">{exportError}</p>}{feedback && <p role="status" className="text-sm text-success">{feedback}</p>}
    </form>
    {loading ? <p role="status" className="p-5 text-sm">Loading archived results...</p> : error ? <div className="p-5"><p role="alert" className="text-danger text-sm mb-3">{error}</p><button type="button" className="evl-btn-secondary" onClick={() => setRequest(previous => ({ ...previous, refresh: previous.refresh + 1 }))}>Retry archive search</button></div> : data && <>
      <div className="overflow-x-auto" role="region" aria-label="Archived results" tabIndex={0}>
        <table className="evl-table min-w-[850px]"><caption className="sr-only">Matching archived results, ordered by group A–Z</caption>
          <thead><tr>{['Group / subject', 'Block', 'Panel / instructor', 'Members', 'Score', 'Archived (UTC)', 'Actions'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{data.items.map(item => <tr key={item._id}>
            <td><p className="font-bold text-text">{item.legacySnapshot?.groupName || 'Deleted old group'}</p><p className="text-xs text-text/65">{item.legacySnapshot?.subject || 'Unknown subject'}</p></td>
            <td>{item.legacySnapshot?.block || 'Unknown block'}</td>
            <td><p>{item.legacySnapshot?.panelName || 'Deleted old panel'}</p><p className="text-xs text-text/65">{item.legacySnapshot?.panelEmail}</p><p className="text-xs text-primary/70">{item.legacySnapshot?.instructorName}</p></td>
            <td className="max-w-[260px] break-words">{formatMemberList((item.legacySnapshot?.members || []).filter(Boolean)) || 'No member snapshot'}</td>
            <td className="font-bold text-primary">{typeof item.total === 'number' ? item.total : 'Pending'}</td>
            <td className="text-xs">{item.legacyArchivedAt || item.updatedAt ? new Date((item.legacyArchivedAt || item.updatedAt)!).toISOString().replace('T', ' ').replace('Z', ' UTC') : 'Unknown date'}</td>
            <td><button type="button" className="evl-btn-danger" disabled={exporting} onClick={() => onDelete(item._id, `${item.legacySnapshot?.groupName || 'old group'} result`)}>Delete</button></td>
          </tr>)}{!data.items.length && <tr><td colSpan={7} className="text-center text-text/65 py-10">No archived results match the applied filters.</td></tr>}</tbody>
        </table>
      </div>
      <div className="p-5 border-t border-muted/30 flex flex-wrap justify-between gap-3 items-center">
        <p role="status" className="text-sm text-text/70">{data.pagination.total.toLocaleString()} matching results · Page {data.pagination.page} of {data.pagination.totalPages}</p>
        <div className="flex flex-wrap gap-2"><button type="button" className="evl-btn-secondary" disabled={!data.pagination.hasPreviousPage || exporting} onClick={() => setRequest(previous => ({ ...previous, page: data.pagination.page - 1 }))}>Previous archive page</button><button type="button" className="evl-btn-secondary" disabled={!data.pagination.hasNextPage || exporting} onClick={() => setRequest(previous => ({ ...previous, page: data.pagination.page + 1 }))}>Next archive page</button></div>
      </div>
    </>}
    {totalArchived > 0 && <div className="p-5 border-t border-danger/20"><p className="text-xs text-text/65 mb-3">Global deletion affects all {totalArchived.toLocaleString()} archived results, not just these filters. This does not affect current instructor results.</p><button type="button" className="evl-btn-danger" disabled={exporting || loading || Boolean(error)} onClick={onDeleteAll}>Delete All Archived Results</button></div>}
  </section>;
}
