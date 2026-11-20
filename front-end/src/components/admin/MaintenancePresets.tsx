import { useEffect, useState, type FormEvent } from 'react';
import api from '../../services/api';
import { getApiMessage } from '../../utils/apiError';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

export interface MaintenancePreset {
  _id: string; name: string; message: string; delayMinutes: number; durationMinutes: number | null;
}

export default function MaintenancePresets({ message, onLoad, disabled }: { message: string; onLoad: (preset: MaintenancePreset) => void; disabled: boolean }) {
  const [presets, setPresets] = useState<MaintenancePreset[]>([]);
  const [revision, setRevision] = useState(0);
  const [loadedRevision, setLoadedRevision] = useState(-1);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [delay, setDelay] = useState(5);
  const [duration, setDuration] = useState('60');
  const [selected, setSelected] = useState('');
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const loading = revision !== loadedRevision;
  useEffect(() => {
    const controller = new AbortController();
    api.get<MaintenancePreset[]>('/settings/maintenance-presets', { signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) { setPresets(response.data); setError(''); setLoadedRevision(revision); }
    }).catch((err: unknown) => { if (!controller.signal.aborted) { setError(getApiMessage(err, 'Failed to load maintenance presets')); setLoadedRevision(revision); } });
    return () => controller.abort();
  }, [revision]);
  const preset = presets.find(item => item._id === selected);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setFeedback('');
    try {
      await api.post('/settings/maintenance-presets', { name: name.trim(), message, delayMinutes: delay, durationMinutes: duration ? Number(duration) : null });
      setName(''); setFeedback('Preset saved. Maintenance has not been changed.'); setRevision(value => value + 1);
    } catch (err: unknown) { setError(getApiMessage(err, 'Failed to save preset')); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!preset || !await confirm({ title: 'Delete Maintenance Preset?', message: `Delete “${preset.name}”? Running maintenance schedules will not change.`, confirmLabel: 'Delete Preset', danger: true })) return;
    setBusy(true); setError(''); setFeedback('');
    try { await api.delete(`/settings/maintenance-presets/${preset._id}`); setSelected(''); setRevision(value => value + 1); setFeedback('Preset deleted. Running schedules are unchanged.'); }
    catch (err: unknown) { setError(getApiMessage(err, 'Failed to delete preset')); }
    finally { setBusy(false); }
  };
  return <section aria-label="Maintenance presets" className="border-t border-muted/40 pt-5 space-y-3">
    <ConfirmDialog />
    <h4 className="font-bold text-sm text-text">Reuse a maintenance setup</h4>
    <p className="text-xs text-text/65">Loading only fills the form. You must still confirm the maintenance schedule.</p>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {feedback && <p role="status" className="text-sm text-success">{feedback}</p>}
    {loading ? <p role="status" className="text-xs">Loading presets...</p> : <>
      <label htmlFor="maintenance-preset" className="evl-label">Saved preset</label>
      <select id="maintenance-preset" className="evl-select" value={selected} disabled={busy || disabled} onChange={event => setSelected(event.target.value)}><option value="">Choose a preset</option>{presets.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
      {!presets.length && <p className="text-xs text-text/65">No saved presets yet. Save the current message with a reusable delay and duration below.</p>}
      {preset && <p className="text-xs text-text/70">{preset.delayMinutes ? `Starts after ${preset.delayMinutes} minutes` : 'Starts immediately'} · {preset.durationMinutes === null ? 'Manual end' : `${preset.durationMinutes}-minute window`}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="evl-btn-secondary" disabled={!preset || disabled || busy} onClick={() => { if (preset) { onLoad(preset); setFeedback('Preset loaded into the form. Maintenance has not started or changed.'); } }}>Load preset into form</button>
        <button type="button" className="evl-btn-danger" disabled={!preset || disabled || busy} onClick={remove}>Delete preset</button>
        <button type="button" className="evl-btn-secondary" disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh presets</button>
      </div>
    </>}
    <details><summary className="text-sm font-bold text-primary cursor-pointer">Save a reusable preset</summary>
      <form onSubmit={save} className="space-y-3 mt-3">
        <fieldset disabled={busy || disabled} className="space-y-3"><legend className="sr-only">New preset settings</legend>
          <div><label htmlFor="preset-name" className="evl-label">Preset name</label><input id="preset-name" className="evl-input" required maxLength={60} value={name} onChange={event => setName(event.target.value)} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label htmlFor="preset-delay" className="evl-label">Preset start delay</label><select id="preset-delay" className="evl-select" value={delay} onChange={event => setDelay(Number(event.target.value))}>{[0, 5, 15, 30].map(value => <option key={value} value={value}>{value ? `${value} minutes` : 'Immediately'}</option>)}</select></div>
            <div><label htmlFor="preset-duration" className="evl-label">Preset duration (minutes)</label><input id="preset-duration" className="evl-input" type="number" min={1} max={10080} step={1} value={duration} onChange={event => setDuration(event.target.value)} placeholder="Blank = manual end" /></div>
          </div>
          <p className="text-xs text-text/65">Saves the current maintenance message: <span className="break-words">{message}</span></p>
          <button type="submit" className="evl-btn-secondary" disabled={!message.trim()}>Save maintenance preset</button>
        </fieldset>
      </form>
    </details>
  </section>;
}
