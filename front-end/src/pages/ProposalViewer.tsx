import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/useAuth';

type Preview = {
  groupId: string;
  name?: string;
  context?: string;
  kind?: 'pdf' | 'word' | 'legacy-word' | 'unsupported';
  url?: string;
  html?: string;
  text?: string;
  error?: string;
};

export default function ProposalViewer() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const returnPath = user?.role === 'panel' && groupId ? '/grade?groupId=' + groupId : '/groups';
  const returnLabel = user?.role === 'panel' ? 'Back to grading' : 'Back to groups';
  const [preview, setPreview] = useState<Preview | null>(null);
  const current = preview?.groupId === groupId ? preview : null;
  const error = !groupId ? 'Proposal group is missing.' : current?.error;

  useEffect(() => {
    if (!groupId) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    const load = async () => {
      try {
        const metadata = await api.get('/groups/' + groupId + '/proposal-url', { signal: controller.signal });
        const name: string = metadata.data.originalName || 'proposal';
        const subject = metadata.data.subject;
        const documentContext = [metadata.data.groupName, [subject?.code, subject?.title].filter(Boolean).join(' - '), metadata.data.block ? 'Block: ' + metadata.data.block : ''].filter(Boolean).join(' · ');
        const extension = name.split('.').pop()?.toLowerCase();
        if (!['pdf', 'docx', 'doc'].includes(extension || '')) {
          if (!controller.signal.aborted) setPreview({ groupId, name, context: documentContext, kind: 'unsupported', url: metadata.data.url });
          return;
        }
        const response = await api.get('/groups/' + groupId + '/proposal-url?format=content', {
          responseType: 'blob', signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const blob: Blob = response.data;
        if (extension === 'docx') {
          const { renderAsync } = await import('docx-preview');
          const container = document.createElement('div');
          await renderAsync(await blob.arrayBuffer(), container, undefined, {
            useBase64URL: true, renderAltChunks: false,
          });
          // Disable navigation from document hyperlinks.
          container.querySelectorAll('a').forEach(anchor => anchor.removeAttribute('href'));
          const html = '<!doctype html><html><head><meta charset="utf-8">' +
            '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data:; font-src data:; style-src &#39;unsafe-inline&#39;">' +
            '<style>body{margin:0;background:#e5e7eb}.docx-wrapper{padding:24px!important}</style></head><body>' +
            container.innerHTML + '</body></html>';
          if (!controller.signal.aborted) setPreview({ groupId, name, context: documentContext, kind: 'word', html });
        } else if (extension === 'doc') {
          const text = await blob.text();
          if (!controller.signal.aborted) setPreview({ groupId, name, context: documentContext, kind: 'legacy-word', text });
        } else {
          objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          setPreview({ groupId, name, context: documentContext, kind: 'pdf', url: objectUrl });
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        let message = 'Unable to preview this proposal. The document may be damaged or unsupported.';
        try {
          const response = (err as { response?: { data?: Blob | { message?: string } } }).response;
          const data = response?.data;
          const body = data instanceof Blob ? JSON.parse(await data.text()) : data;
          message = body?.message || message;
        } catch { /* Keep the fallback for non-JSON errors. */ }
        if (!controller.signal.aborted) setPreview({ groupId, error: message });
      }
    };
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [groupId]);

  if (current?.kind && !error) {
    const word = current.kind === 'word' || current.kind === 'legacy-word';
    return (
      <div className="h-[calc(100dvh-12rem)] min-h-[420px] bg-bg flex flex-col min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 p-4 shrink-0 border-b border-text/10">
          <div className="min-w-0">
            <h1 className="text-lg font-black text-text">{word ? 'Proposal Word Preview' : current.kind === 'pdf' ? 'Proposal PDF Preview' : 'Proposal Document'}</h1>
            <p className="text-sm text-text/70 break-words">{current.context}</p>
            <p className="text-xs text-text/60 break-all mt-1">{current.name}</p>
          </div>
          <div className="flex gap-3">
            {current.kind === 'pdf' && <a href={current.url} target="_blank" rel="noreferrer" className="evl-btn-secondary">Open PDF</a>}
            <Link to={returnPath} className="evl-btn-secondary">{returnLabel}</Link>
          </div>
        </header>
        {current.kind === 'word' && <iframe srcDoc={current.html} sandbox="" title="Proposal Word preview" className="w-full flex-1 border-0" />}
        {current.kind === 'pdf' && <iframe src={current.url} title="Proposal PDF preview" className="w-full flex-1 border-0" />}
        {current.kind === 'legacy-word' && (
          <main className="flex-1 overflow-auto p-6">
            <p className="text-sm text-text/70 mb-4">This older Word file is shown as text. Save it as DOCX for formatting and image previews.</p>
            <article className="evl-card max-w-4xl mx-auto p-8 whitespace-pre-wrap break-words text-text">{current.text || 'This document contains no previewable text.'}</article>
          </main>
        )}
        {current.kind === 'unsupported' && (
          <main className="flex-1 flex items-center justify-center p-6">
            <div className="evl-card p-8 text-center">
              <p className="text-text mb-4">Preview is available for PDF and Word documents. Download this file to open it.</p>
              <a href={current.url} download={current.name} className="evl-btn-secondary">Download original</a>
            </div>
          </main>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="evl-card w-full max-w-md p-8 text-center" role="status">
        <h1 className="text-xl font-black text-text mb-2">{error ? 'Proposal Unavailable' : 'Opening Proposal'}</h1>
        <p className="text-sm text-text/70 mb-6">{error || 'Preparing your document preview...'}</p>
        {error && <Link to={returnPath} className="evl-btn-secondary inline-flex justify-center">{returnLabel}</Link>}
      </div>
    </div>
  );
}
