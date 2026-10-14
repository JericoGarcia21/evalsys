import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';

export default function ProposalViewer() {
  const { groupId } = useParams();
  const [preview, setPreview] = useState<{ groupId: string; url?: string; error?: string } | null>(null);
  const current = preview?.groupId === groupId ? preview : null;
  const error = !groupId ? 'Proposal group is missing.' : current?.error;

  useEffect(() => {
    if (!groupId) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    api.get('/groups/' + groupId + '/proposal-url?format=pdf', {
      responseType: 'blob', signal: controller.signal,
    }).then((res) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      setPreview({ groupId, url: objectUrl });
    }).catch(async (err) => {
      if (controller.signal.aborted) return;
      let message = 'Unable to open proposal right now.';
      try {
        const data = err.response?.data;
        const body = data instanceof Blob ? JSON.parse(await data.text()) : data;
        message = body?.message || message;
      } catch { /* Keep the fallback for non-JSON errors. */ }
      if (!controller.signal.aborted) setPreview({ groupId, error: message });
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [groupId]);

  if (current?.url && !error) {
    return (
      <div className="h-screen bg-bg flex flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-text/10">
          <h1 className="text-lg font-black text-text">Proposal PDF Preview</h1>
          <div className="flex gap-3">
            <a href={current.url} target="_blank" rel="noreferrer" className="evl-btn-secondary">Open PDF</a>
            <Link to="/dashboard" className="evl-btn-secondary">Back to EvalSys</Link>
          </div>
        </header>
        <iframe src={current.url} title="Proposal PDF preview" className="w-full flex-1 border-0" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="evl-card w-full max-w-md p-8 text-center" role="status">
        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 font-black">
          {error ? '!' : 'PDF'}
        </div>
        <h1 className="text-xl font-black text-text mb-2">{error ? 'Proposal Unavailable' : 'Opening Proposal'}</h1>
        <p className="text-sm text-text/70 mb-6">{error || 'Preparing a PDF preview. Word and PowerPoint documents may take a moment...'}</p>
        {error && <Link to="/dashboard" className="evl-btn-secondary inline-flex justify-center">Back to EvalSys</Link>}
      </div>
    </div>
  );
}
