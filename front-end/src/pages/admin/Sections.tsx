import { getApiMessage } from '../../utils/apiError';
import { useEffect, useState } from 'react';
import api from '../../services/api';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useOperationalScope } from '../../hooks/useOperationalScope';

interface Section { _id: string; name: string; block: string; }

export default function Sections() {
  const [sections, setSections] = useState<Section[]>([]);
  const [block, setBlock] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { version: scopeVersion } = useOperationalScope();

  const load = (showLoader = true) => {
    if (showLoader) setLoading(true);
    api.get('/sections')
      .then((r) => setSections(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(() => { api.get('/sections').then(r => setSections(r.data)).catch(err => setError(getApiMessage(err, 'Failed to load blocks'))).finally(() => setLoading(false)); }, [scopeVersion]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/sections', { name: block, block });
      setBlock('');
      load();
    } catch (err: unknown) {
      setError(getApiMessage(err, 'Error'));
    }
  };

  const handleUpdate = async (id: string) => {
    setError('');
    try {
      await api.put(`/sections/${id}`, { name: editValue, block: editValue });
      setEditingId(null);
      load();
    } catch (err: unknown) {
      setError(getApiMessage(err, 'Error updating'));
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Delete Block?',
      message: 'This removes the active block and its groups. Submitted results will be moved to Archive.',
      confirmLabel: 'Delete Block',
      danger: true,
    });
    if (!ok) return;
    await api.delete(`/sections/${id}`);
    load();
  };

  return (
    <div>
      <ConfirmDialog />
      <div className="mb-6">
        <h2 className="evl-page-title">Blocks</h2>
        <p className="evl-page-subtitle">Create and manage blocks.</p>
      </div>

      {/* Add form */}
      <div className="evl-card p-6 mb-6">
        <h3 className="text-text font-bold text-sm mb-4">Add New Block</h3>
        <form onSubmit={handleAdd} className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <label className="evl-label">Block Name</label>
            <input value={block} onChange={(e) => setBlock(e.target.value)} required
              className="evl-input" placeholder="e.g. 21-ITE-04" />
          </div>
          <button type="submit" className="evl-btn-primary">Add Block</button>
        </form>
        {error && <p className="text-danger text-sm mt-3 font-medium">{error}</p>}
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={5} cols={2} />
      ) : (
        <div className="evl-card overflow-hidden">
          <table className="evl-table">
            <thead>
              <tr>
                <th>Block</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => (
                <tr key={s._id}>
                  <td className="font-semibold text-text">
                    {editingId === s._id ? (
                      <input 
                        value={editValue} 
                        onChange={(e) => setEditValue(e.target.value)}
                        className="evl-input py-1 h-9"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdate(s._id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                    ) : (
                      s.block
                    )}
                  </td>
                  <td className="col-actions">
                    {editingId === s._id ? (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleUpdate(s._id)} className="evl-btn-primary py-1 px-3 text-xs h-9">
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)} className="evl-btn-ghost">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => { setEditingId(s._id); setEditValue(s.block); }} className="evl-btn-ghost text-primary border-primary/30 hover:text-primary hover:bg-primary/5 hover:border-primary/50">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(s._id)} className="evl-btn-ghost text-danger border-danger/30 hover:text-danger hover:bg-danger/5 hover:border-danger/50">
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!sections.length && (
                <tr><td colSpan={2} className="text-center text-text/70 py-12">No blocks yet. Add one above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

