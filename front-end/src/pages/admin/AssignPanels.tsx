import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiMessage } from '../../utils/apiError';
import api from '../../services/api';
import { useAuth } from '../../context/useAuth';
import { useOperationalScope } from '../../hooks/useOperationalScope';

interface OwnerRef { _id: string; name: string; email?: string }
interface PanelUser {
  _id: string;
  name: string;
  email: string;
  role?: string;
  isActive?: boolean;
  createdBy?: string | OwnerRef | null;
}
interface Section {
  _id: string;
  name: string;
  block: string;
  assignedPanels: PanelUser[];
  subject?: { code: string; title: string };
}
const ownerId = (panel: PanelUser) => typeof panel.createdBy === 'string' ? panel.createdBy : panel.createdBy?._id;
const ownerName = (panel: PanelUser) => typeof panel.createdBy === 'object' ? panel.createdBy?.name || 'Unknown instructor' : 'Unknown instructor';
const assignedTo = (section: Section, id: string) => section.assignedPanels?.some(panel => panel._id === id);
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

export default function AssignPanels() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const { instructorId, subjectId, version } = useOperationalScope();
  const currentOwner = isSuperadmin ? instructorId : user?._id || user?.id;
  const [panels, setPanels] = useState<PanelUser[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedPanel, setSelectedPanel] = useState<PanelUser | null>(null);
  const [checkedBlocks, setCheckedBlocks] = useState<string[]>([]);
  const [panelTab, setPanelTab] = useState<'mine' | 'others'>('mine');
  const [search, setSearch] = useState('');
  const [sharedEnabled, setSharedEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState('');
  const [revision, setRevision] = useState(0);
  const requestVersion = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    requestVersion.current += 1;
    const load = async () => {
      setLoading(true);
      setSaving(false);
      setLoadError('');
      setSaveError('');
      setSuccess('');
      setSelectedPanel(null);
      setCheckedBlocks([]);
      try {
        const config = { signal: controller.signal, headers: { 'x-subject-id': subjectId, 'x-instructor-id': instructorId } };
        const [panelResponse, settingsResponse, sectionResponse] = await Promise.all([
          api.get('/users/assignable-panels', config),
          api.get('/settings', config),
          subjectId ? api.get('/sections', config) : Promise.resolve({ data: [] }),
        ]);
        if (controller.signal.aborted) return;
        setPanels(panelResponse.data.filter((panel: PanelUser) => panel.role === 'panel' && panel.isActive));
        setSharedEnabled(Boolean(settingsResponse.data.sharedPanelsEnabled));
        if (!settingsResponse.data.sharedPanelsEnabled) setPanelTab('mine');
        setSections(sectionResponse.data);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(getApiMessage(error, 'Unable to load panel assignments. Please try again.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [instructorId, subjectId, version, revision]);

  const savedBlocks = selectedPanel ? sections.filter(section => assignedTo(section, selectedPanel._id)).map(section => section._id) : [];
  const added = checkedBlocks.filter(id => !savedBlocks.includes(id)).length;
  const removed = savedBlocks.filter(id => !checkedBlocks.includes(id)).length;
  const dirty = added + removed > 0;
  const mine = panels.filter(panel => ownerId(panel) === currentOwner);
  const others = panels.filter(panel => ownerId(panel) !== currentOwner);
  const source = panelTab === 'mine' ? mine : others;
  const filtered = source.filter(panel => `${panel.name} ${panel.email} ${ownerName(panel)}`.toLowerCase().includes(search.trim().toLowerCase()));

  const selectPanel = (panel: PanelUser) => {
    setSelectedPanel(panel);
    setCheckedBlocks(sections.filter(section => assignedTo(section, panel._id)).map(section => section._id));
    setSuccess('');
    setSaveError('');
  };
  const changeBlocks = (ids: string[]) => {
    setCheckedBlocks(ids);
    setSuccess('');
    setSaveError('');
  };
  const handleSave = async () => {
    if (!selectedPanel || !dirty || saving || !subjectId) return;
    const generation = requestVersion.current;
    setSaving(true);
    setSaveError('');
    setSuccess('');
    try {
      await api.post('/sections/assign-blocks', { panelId: selectedPanel._id, sectionIds: checkedBlocks }, {
        headers: { 'x-subject-id': subjectId, 'x-instructor-id': instructorId },
      });
      if (generation !== requestVersion.current) return;
      setSections(current => current.map(section => ({
        ...section,
        assignedPanels: [
          ...section.assignedPanels.filter(panel => panel._id !== selectedPanel._id),
          ...(checkedBlocks.includes(section._id) ? [selectedPanel] : []),
        ],
      })));
      setSuccess(`Saved. ${selectedPanel.name} is assigned to ${checkedBlocks.length} ${checkedBlocks.length === 1 ? 'block' : 'blocks'} in this subject.`);
    } catch (error) {
      if (generation === requestVersion.current) setSaveError(getApiMessage(error, 'Assignments could not be saved. Your selections are still here.'));
    } finally {
      if (generation === requestVersion.current) setSaving(false);
    }
  };

  return (
    <div className="min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 data-tutorial="assign-panels" className="evl-page-title">Assign Panels</h2>
          <p className="evl-page-subtitle">Choose an existing judge, then set the blocks they will evaluate.</p>
        </div>
        <button type="button" className="evl-btn-secondary" disabled={loading || saving || dirty}
          onClick={() => setRevision(value => value + 1)}>Refresh list</button>
      </header>

      {loading ? (
        <div className="evl-card p-6" role="status" aria-label="Loading panel assignments">
          <p className="text-sm text-text/70 mb-5">Loading judges and blocks…</p>
          <div className="grid md:grid-cols-3 gap-5 motion-safe:animate-pulse" aria-hidden="true">
            <div className="h-64 rounded-lg bg-muted/20" /><div className="md:col-span-2 h-64 rounded-lg bg-muted/10" />
          </div>
        </div>
      ) : loadError ? (
        <div role="alert" className="evl-card p-6 border-danger/30">
          <h3 className="font-bold text-text mb-2">Couldn’t load assignments</h3>
          <p className="text-sm text-danger mb-4">{loadError}</p>
          <button type="button" onClick={() => setRevision(value => value + 1)} className="evl-btn-secondary">Try again</button>
        </div>
      ) : (
        <>
          <div className="grid lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.65fr)] gap-5 items-start">
            <section aria-labelledby="panel-directory-title" className="evl-card min-w-0 overflow-hidden">
              <div className="p-4 border-b border-muted/40">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 id="panel-directory-title" className="font-bold text-text"><span className="text-primary mr-2">01</span>Choose a panel</h3>
                  <span className="text-xs text-text/60">{panels.length} available</span>
                </div>
                <div className="flex gap-1 bg-bg p-1 rounded-lg mb-4" role="group" aria-label="Panel account source">
                  {(['mine', ...(sharedEnabled ? ['others' as const] : [])] as const).map(tab => (
                    <button key={tab} type="button" aria-pressed={panelTab === tab} disabled={saving || dirty}
                      onClick={() => { setPanelTab(tab); setSelectedPanel(null); setCheckedBlocks([]); setSuccess(''); setSaveError(''); }}
                      className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${panelTab === tab ? 'bg-primary text-white' : 'text-text hover:bg-muted/20'}`}>
                      {tab === 'mine' ? 'My Panels' : 'Panels from Other Instructors'} <span className="ml-1 tabular-nums">{tab === 'mine' ? mine.length : others.length}</span>
                    </button>
                  ))}
                </div>
                <label htmlFor="panel-search" className="evl-label">Find a judge</label>
                <input id="panel-search" type="search" placeholder="Name, email, or instructor" value={search}
                  onChange={event => setSearch(event.target.value)} className="evl-input w-full" />
              </div>
              {dirty && <p className="px-4 py-3 text-xs text-primary bg-primary/5 border-b border-primary/10">Save or discard before switching judges.</p>}
              <div className="max-h-[350px] lg:max-h-[560px] overflow-y-auto p-2">
                {filtered.map(panel => {
                  const active = selectedPanel?._id === panel._id;
                  return (
                    <button key={panel._id} type="button" aria-pressed={active} disabled={saving || (dirty && !active)}
                      onClick={() => { if (!active) selectPanel(panel); }}
                      className={`w-full flex gap-3 text-left p-3 rounded-lg border mb-1 transition-colors disabled:opacity-60 ${active ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-bg'}`}>
                      <span aria-hidden="true" className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${active ? 'bg-primary text-white' : 'bg-muted/20 text-text/70'}`}>{initials(panel.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-sm text-text break-words">{panel.name}</span>
                        <span className="block text-xs text-text/70 break-all mt-0.5">{panel.email}</span>
                        {panelTab === 'others' && <span className="block text-xs text-text/60 mt-2 break-words">Instructor: {ownerName(panel)}</span>}
                      </span>
                      {active && <span aria-hidden="true" className="text-primary font-bold">✓</span>}
                    </button>
                  );
                })}
                {!filtered.length && <div className="px-4 py-10 text-center">
                  <p className="font-semibold text-sm text-text">{search.trim() ? 'No matching judges' : 'No panels available here yet'}</p>
                  <p className="text-xs text-text/70 mt-2">{search.trim() ? 'Try a different name, email, or instructor.' : panelTab === 'mine' ? 'Create a panel account, or select an existing judge from another instructor when sharing is enabled.' : 'Active panels created by other instructors will appear here.'}</p>
                  {search.trim() && <button type="button" onClick={() => setSearch('')} className="evl-btn-secondary mt-4">Clear search</button>}
                </div>}
              </div>
            </section>

            <section aria-labelledby="block-assignment-title" className="evl-card min-w-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-muted/40">
                <h3 id="block-assignment-title" className="font-bold text-text"><span className="text-primary mr-2">02</span>Assign blocks</h3>
              </div>
              {!selectedPanel ? (
                <div className="px-6 py-16 lg:py-24 text-center">
                  <svg aria-hidden="true" className="mx-auto mb-5 text-primary/70" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 7h5m-2.5-2.5v5M17 15h5m-5 4h5" /></svg>
                  <h4 className="text-lg font-bold text-text">Start with a panel judge</h4>
                  <p className="text-sm text-text/70 max-w-sm mx-auto mt-2">Select someone from the directory to view their current blocks and update their assignments.</p>
                  <p className="text-xs text-text/60 mt-5">Changes apply only to the current subject and instructor.</p>
                </div>
              ) : (
                <>
                  <div className="p-5 border-b border-muted/40 bg-primary/5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-lg font-bold text-text break-words">{selectedPanel.name}</h4>
                        <p className="text-xs text-text/70 mt-1 break-all">{selectedPanel.email}</p>
                      </div>
                      <span className="evl-badge-primary">{ownerId(selectedPanel) === currentOwner ? 'My panel' : 'Shared panel'}</span>
                    </div>
                  </div>
                  <div className="p-5">
                    {sections.length > 0 ? <>
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <p className="text-sm font-semibold text-text">{checkedBlocks.length} of {sections.length} blocks selected</p>
                        <div className="flex gap-3">
                          <button type="button" disabled={saving || checkedBlocks.length === sections.length} onClick={() => changeBlocks(sections.map(section => section._id))} className="text-xs font-semibold text-primary disabled:opacity-40">Select all</button>
                          <button type="button" disabled={saving || !checkedBlocks.length} onClick={() => changeBlocks([])} className="text-xs font-semibold text-text/70 disabled:opacity-40">Clear selection</button>
                        </div>
                      </div>
                      <fieldset disabled={saving} className="grid sm:grid-cols-2 gap-3">
                        <legend className="sr-only">Blocks assigned to {selectedPanel.name}</legend>
                        {sections.map(section => {
                          const checked = checkedBlocks.includes(section._id);
                          const saved = savedBlocks.includes(section._id);
                          return <label key={section._id} className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-primary/40 ${checked ? 'border-primary/50 bg-primary/5' : 'border-muted/40 hover:border-primary/30'}`}>
                            <input type="checkbox" checked={checked} onChange={() => changeBlocks(checked ? checkedBlocks.filter(id => id !== section._id) : [...checkedBlocks, section._id])}
                              className="mt-0.5 w-4 h-4 shrink-0 accent-primary" />
                            <span className="min-w-0">
                              <span className="block text-sm font-bold text-text break-words">{section.block || section.name}</span>
                              <span className={`block text-xs mt-1 ${checked !== saved ? 'text-primary font-semibold' : 'text-text/60'}`}>{checked !== saved ? checked ? 'Will be assigned' : 'Will be unassigned' : saved ? 'Currently assigned' : 'Not assigned'}</span>
                            </span>
                          </label>;
                        })}
                      </fieldset>
                    </> : <div className="py-8 text-center">
                      <h4 className="font-bold text-text">{subjectId ? 'No blocks yet' : 'Choose a subject first'}</h4>
                      <p className="text-sm text-text/70 mt-2">{subjectId ? 'Create a block in this subject, then return to assign your judges.' : 'Select a subject in your workspace to see its blocks.'}</p>
                      {subjectId && <Link to="/sections" className="evl-btn-secondary inline-flex mt-4">Manage blocks</Link>}
                    </div>}
                    {saveError && <p role="alert" className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-lg p-3 mt-4">{saveError}</p>}
                    {success && <p role="status" className="evl-alert-success mt-4">{success}</p>}
                  </div>
                  <footer className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-t border-muted/40 bg-bg">
                    <div aria-live="polite">
                      <p className={`text-sm font-semibold ${dirty ? 'text-primary' : 'text-text/70'}`}>{dirty ? `${added} to assign · ${removed} to unassign` : 'No pending changes'}</p>
                      <p className="text-xs text-text/60 mt-1">{dirty ? 'Assignments take effect when you save.' : 'Existing scores are preserved when unassigning.'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {dirty && <button type="button" disabled={saving} onClick={() => changeBlocks(savedBlocks)} className="evl-btn-secondary">Discard changes</button>}
                      <button type="button" disabled={saving || !dirty || !subjectId} onClick={() => { void handleSave(); }} className="evl-btn-primary">{saving ? 'Saving…' : 'Save assignments'}</button>
                    </div>
                  </footer>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
