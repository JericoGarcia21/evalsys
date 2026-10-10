import { getApiMessage } from '../../utils/apiError';
import { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import { notify } from '../../utils/notify';
import { useAuth } from '../../context/useAuth';
import { useOperationalScope } from '../../hooks/useOperationalScope';

interface OwnerRef { _id: string; name: string; email: string; }
interface PanelUser {
  _id: string;
  name: string;
  email: string;
  role?: string;
  isActive?: boolean;
  createdBy?: string | OwnerRef | null;
}
interface Section { _id: string; name: string; block: string; assignedPanels: PanelUser[] }
const getPanelOwnerLabel = (panel: PanelUser) => {
  if (!panel.createdBy) return 'No created by';
  if (typeof panel.createdBy === 'string') return 'Unknown instructor';
  return panel.createdBy.name || panel.createdBy.email || 'Unknown instructor';
};

export default function AssignPanels() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const { instructorId: currentInstructorId, subjectId: currentSubjectId, version: scopeVersion } = useOperationalScope();
  const [panels, setPanels] = useState<PanelUser[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedPanel, setSelectedPanel] = useState<PanelUser | null>(null);
  const [checkedBlocks, setCheckedBlocks] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const loadData = useCallback(async () => {
    const pRes = await api.get('/users');
    setPanels(pRes.data.filter((u: PanelUser) => u.role === 'panel' && u.isActive));

    if (isSuperadmin && !currentSubjectId) {
      setSections([]);
      setSelectedPanel(null);
      setCheckedBlocks([]);
      return;
    }
    
    const sRes = await api.get('/sections');
    setSections(sRes.data);
  }, [isSuperadmin, currentSubjectId]);

  useEffect(() => {
    // Data and selection updates occur after awaited API responses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData().catch(err => notify(getApiMessage(err, 'Failed to load panel assignments'), { type: 'error' }));
  }, [scopeVersion, loadData]);

  const selectPanel = (panel: PanelUser) => {
    setSelectedPanel(panel);
    setSuccessMsg('');
    // Pre-check the blocks that this panel is already assigned to
    const assigned = sections
      .filter(s => s.assignedPanels && s.assignedPanels.some(p => p._id === panel._id))
      .map(s => s._id);
    setCheckedBlocks(assigned);
  };

  const handleCheckbox = (sectionId: string) => {
    setCheckedBlocks(prev => 
      prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId]
    );
  };

  const handleSave = async () => {
    if (!selectedPanel) return;
    setLoading(true);
    setSuccessMsg('');
    try {
      await api.post('/sections/assign-blocks', {
        panelId: selectedPanel._id,
        sectionIds: checkedBlocks,
      });
      setSuccessMsg(`Assignments updated for ${selectedPanel.name}`);
      await loadData();
    } catch (err: unknown) {
      notify(getApiMessage(err, 'Error saving assignments'), { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const panelOwnerId = (panel: PanelUser) => {
    if (!panel.createdBy) return 'old';
    if (typeof panel.createdBy === 'string') return panel.createdBy;
    return panel.createdBy._id || 'old';
  };

  const filteredPanels = panels.filter((panel) => {
    if (!isSuperadmin) return true;
    return panelOwnerId(panel) === currentInstructorId;
  });

  return (
    <div>
      <div className="mb-6">
        <h2 className="evl-page-title">Assign Panels to Blocks</h2>
        <p className="evl-page-subtitle">Select a panel judge to manage which blocks they are assigned to.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left column: Panel list */}
        <div className="w-full md:w-1/3">
          <div className="evl-card h-full">
            <div className="p-4 border-b border-muted/40">
              <h3 className="font-bold text-text text-sm">Select Panel Judge</h3>
              {isSuperadmin && (
                <p className="text-[11px] text-text/65 mt-1">
                  Showing panels owned by the current sidebar instructor.
                </p>
              )}
            </div>
            <div className="flex flex-col p-2 max-h-[600px] overflow-y-auto">
              {filteredPanels.map((p) => (
                <button
                  key={p._id}
                  onClick={() => selectPanel(p)}
                  className={`text-left p-3 rounded-lg transition-colors mb-1 ${
                    selectedPanel?._id === p._id
                      ? 'bg-primary text-white shadow-sm'
                      : 'hover:bg-bg text-text'
                  }`}
                >
                  <p className="font-semibold text-sm">{p.name}</p>
                  <p className={`text-xs mt-0.5 ${selectedPanel?._id === p._id ? 'text-white/70' : 'text-text/70'}`}>
                    {p.email}
                  </p>
                  {isSuperadmin && (
                    <p className={`text-[11px] mt-1 font-semibold ${selectedPanel?._id === p._id ? 'text-white/60' : 'text-text/60'}`}>
                      Created by: {getPanelOwnerLabel(p)}
                    </p>
                  )}
                </button>
              ))}
              {!filteredPanels.length && (
                <p className="text-text/70 text-sm p-4 text-center">No active panel accounts found.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Blocks selection */}
        <div className="w-full md:w-2/3">
          <div className="evl-card h-full p-6">
            {!selectedPanel ? (
              <div className="h-64 flex flex-col items-center justify-center text-center">
                <div className="text-4xl text-text/60 mb-3">👤</div>
                <p className="text-text/70">Select a panel judge from the list to assign blocks.</p>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="font-bold text-text text-base">
                      Blocks for <span className="text-primary">{selectedPanel.name}</span>
                    </h3>
                    <p className="text-text/70 text-xs mt-1">
                      {isSuperadmin
                        ? `Created by: ${getPanelOwnerLabel(selectedPanel)}`
                        : 'Check the blocks this panel should grade.'}
                    </p>
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="evl-btn-primary"
                  >
                    {loading ? 'Saving...' : 'Save Assignments'}
                  </button>
                </div>

                {successMsg && (
                  <div className="evl-alert-success mb-6">{successMsg}</div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sections.map((s) => (
                    <label
                      key={s._id}
                      className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                        checkedBlocks.includes(s._id)
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-muted/40 hover:border-primary/40 hover:bg-bg'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checkedBlocks.includes(s._id)}
                        onChange={() => handleCheckbox(s._id)}
                        className="w-5 h-5 rounded border-muted text-primary focus:ring-primary/30 cursor-pointer"
                      />
                      <div>
                        <p className="font-semibold text-text text-sm">{s.block}</p>
                      </div>
                    </label>
                  ))}
                  {!sections.length && (
                    <p className="col-span-2 text-text/70 text-sm text-center py-8">
                      {isSuperadmin && !currentSubjectId
                        ? 'Select or create a subject for this instructor before assigning blocks.'
                        : 'No blocks have been created yet.'}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

