import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { getApiMessage } from '../../utils/apiError';
import { formatMemberList } from '../../utils/members';

interface Criterion { key: string; label: string; maxScore: number; section?: string; description?: string }
interface ArchivedGroup {
  _id: string; semester: string; archivedAt: string;
  snapshot: {
    subject: { code: string; title: string }; group: { name: string; members: Parameters<typeof formatMemberList>[0] };
    block: string; status: string; finalTotal: number | null; missingPanels: string[];
    evaluations: { panel: { name: string }; scores: Record<string, number>; total: number; comments: string; isSubmitted: boolean; rubric?: { title: string; criteria: Criterion[] } }[];
    activeRubric?: { title: string; criteria: Criterion[] };
  };
}
interface ArchivePage { items: ArchivedGroup[]; pagination: { total: number; page: number; hasNextPage: boolean; hasPreviousPage: boolean } }

export default function MyArchive() {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<ArchivePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestPage = (nextPage: number) => {
    setLoading(true);
    setError('');
    setPage(nextPage);
    setRevision(value => value + 1);
  };
  useEffect(() => {
    const controller = new AbortController();
    api.get('/evaluations/my-archive', { params: { page, limit: 20 }, signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setData(response.data); })
      .catch(err => { if (!controller.signal.aborted) setError(getApiMessage(err, 'Unable to load your archive.')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, revision]);
  return <div className="min-w-0">
    <header className="mb-6 flex flex-wrap justify-between gap-4">
      <div><h2 className="evl-page-title">My Archive</h2><p className="evl-page-subtitle">Read-only semester snapshots from your subjects. Later rubric or account changes do not alter these records.</p></div>
      <Link to="/subjects" className="evl-btn-secondary">Manage subjects</Link>
    </header>
    {loading ? <p role="status">Loading archived semesters...</p> : error ? <div role="alert" className="evl-card p-5"><p className="text-danger mb-3">{error}</p><button className="evl-btn-secondary" onClick={() => requestPage(page)}>Try again</button></div> : !data?.items.length ? <div className="evl-card p-8"><h3 className="font-bold mb-2">No archived semesters yet</h3><p className="text-sm text-text/70">Choose Archive Semester on the Subjects page when your current evaluation cycle is finished.</p></div> : <>
      <p className="text-sm text-text/70 mb-4" role="status">{data.pagination.total} archived groups · Page {data.pagination.page}</p>
      <div className="space-y-4">{data.items.map(item => <article className="evl-card p-5 min-w-0 break-words" key={item._id}>
        <div className="flex flex-wrap justify-between gap-3 mb-3"><div><p className="text-xs text-primary font-semibold">{item.semester}</p><h3 className="font-bold text-lg">{item.snapshot.group.name}</h3><p className="text-sm text-text/70">{item.snapshot.subject.code} – {item.snapshot.subject.title} · {item.snapshot.block}</p></div><div><span className={item.snapshot.status === 'Complete' ? 'evl-badge-success' : 'evl-badge-warning'}>{item.snapshot.status}</span><p className="text-xs text-text/60 mt-2">Archived {new Date(item.archivedAt).toLocaleDateString()}</p></div></div>
        <p className="text-sm font-semibold">Final score: {item.snapshot.finalTotal ?? 'Pending complete evaluation'}</p>
        {item.snapshot.missingPanels.length > 0 && <p className="text-xs text-text/70 mt-1">Missing at archive time: {item.snapshot.missingPanels.join(', ')}</p>}
        <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-primary">View members and score breakdown</summary>
          <p className="text-sm mt-3">Members: {formatMemberList(item.snapshot.group.members) || 'No members recorded'}</p>
          {!item.snapshot.evaluations.length && <p className="text-sm mt-3 text-text/70">No evaluations were submitted.</p>}
          {item.snapshot.evaluations.map((evaluation, index) => <div key={index} className="border-t border-muted/30 mt-4 pt-4">
            <h4 className="font-bold text-sm">{evaluation.panel.name} · {evaluation.total} points{!evaluation.isSubmitted ? ' · Draft' : ''}</h4>
            <p className="text-xs text-text/65 mt-1">{evaluation.rubric?.title || 'Historical rubric unavailable'}</p>
            <dl className="grid gap-2 mt-3">{Object.entries(evaluation.scores).map(([key, score]) => {
              const criterion = evaluation.rubric?.criteria.find(criterion => criterion.key === key);
              return <div key={key} className="flex justify-between gap-4 text-sm"><dt>{criterion?.section ? `${criterion.section} · ` : ''}{criterion?.label || key}</dt><dd className="shrink-0 font-semibold">{score}{criterion ? ` / ${criterion.maxScore}` : ''}</dd></div>;
            })}</dl>
            {evaluation.comments && <p className="text-sm text-text/70 mt-3 whitespace-pre-wrap">Feedback: {evaluation.comments}</p>}
          </div>)}
        </details>
      </article>)}</div>
      <nav aria-label="Archive pages" className="flex gap-3 mt-5"><button className="evl-btn-secondary" disabled={!data.pagination.hasPreviousPage} onClick={() => requestPage(page - 1)}>Previous</button><button className="evl-btn-secondary" disabled={!data.pagination.hasNextPage} onClick={() => requestPage(page + 1)}>Next</button></nav>
    </>}
  </div>;
}
