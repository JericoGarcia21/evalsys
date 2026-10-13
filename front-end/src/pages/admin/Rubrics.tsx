import { useEffect, useState } from 'react';
import api from '../../services/api';
import { CardSkeleton } from '../../components/LoadingSkeleton';
import { notify } from '../../utils/notify';
import { useAuth } from '../../context/useAuth';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useOperationalScope } from '../../hooks/useOperationalScope';

interface Level {
  label: string;
  minScore: number;
  maxScore: number;
  description: string;
}

interface Criteria {
  key: string;
  label: string;
  maxScore: number;
  levels: Level[];
}

interface Rubric {
  _id: string;
  title: string;
  criteria: Criteria[];
  isActive: boolean;
  createdAt: string;
  createdBy?: string | { _id: string; name?: string; email?: string } | null;
}

const LEVEL_LABELS = ['Excellent', 'Good', 'Fair', 'Poor'];

const emptyCriteria = (): Criteria => ({
  key: '',
  label: '',
  maxScore: 0,
  levels: LEVEL_LABELS.map((l) => ({ label: l, minScore: 0, maxScore: 0, description: '' })),
});

const DEFAULT_CRITERIA: Criteria[] = [
  emptyCriteria(),
];

const getErrorMessage = (err: unknown, fallback: string) => {
  const response = (err as { response?: { data?: { message?: string } } })?.response;
  return response?.data?.message || fallback;
};

const getOwnerId = (value: Rubric['createdBy']) => (
  typeof value === 'string' ? value : value?._id || ''
);

const getOwnerLabel = (rubric: Rubric) => {
  if (!rubric.createdBy) return 'No created by';
  if (typeof rubric.createdBy === 'string') return 'Unknown instructor';
  return rubric.createdBy.name || rubric.createdBy.email || 'Unknown instructor';
};

const validateRubricForm = (title: string, criteria: Criteria[]) => {
  if (!title.trim()) return 'Rubric title is required.';
  if (!criteria.length) return 'Add at least one evaluation criteria.';

  const criteriaKeys = new Set<string>();
  const criteriaLabels = new Set<string>();

  for (let ci = 0; ci < criteria.length; ci++) {
    const c = criteria[ci];
    const criteriaName = c.label.trim() || `Criteria ${ci + 1}`;
    const maxScore = Number(c.maxScore);

    if (!c.label.trim()) return `Criteria ${ci + 1}: name is required.`;
    if (!c.key.trim()) return `${criteriaName}: system key is required.`;
    if (!Number.isFinite(maxScore) || maxScore <= 0) return `${criteriaName}: max score must be greater than 0.`;

    const normalizedKey = c.key.trim().toLowerCase();
    const normalizedLabel = c.label.trim().toLowerCase();
    if (criteriaKeys.has(normalizedKey)) return `${criteriaName}: criteria key is duplicated.`;
    if (criteriaLabels.has(normalizedLabel)) return `${criteriaName}: criteria name is duplicated.`;
    criteriaKeys.add(normalizedKey);
    criteriaLabels.add(normalizedLabel);

    if (!c.levels.length) return `${criteriaName}: add at least one score level.`;

    const levelLabels = new Set<string>();
    const ranges: Array<{ min: number; max: number; label: string }> = [];

    for (let li = 0; li < c.levels.length; li++) {
      const level = c.levels[li];
      const levelName = level.label.trim() || `Level ${li + 1}`;
      const minScore = Number(level.minScore);
      const levelMaxScore = Number(level.maxScore);

      if (!level.label.trim()) return `${criteriaName}: level ${li + 1} name is required.`;
      const normalizedLevel = level.label.trim().toLowerCase();
      if (levelLabels.has(normalizedLevel)) return `${criteriaName}: level "${level.label}" is duplicated.`;
      levelLabels.add(normalizedLevel);

      if (!Number.isFinite(minScore) || !Number.isFinite(levelMaxScore)) {
        return `${criteriaName} - ${levelName}: range must be valid numbers.`;
      }
      if (minScore < 0 || levelMaxScore < 0) return `${criteriaName} - ${levelName}: range cannot be negative.`;
      if (minScore > levelMaxScore) return `${criteriaName} - ${levelName}: minimum score cannot be higher than maximum score.`;
      if (levelMaxScore > maxScore) return `${criteriaName} - ${levelName}: range cannot exceed criteria max score (${maxScore}).`;

      ranges.push({ min: minScore, max: levelMaxScore, label: level.label.trim() });
    }

    const sortedRanges = ranges.slice().sort((a, b) => a.min - b.min || a.max - b.max);
    for (let i = 1; i < sortedRanges.length; i++) {
      const previous = sortedRanges[i - 1];
      const current = sortedRanges[i];
      if (current.min <= previous.max) {
        return `${criteriaName}: "${current.label}" overlaps with "${previous.label}".`;
      }
    }
  }

  return '';
};

