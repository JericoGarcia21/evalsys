import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/useAuth';
import { notify } from '../../utils/notify';
import { waitForJob } from '../../services/backgroundJobs';

interface Subject {
  _id: string;
  code: string;
  title: string;
  isActive: boolean;
  createdAt: string;
}

interface Admin {
  _id: string;
  name: string;
  email: string;
  assignedSubjects: Array<string | { _id: string; code?: string; title?: string }>;
  subjectLimit?: number;
}

type UserRow = Admin & { role: string };

const getSubjectId = (subject: string | { _id: string }) =>
  typeof subject === 'string' ? subject : subject._id;

const adminHasSubject = (admin: Admin, subjectId: string) =>
  admin.assignedSubjects.some((subject) => getSubjectId(subject) === subjectId);

const getErrorMessage = (err: unknown, fallback: string) => {
  const response = (err as { response?: { data?: { message?: string } } })?.response;
  return response?.data?.message || fallback;
};

export default function Subjects() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createCode, setCreateCode] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  const [createAdminIds, setCreateAdminIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editSubject, setEditSubject] = useState<Subject | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Assign admins modal (superadmin only)
  const [assignSubject, setAssignSubject] = useState<Subject | null>(null);
  const [assignAdminIds, setAssignAdminIds] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [resetSubject, setResetSubject] = useState<Subject | null>(null);
  const [resetConfirmCode, setResetConfirmCode] = useState('');
  const [resetting, setResetting] = useState(false);

  const fetchSubjects = () =>
    api.get('/subjects', { params: isSuperadmin ? { scope: 'all' } : {} }).then((r) => setSubjects(r.data));

  const fetchAdmins = () =>
    api.get('/users').then((r) => setAdmins((r.data as UserRow[]).filter((u) => u.role === 'admin')));

  useEffect(() => {
    const fetchData = async () => {
      try {
        const subRes = await api.get('/subjects', { params: isSuperadmin ? { scope: 'all' } : {} });
        setSubjects(subRes.data);
      } catch {
        // subjects fetch failed; page still renders
      }

      if (isSuperadmin) {
        try {
          await fetchAdmins();
        } catch {
          // admins fetch failed; subject list still works
        }
      }

      setLoading(false);
    };
    fetchData();
  }, [isSuperadmin]);
  /* ── Create ── */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createCode.trim() || !createTitle.trim()) return;
    setCreating(true);
    try {
      await api.post('/subjects', {
        code: createCode.trim().toUpperCase(),
        title: createTitle.trim(),
        adminIds: isSuperadmin ? createAdminIds : [],
      });
      await fetchSubjects();
      if (isSuperadmin) await fetchAdmins();
      setShowCreate(false);
      setCreateCode('');
      setCreateTitle('');
      setCreateAdminIds([]);
    } catch (err: unknown) {
      notify(getErrorMessage(err, 'Failed to create subject'), { type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  /* ── Edit ── */
  const openEdit = (s: Subject) => {
    setEditSubject(s);
    setEditCode(s.code);
    setEditTitle(s.title);
    setEditActive(s.isActive);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSubject) return;
    setSaving(true);
    try {
      await api.put(`/subjects/${editSubject._id}`, {
        code: editCode.trim().toUpperCase(),
        title: editTitle.trim(),
        isActive: editActive,
      });
      await fetchSubjects();
      setEditSubject(null);
    } catch (err: unknown) {
      notify(getErrorMessage(err, 'Failed to update subject'), { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  /* ── Assign admins ── */
  const openAssign = (s: Subject) => {
    setAssignSubject(s);
    const current = admins
      .filter((a) => adminHasSubject(a, s._id))
      .map((a) => a._id);
    setAssignAdminIds(current);
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignSubject) return;
    setAssigning(true);
    try {
      await api.put(`/subjects/${assignSubject._id}/admins`, { adminIds: assignAdminIds });
      await fetchAdmins();
      setAssignSubject(null);
    } catch (err: unknown) {
      notify(getErrorMessage(err, 'Failed to assign instructors'), { type: 'error' });
    } finally {
      setAssigning(false);
    }
  };

  // Delete modal (superadmin only)
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null);
  const [deleteConfirmCode, setDeleteConfirmCode] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectToDelete) return;
    if (deleteConfirmCode !== subjectToDelete.code) return;
    setDeleting(true);
    try {
      await api.delete(`/subjects/${subjectToDelete._id}`, {
        data: { confirmText: `DELETE ${subjectToDelete.code}` },
      });
      await fetchSubjects();
      if (isSuperadmin) await fetchAdmins();
      setSubjectToDelete(null);
      setDeleteConfirmCode('');
    } catch (err: unknown) {
      notify(getErrorMessage(err, 'Failed to delete subject'), { type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const toggleAssignAdmin = (id: string) =>
    setAssignAdminIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const toggleCreateAdmin = (id: string) =>
    setCreateAdminIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleSubjectReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetSubject || resetConfirmCode !== resetSubject.code) return;
    setResetting(true);
    try {
      const queued = await api.post('/evaluations/master-reset', { confirmText: `RESET ${resetSubject.code}` }, {
        params: { background: 'true' },
        headers: { 'x-subject-id': resetSubject._id },
      });
      const result = await waitForJob<{ message: string }>(queued.data.job.id);
      notify(result.message, { type: 'success' });
      setResetSubject(null);
      setResetConfirmCode('');
    } catch (err: unknown) {
      notify(getErrorMessage(err, 'Failed to reset subject'), { type: 'error' });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row items-start justify-between gap-4">
        <div>
          <h2 className="evl-page-title">Subjects</h2>
          <p className="evl-page-subtitle">
            {isSuperadmin
              ? 'Manage all subjects and assign instructors to each one.'
              : 'View and edit subjects assigned to you.'}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="evl-btn-primary !py-2 !text-xs shrink-0"
        >
          + New Subject
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface border border-muted/30 animate-pulse" />
          ))}
        </div>
      ) : subjects.length === 0 ? (
        <div className="evl-card p-12 text-center">
          <div className="text-text/60 text-4xl mb-3">📚</div>
          <p className="text-text/70 text-sm">No subjects yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="evl-card overflow-hidden">
          <table className="evl-table evl-resource-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Title</th>
                <th className="text-center">Status</th>
                {isSuperadmin && <th>Assigned Instructors</th>}
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => {
                const assigned = admins.filter((a) => adminHasSubject(a, s._id));
                return (
                  <tr key={s._id}>
                    <td data-label="Code">
                      <span className="font-black text-primary font-mono text-sm">{s.code}</span>
                    </td>
                    <td data-label="Title" className="font-semibold text-text">{s.title}</td>
                    <td data-label="Status" className="text-center">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${
                        s.isActive
                          ? 'bg-success/10 text-success'
                          : 'bg-muted/20 text-text/65'
                      }`}>
                        {s.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {isSuperadmin && (
                      <td data-label="Assigned Instructors" className="text-xs text-text/60">
                        {assigned.length > 0
                          ? assigned.map((a) => a.name).join(', ')
                          : <span className="text-text/55 italic">None assigned</span>}
                      </td>
                    )}
                    <td data-label="Actions" className="col-actions">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(s)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-muted text-text/60 hover:text-text hover:border-text/30 transition-all"
                        >
                          Edit
                        </button>
                        {!isSuperadmin && (
                          <button
                            onClick={() => { setResetSubject(s); setResetConfirmCode(''); }}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-danger/30 text-danger bg-danger/5 hover:bg-danger/15 transition-all"
                          >
                            Reset
                          </button>
                        )}
                        {isSuperadmin && (
                          <button
                            onClick={() => { setSubjectToDelete(s); setDeleteConfirmCode(''); }}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-danger/30 text-danger bg-danger/5 hover:bg-danger/15 transition-all"
                          >
                            Delete
                          </button>
                        )}
                        {isSuperadmin && (
                          <button
                            onClick={() => openAssign(s)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-primary/30 text-primary bg-primary/5 hover:bg-primary/15 transition-all"
                          >
                            Assign Instructors
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create Modal ── */}
      {resetSubject && !isSuperadmin && (
        <div className="fixed inset-0 bg-dark/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-lg shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="px-6 py-4 border-b border-danger/20 flex justify-between items-center bg-danger/5">
              <div>
                <h3 className="font-bold text-danger">Reset Subject</h3>
                <p className="text-text/70 text-xs mt-0.5">{resetSubject.code} - {resetSubject.title}</p>
              </div>
              <button onClick={() => setResetSubject(null)} className="text-text/65 hover:text-text text-xl">x</button>
            </div>
            <form onSubmit={handleSubjectReset} className="p-6 space-y-4">
              <div className="bg-warning/5 border border-warning/30 rounded-lg p-4 space-y-2">
                <p className="text-sm font-bold text-text">This starts a fresh evaluation cycle.</p>
                <p className="text-xs text-text/65 leading-relaxed">
                  Current blocks and groups will be removed so this subject can start again.
                </p>
                <p className="text-xs font-bold text-danger">Groups without submitted results cannot be restored.</p>
              </div>
              <div>
                <label className="evl-label">
                  Type <span className="font-black text-danger font-mono">{resetSubject.code}</span> to confirm
                </label>
                <input
                  className="evl-input"
                  value={resetConfirmCode}
                  onChange={(e) => setResetConfirmCode(e.target.value.toUpperCase())}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setResetSubject(null)} className="evl-btn-secondary flex-1">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetting || resetConfirmCode !== resetSubject.code}
                  className="evl-btn-danger flex-1 disabled:opacity-40"
                >
                  {resetting ? 'Resetting...' : 'Reset Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-dark/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="px-6 py-4 border-b border-muted/30 flex justify-between items-center bg-bg">
              <h3 className="font-bold text-text">New Subject</h3>
              <button onClick={() => setShowCreate(false)} className="text-text/65 hover:text-text text-xl">×</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="evl-label">Subject Code</label>
                <input
                  className="evl-input"
                  placeholder="e.g. IPT"
                  value={createCode}
                  onChange={(e) => setCreateCode(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="evl-label">Subject Title</label>
                <input
                  className="evl-input"
                  placeholder="e.g. Integrative Programming Technologies"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  required
                />
              </div>
              {isSuperadmin && admins.length > 0 && (
                <div>
                  <label className="evl-label">Assign Instructors (optional)</label>
                  <div className="mt-1 space-y-1 max-h-40 overflow-y-auto border border-muted rounded-lg p-2 bg-bg">
                    {admins.map((a) => {
                      const count = a.assignedSubjects.length;
                      const limit = a.subjectLimit ?? 1;
                      const checked = createAdminIds.includes(a._id);
                      const wouldExceed = !checked && count >= limit;

                      return (
                      <label key={a._id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer ${wouldExceed ? 'opacity-50 bg-muted/10' : 'hover:bg-surface'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={wouldExceed}
                          onChange={() => !wouldExceed && toggleCreateAdmin(a._id)}
                          className="accent-primary"
                        />
                        <span className="text-xs text-text font-medium">{a.name}</span>
                        <span className="text-[10px] text-text/65 ml-auto">{count}/{limit} subjects</span>
                      </label>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="evl-btn-secondary flex-1 !py-2.5 !text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="evl-btn-primary flex-1 !py-2.5 !text-xs">
                  {creating ? 'Creating...' : 'Create Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editSubject && (
        <div className="fixed inset-0 bg-dark/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="px-6 py-4 border-b border-muted/30 flex justify-between items-center bg-bg">
              <h3 className="font-bold text-text">Edit Subject</h3>
              <button onClick={() => setEditSubject(null)} className="text-text/65 hover:text-text text-xl">×</button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="evl-label">Subject Code</label>
                <input
                  className="evl-input"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="evl-label">Subject Title</label>
                <input
                  className="evl-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="editActive"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="accent-primary w-4 h-4"
                />
                <label htmlFor="editActive" className="text-sm font-medium text-text cursor-pointer">
                  Active (visible to registration links)
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditSubject(null)} className="evl-btn-secondary flex-1 !py-2.5 !text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="evl-btn-primary flex-1 !py-2.5 !text-xs">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Assign Instructors Modal (superadmin only) ── */}
      {assignSubject && (
        <div className="fixed inset-0 bg-dark/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="px-6 py-4 border-b border-muted/30 flex justify-between items-center bg-bg">
              <div>
                <h3 className="font-bold text-text">Assign Instructors</h3>
                <p className="text-text/70 text-xs mt-0.5">{assignSubject.code} — {assignSubject.title}</p>
              </div>
              <button onClick={() => setAssignSubject(null)} className="text-text/65 hover:text-text text-xl">×</button>
            </div>
            <form onSubmit={handleAssign} className="p-6 space-y-4">
              {admins.length === 0 ? (
                <p className="text-text/70 text-sm text-center py-4">No instructor accounts found.</p>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto border border-muted rounded-lg p-2 bg-bg">
                  {admins.map((a) => {
                    const count = a.assignedSubjects.length;
                    const limit = a.subjectLimit ?? 1;
                    const checked = assignAdminIds.includes(a._id);
                    const alreadyAssigned = assignSubject ? adminHasSubject(a, assignSubject._id) : false;
                    const wouldExceed = !checked && !alreadyAssigned && count >= limit;

                    return (
                    <label key={a._id} className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer ${wouldExceed ? 'opacity-50 bg-muted/10' : 'hover:bg-surface'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={wouldExceed}
                        onChange={() => !wouldExceed && toggleAssignAdmin(a._id)}
                        className="accent-primary"
                      />
                      <span className="text-xs text-text font-medium">{a.name}</span>
                      <span className="text-[10px] text-text/65 ml-auto">{count}/{limit} subjects</span>
                    </label>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setAssignSubject(null)} className="evl-btn-secondary flex-1 !py-2.5 !text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={assigning} className="evl-btn-primary flex-1 !py-2.5 !text-xs">
                  {assigning ? 'Saving...' : 'Save Assignments'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── Delete Subject Modal (superadmin only) ── */}
      {subjectToDelete && (
        <div className="fixed inset-0 bg-dark/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="px-6 py-4 border-b border-danger/20 flex justify-between items-center bg-danger/5">
              <div>
                <h3 className="font-bold text-danger">Delete Subject</h3>
                <p className="text-text/70 text-xs mt-0.5">{subjectToDelete.code} — {subjectToDelete.title}</p>
              </div>
              <button onClick={() => setSubjectToDelete(null)} className="text-text/65 hover:text-text text-xl">×</button>
            </div>
            <form onSubmit={handleDelete} className="p-6 space-y-4">
              <div className="bg-danger/5 border border-danger/20 rounded-xl p-4 space-y-2">
                <p className="text-sm font-bold text-danger">This will permanently delete:</p>
                <ul className="text-xs text-text/70 space-y-1 list-disc list-inside">
                  <li>All blocks (sections) under this subject</li>
                  <li>All student groups in those blocks</li>
                  <li>Submitted evaluations will move to Archive</li>
                  <li>All rubrics created for this subject</li>
                  <li>All registration links for this subject</li>
                </ul>
                <p className="text-xs font-bold text-danger mt-2">Active subject setup cannot be restored after deletion.</p>
              </div>
              <div>
                <label className="evl-label">
                  Type <span className="font-black text-danger font-mono">{subjectToDelete.code}</span> to confirm
                </label>
                <input
                  className="evl-input"
                  placeholder={`Type ${subjectToDelete.code} to confirm`}
                  value={deleteConfirmCode}
                  onChange={(e) => setDeleteConfirmCode(e.target.value)}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setSubjectToDelete(null); setDeleteConfirmCode(''); }}
                  className="evl-btn-secondary flex-1 !py-2.5 !text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleting || deleteConfirmCode !== subjectToDelete.code}
                  className="flex-1 !py-2.5 !text-xs px-4 rounded-lg font-bold text-white bg-danger hover:bg-danger/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting...' : 'Delete Everything'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

