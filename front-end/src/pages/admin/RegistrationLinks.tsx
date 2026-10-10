import { getApiMessage } from '../../utils/apiError';
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { notify } from '../../utils/notify';
import { currentSubjectKey, useOperationalScope } from '../../hooks/useOperationalScope';

interface Subject { _id: string; code: string; title: string; }
interface Section { _id: string; block: string; subject?: string | Subject; }
interface RegistrationLink {
  _id: string;
  token: string;
  subject: Subject;
  sections: Section[];
  createdBy?: { name?: string; email?: string };
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
}

const toDatetimeLocal = (date: Date) => {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

const getSectionSubjectId = (section: Section) => (
  typeof section.subject === 'string' ? section.subject : section.subject?._id
);

export default function RegistrationLinks() {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [links, setLinks] = useState<RegistrationLink[]>([]);
  const [selectedSubject, setSelectedSubject] = useState(() => localStorage.getItem(currentSubjectKey) || '');
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState(() => toDatetimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copiedToken, setCopiedToken] = useState('');
  const [linkToRemove, setLinkToRemove] = useState<RegistrationLink | null>(null);
  const [removing, setRemoving] = useState(false);
  const { subjectId: currentSubjectId, version: scopeVersion } = useOperationalScope();

  const visibleSections = useMemo(
    () => sections.filter((section) => getSectionSubjectId(section) === selectedSubject),
    [sections, selectedSubject]
  );

  const linkUrl = (token: string) => `${window.location.origin}/register?token=${encodeURIComponent(token)}`;

  const loadLinks = useCallback(() => {
    if (!selectedSubject) return;
    api.get('/registration-links', { params: { subject: selectedSubject } })
      .then((res) => setLinks(res.data))
      .catch((err) => setError(getApiMessage(err, 'Failed to load registration links')));
  }, [selectedSubject]);

  useEffect(() => {
    Promise.all([
      api.get('/subjects'),
      api.get('/sections'),
    ]).then(([subjectRes, sectionRes]) => {
      setSections(sectionRes.data);
      const saved = currentSubjectId || localStorage.getItem(currentSubjectKey);
      const firstSubject = subjectRes.data[0]?._id || '';
      const nextSubjectDoc = subjectRes.data.find((item: Subject) => item._id === saved) || subjectRes.data[0] || null;
      const nextSubject = nextSubjectDoc?._id || firstSubject;
      setSubject(nextSubjectDoc);
      setSelectedSubject(nextSubject || '');
    }).catch((err) => {
      setError(getApiMessage(err, 'Failed to load registration setup'));
    }).finally(() => setLoading(false));
  }, [scopeVersion, currentSubjectId]);

  useEffect(() => {
    if (selectedSubject) {
      api.get('/sections', { params: { subject: selectedSubject } })
        .then((res) => { setSelectedSections([]); setSections(res.data); })
        .catch((err) => setError(getApiMessage(err, 'Failed to load blocks for this subject')));
    }
    loadLinks();
  }, [selectedSubject, loadLinks]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/registration-links', {
        subject: selectedSubject,
        sections: selectedSections,
        expiresAt,
      });
      setSelectedSections([]);
      loadLinks();
    } catch (err: unknown) {
      setError(getApiMessage(err, 'Failed to create registration link'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSection = (sectionId: string) => {
    setSelectedSections((current) => (
      current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId]
    ));
  };

  const handleCopy = async (token: string) => {
    await navigator.clipboard.writeText(linkUrl(token));
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(''), 1800);
  };

  const handleStatus = async (link: RegistrationLink, isActive: boolean) => {
    try {
      await api.patch(`/registration-links/${link._id}`, { isActive });
      loadLinks();
    } catch (err: unknown) {
      setError(getApiMessage(err, 'Failed to update registration link'));
    }
  };

  const handleRemove = async () => {
    if (!linkToRemove) return;
    setRemoving(true);
    try {
      const res = await api.delete(`/registration-links/${linkToRemove._id}`);
      notify(res.data.message, { type: 'success', title: 'Link Removed' });
      setLinkToRemove(null);
      loadLinks();
    } catch (err: unknown) {
      notify(getApiMessage(err, 'Failed to remove registration link'), { type: 'error' });
    } finally {
      setRemoving(false);
    }
  };

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const isExpired = (link: RegistrationLink) => new Date(link.expiresAt).getTime() <= now;

  return (
    <div>
      <div className="mb-6">
        <h2 className="evl-page-title">Registration Links</h2>
        <p className="evl-page-subtitle">Generate controlled registration links for the current subject.</p>
      </div>

      {error && <div className="evl-alert-error mb-6">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6">
        <div className="evl-card p-6 h-fit">
          <h3 className="text-text font-bold text-sm mb-4">Create Link</h3>
          <form onSubmit={handleCreate} className="space-y-5">
            <div>
              <label className="evl-label">Subject</label>
              <div className="evl-input flex items-center bg-bg/60 font-semibold text-text">
                <span className="truncate">
                  {subject ? `${subject.code} - ${subject.title}` : 'No current subject selected'}
                </span>
              </div>
              <p className="text-[11px] text-text/65 mt-2">
                Change the current subject from the sidebar to generate links for another subject.
              </p>
            </div>

            <div>
              <label className="evl-label">Expiration</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                required
                className="evl-input"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="evl-label mb-0">Allowed Blocks</label>
                <button
                  type="button"
                  onClick={() => setSelectedSections([])}
                  className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
                >
                  Allow all
                </button>
              </div>
              <div className="rounded-xl border border-muted/30 bg-bg/50 p-3 max-h-64 overflow-y-auto space-y-2">
                {visibleSections.map((section) => (
                  <label key={section._id} className="flex items-center gap-3 rounded-lg bg-surface border border-muted/20 px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSections.includes(section._id)}
                      onChange={() => handleToggleSection(section._id)}
                      className="w-4 h-4 text-primary"
                    />
                    <span className="text-sm font-semibold text-text">{section.block}</span>
                  </label>
                ))}
                {!visibleSections.length && (
                  <p className="text-sm text-text/70 py-4 text-center">No blocks found for this subject.</p>
                )}
              </div>
              <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                <p className="text-xs font-bold text-primary">
                  No block selected = all blocks in {subject?.code || 'this subject'} can use this link.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || !selectedSubject || !visibleSections.length}
              className="evl-btn-primary w-full"
            >
              {saving ? 'Creating...' : 'Generate Registration Link'}
            </button>
          </form>
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : (
          <div className="evl-card overflow-hidden">
            <div className="p-5 border-b border-muted/20 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-text font-bold text-sm">Generated Links</h3>
                <p className="text-xs text-text/65 mt-1">Only students with an active link can register.</p>
              </div>
            </div>
            <div className="divide-y divide-muted/20">
              {links.map((link) => {
                const expired = isExpired(link);
                const active = link.isActive && !expired;
                return (
                  <div key={link._id} className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${
                            active ? 'bg-success/10 text-success' : 'bg-muted/40 text-text/65'
                          }`}>
                            {expired ? 'Expired' : link.isActive ? 'Open' : 'Closed'}
                          </span>
                          <span className="text-xs text-text/65">
                            Expires {new Date(link.expiresAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-text truncate">{linkUrl(link.token)}</p>
                        <p className="text-xs text-text/65 mt-2">
                          Blocks: {link.sections.length ? link.sections.map((section) => section.block).join(', ') : 'All blocks in subject'}
                        </p>
                        <p className="text-xs text-text/60 mt-1">
                          Created by: {link.createdBy?.name || link.createdBy?.email || 'Unknown'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => handleCopy(link.token)} className="evl-btn-ghost text-primary border-primary/30 hover:border-primary/50">
                          {copiedToken === link.token ? 'Copied' : 'Copy Link'}
                        </button>
                        <button
                          onClick={() => handleStatus(link, !link.isActive)}
                          className={`evl-btn-ghost ${link.isActive ? 'text-danger border-danger/30 hover:text-danger hover:bg-danger/5 hover:border-danger/50' : 'text-success border-success/30 hover:text-success hover:bg-success/5 hover:border-success/50'}`}
                        >
                          {link.isActive ? 'Stop Accepting' : 'Reopen'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setLinkToRemove(link)}
                          className="evl-btn-ghost text-danger border-danger/30 hover:text-danger hover:bg-danger/5 hover:border-danger/50"
                        >
                          Remove Link
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!links.length && (
                <div className="p-12 text-center text-text/70">
                  No registration links yet for this subject.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {linkToRemove && (
        <div className="fixed inset-0 z-[100] bg-dark/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface border border-muted/40 rounded-lg shadow-xl p-6">
            <h3 className="font-extrabold text-text text-lg">Remove registration link?</h3>
            <p className="text-text/60 text-sm mt-2">
              This link will stop working permanently. Existing registered groups and grades will remain.
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setLinkToRemove(null)}
                disabled={removing}
                className="evl-btn-secondary !py-2 !text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={removing}
                className="evl-btn-danger !py-2 !text-xs"
              >
                {removing ? 'Removing...' : 'Remove Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