export default function Rubrics() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const userId = user?.id || user?._id || '';
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [criteria, setCriteria] = useState<Criteria[]>(DEFAULT_CRITERIA);
  const [error, setError] = useState('');
  const [expandedRubric, setExpandedRubric] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { version: scopeVersion } = useOperationalScope();

  const load = () => {
    setLoading(true);
    api.get('/rubrics')
      .then((r) => setRubrics(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    api.get('/rubrics')
      .then((r) => setRubrics(r.data))
      .finally(() => setLoading(false));
  }, [scopeVersion]);

  const resetForm = () => {
    setTitle('');
    setCriteria(DEFAULT_CRITERIA);
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const startEdit = (rubric: Rubric) => {
    setTitle(rubric.title);
    setCriteria(rubric.criteria);
    setEditingId(rubric._id);
    setShowForm(true);
    setExpandedRubric(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[0-9]+\.\s*/g, '') // Remove prefixes like "1. "
      .replace(/[^a-z0-9 ]/g, '')  // Remove special characters
      .split(' ')
      .map((word, i) => i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
      .join('')
      .slice(0, 30);
  };

  const updateCriteria = (ci: number, field: keyof Criteria, value: string | number) => {
    setCriteria((prev) => prev.map((c, i) => {
      if (i !== ci) return c;
      const updated = { ...c, [field]: value };
      if (field === 'label' && typeof value === 'string') {
        updated.key = slugify(value);
      }
      return updated;
    }));
  };

  const updateLevel = (ci: number, li: number, field: keyof Level, value: string | number) => {
    setCriteria((prev) => prev.map((c, i) => {
      if (i !== ci) return c;
      return { ...c, levels: c.levels.map((l, j) => j === li ? { ...l, [field]: value } : l) };
    }));
  };

  const addCriteria = () => setCriteria((prev) => [...prev, emptyCriteria()]);
  const removeCriteria = (ci: number) => setCriteria((prev) => prev.filter((_, i) => i !== ci));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const validationError = validateRubricForm(title, criteria);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      if (editingId) {
        await api.put(`/rubrics/${editingId}`, { title, criteria });
      } else {
        await api.post('/rubrics', { title, criteria });
      }
      resetForm();
      load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Error saving rubric'));
    }
  };

  const handleActivate = async (id: string) => {
    await api.patch(`/rubrics/${id}/activate`);
    load();
  };

  const handleDelete = async (rubric: Rubric) => {
    const activeMessage = rubric.isActive
      ? '\n\nThis is the active rubric. If another rubric exists for this subject, it will become active after deletion.'
      : '';
    const ok = await confirm({
      title: 'Delete Rubric?',
      message: `Delete "${rubric.title}"?${activeMessage}\n\nSaved evaluations and results that used this rubric will NOT be deleted.`,
      confirmLabel: 'Delete Rubric',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/rubrics/${rubric._id}`);
      load();
    } catch (err: unknown) {
      notify(getErrorMessage(err, 'Error'), { type: 'error' });
    }
  };

  const levelColor = (label: string) => {
    if (label === 'Excellent') return 'evl-badge-success';
    if (label === 'Good') return 'evl-badge-primary';
    if (label === 'Fair') return 'evl-badge-warning';
    return 'evl-badge-danger';
  };

  const levelBg = (label: string) => {
    if (label === 'Excellent') return 'bg-success/5 border-success/20';
    if (label === 'Good') return 'bg-primary/5 border-primary/20';
    if (label === 'Fair') return 'bg-warning/5 border-warning/20';
    return 'bg-danger/5 border-danger/20';
  };

  const canControlRubric = (rubric: Rubric) => (
    isSuperadmin ||
    getOwnerId(rubric.createdBy) === userId ||
    !rubric.createdBy
  );

  return (
    <div>
      <ConfirmDialog />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 data-tutorial="rubrics" className="evl-page-title">Rubrics</h2>
          <p className="evl-page-subtitle">Define grading criteria with score levels.</p>
        </div>
        {!showForm ? (
          <button onClick={startCreate} className="evl-btn-primary">+ New Rubric</button>
        ) : (
          <button onClick={resetForm} className="evl-btn-secondary">Cancel</button>
        )}
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="evl-card p-6 mb-6">
          <h3 className="text-text font-bold text-sm mb-4">
            {editingId ? 'Edit Rubric' : 'New Rubric'}
          </h3>

          <div className="mb-5">
            <label className="evl-label">Rubric Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required
              className="evl-input max-w-xl" placeholder="e.g. Project Defense Rubric" />
          </div>

          <div className="space-y-6">
            {criteria.map((c, ci) => (
              <div key={ci} className="border border-muted/30 rounded-2xl overflow-hidden bg-surface/30 shadow-sm transition-all duration-200">
                <div className="bg-muted/10 px-5 py-4 border-b border-muted/30 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold">
                      {ci + 1}
                    </span>
                    <h4 className="font-bold text-text text-sm">{c.label || 'New Criteria'}</h4>
                  </div>
                  <button type="button" onClick={() => removeCriteria(ci)}
                    className="text-danger hover:text-danger/70 text-xs font-semibold px-2 py-1 rounded-md hover:bg-danger/5 transition-colors">
                    Remove
                  </button>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
                    <div className="md:col-span-5">
                      <label className="evl-label !mb-1.5">Criteria Name</label>
                      <input value={c.label} onChange={(e) => updateCriteria(ci, 'label', e.target.value)} required
                        className="evl-input" placeholder="e.g. System Functionality" />
                    </div>
                    <div className="md:col-span-4">
                      <label className="evl-label !mb-1.5 flex items-center gap-2">
                        System Key
                        <span className="text-[9px] bg-muted/40 px-1 rounded text-text/65">Auto</span>
                      </label>
                      <input value={c.key} readOnly
                        className="evl-input bg-muted/20 border-muted/30 text-text/65 cursor-not-allowed font-mono text-[11px]" 
                        placeholder="Auto-generated..." />
                    </div>
                    <div className="md:col-span-3">
                      <label className="evl-label !mb-1.5">Max Score</label>
                      <div className="relative">
                        <input type="number" value={c.maxScore} onChange={(e) => updateCriteria(ci, 'maxScore', Number(e.target.value))} required min={1} step="0.01"
                          className="evl-input pr-10" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-text/55 uppercase">pts</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/5 rounded-xl p-4 border border-muted/20">
                    <div className="flex items-center gap-2 mb-4 px-1">
                      <span className="text-[10px] font-extrabold text-text/65 uppercase tracking-widest">Score Level Definitions</span>
                      <div className="h-[1px] flex-1 bg-muted/20"></div>
                    </div>
                    <div className="space-y-4">
                      {c.levels.map((l, li) => (
                        <div key={li} className="bg-surface rounded-lg p-3 border border-muted/10 shadow-sm">
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                            <div className="lg:col-span-3">
                              <label className="text-[9px] font-bold text-text/65 uppercase block mb-1">Level Name</label>
                              <input value={l.label} onChange={(e) => updateLevel(ci, li, 'label', e.target.value)}
                                className={`evl-input !py-1.5 !text-xs font-bold ${l.label === 'Excellent' ? 'text-success' : l.label === 'Poor' ? 'text-danger' : 'text-primary'}`} 
                                placeholder="Label" />
                            </div>
                            <div className="lg:col-span-2">
                              <label className="text-[9px] font-bold text-text/65 uppercase block mb-1">Range</label>
                              <div className="flex items-center gap-2">
                                <input type="number" value={l.minScore} onChange={(e) => updateLevel(ci, li, 'minScore', Number(e.target.value))} min={0} max={c.maxScore || undefined} step="0.01"
                                  className="evl-input !py-1.5 !text-xs text-center" placeholder="Min" />
                                <span className="text-text/55 text-xs">—</span>
                                <input type="number" value={l.maxScore} onChange={(e) => updateLevel(ci, li, 'maxScore', Number(e.target.value))} min={0} max={c.maxScore || undefined} step="0.01"
                                  className="evl-input !py-1.5 !text-xs text-center" placeholder="Max" />
                              </div>
                            </div>
                            <div className="lg:col-span-7">
                              <label className="text-[9px] font-bold text-text/65 uppercase block mb-1">Grading Description</label>
                              <input value={l.description} onChange={(e) => updateLevel(ci, li, 'description', e.target.value)}
                                className="evl-input !py-1.5 !text-xs" placeholder={`Describe what qualifies for ${l.label || 'this level'}...`} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center mt-8">
            <button type="button" onClick={addCriteria}
              className="bg-primary/5 text-primary border border-primary/20 hover:bg-primary/10 px-6 py-2.5 rounded-full text-xs font-bold transition-all duration-200">
              + Add New Evaluation Criteria
            </button>
          </div>

          {error && (
            <div className="bg-danger/5 border border-danger/20 text-danger text-xs p-4 rounded-xl mt-6 font-medium">
              {error}
            </div>
          )}

          <div className="mt-10 pt-6 border-t border-muted/20 flex items-center justify-between">
            <div className="text-xs text-text/70">
              Total Rubric Value: <span className="font-bold text-text">{criteria.reduce((acc, curr) => acc + curr.maxScore, 0)} Points</span>
            </div>
            <button type="submit" className="evl-btn-primary shadow-lg shadow-primary/20">
              {editingId ? 'Update and Save Rubric' : 'Create and Save Rubric'}
            </button>
          </div>
        </form>
      )}

      {/* Rubric list */}
      <div className="space-y-4">
        {loading ? (
          Array(3).fill(0).map((_, i) => <CardSkeleton key={i} />)
        ) : (
          <>
            {rubrics.map((r) => (
              <div key={r._id} className="evl-card overflow-hidden">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-6 py-5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                      R
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <p className="font-bold text-text">{r.title}</p>
                        {r.isActive && <span className="evl-badge-success">Active</span>}
                      </div>
                      <p className="text-text/70 text-xs mt-0.5">
                        {r.criteria.length} criteria · Created {new Date(r.createdAt).toLocaleDateString()}
                      </p>
                      <p className="text-text/60 text-[11px] mt-1 font-semibold">
                        Created by: {getOwnerLabel(r)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center justify-start lg:justify-end">
                    <button onClick={() => setExpandedRubric(expandedRubric === r._id ? null : r._id)}
                      className="evl-btn-ghost">
                      {expandedRubric === r._id ? 'Hide' : 'View'}
                    </button>
                    {canControlRubric(r) && (
                      <>
                        <button onClick={() => startEdit(r)}
                          className="evl-btn-ghost text-primary border-primary/30 hover:bg-primary/5 hover:border-primary/50">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(r)} className="evl-btn-ghost text-danger border-danger/30 hover:bg-danger/5 hover:border-danger/50">
                          Delete
                        </button>
                      </>
                    )}
                    {!r.isActive && canControlRubric(r) && (
                      <button onClick={() => handleActivate(r._id)} className="evl-btn-ghost text-success border-success/30 hover:bg-success/5 hover:border-success/50">
                        Use This Rubric
                      </button>
                    )}
                  </div>
                </div>

                {expandedRubric === r._id && (
                  <div className="border-t border-muted/40 px-6 py-5">
                    <div className="space-y-6">
                      {r.criteria.map((c) => (
                        <div key={c.key}>
                          <div className="flex justify-between items-center mb-3">
                            <p className="font-bold text-text">{c.label}</p>
                            <span className="text-text/70 text-xs font-semibold">{c.maxScore} pts</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                            {c.levels.map((l) => (
                              <div key={l.label} className={`rounded-lg p-4 border ${levelBg(l.label)}`}>
                                <div className="flex items-center justify-between mb-2">
                                  <span className={levelColor(l.label)}>{l.label}</span>
                                  <span className="text-text/65 text-[11px] font-semibold">{l.minScore}–{l.maxScore}</span>
                                </div>
                                <p className="text-text/60 text-xs leading-relaxed">{l.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!rubrics.length && <p className="text-text/70 text-sm">No rubrics yet. Create one to get started.</p>}
          </>
        )}
      </div>
    </div>
  );
}

