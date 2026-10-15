import { useEffect, useState } from 'react';
import api from '../../services/api';
import { notify } from '../../utils/notify';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

interface Instructor {
  _id: string;
  name: string;
  email: string;
  isActive: boolean;
  assignedSubjects?: Array<string | { _id: string; code?: string; title?: string }>;
  subjectLimit?: number;
  csvExportLocked?: boolean;
  gradingLocked?: boolean;
  gradingLockedSubjects?: Array<string | { _id: string; code?: string; title?: string }>;
}

type UserRow = Instructor & { role: string };
interface Subject { _id: string; code: string; title: string; }
interface BackupRow { [key: string]: string | number | null | undefined; }
interface UsageStatus {
  checkedAt: string;
  mongo: {
    database: string;
    collections: number;
    objects: number;
    dataSizeMb: number;
    storageSizeMb: number;
    indexSizeMb: number;
    estimatedTotalMb: number;
    freeTierLimitMb: number;
    estimatedUsagePercent: number;
  };
  render: {
    configured: boolean;
    message?: string;
    error?: string;
    name?: string;
    type?: string;
    plan?: string;
    status?: string;
    note?: string;
  };
  proposalStorage: {
    configured: boolean;
    bucket?: string;
    files?: number;
    folders?: number;
    usedMb?: number;
    freeTierLimitMb?: number;
    usagePercent?: number;
    message?: string;
    error?: string;
  };
}

const getErrorMessage = (err: unknown, fallback: string) => {
  const response = (err as { response?: { data?: { message?: string } } })?.response;
  return response?.data?.message || fallback;
};

const currentSubjectKey = 'evalsys_current_subject_id';
const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const getRefId = (value: string | { _id?: string } | undefined) => (
  typeof value === 'string' ? value : value?._id || ''
);
const downloadCsv = (filename: string, rows: BackupRow[]) => {
  const headers = rows.length ? Object.keys(rows[0]) : ['Status'];
  const dataRows = rows.length ? rows : [{ Status: 'No records found' }];
  const csv = [
    headers.map(csvEscape).join(','),
    ...dataRows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

interface BackgroundJobResponse<T> {
  job: { id: string };
  result?: T;
}

const waitForJob = async <T,>(jobId: string): Promise<T> => {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const status = await api.get(`/jobs/${jobId}`);
    if (status.data.status === 'failed') {
      throw new Error(status.data.error || 'Background job failed');
    }
    if (status.data.status === 'completed') {
      const completed = await api.get<BackgroundJobResponse<T>>(`/jobs/${jobId}/result`);
      return completed.data.result as T;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
  throw new Error('The operation is still running. Please try again shortly.');
};
export default function Subscription() {
  const [loading, setLoading] = useState(true);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [currentSubjectId, setCurrentSubjectId] = useState(() => localStorage.getItem(currentSubjectKey) || '');
  const [limitInputs, setLimitInputs] = useState<Record<string, string>>({});
  const [savingLimitId, setSavingLimitId] = useState<string | null>(null);
  const [savingCsvLockId, setSavingCsvLockId] = useState<string | null>(null);
  const [savingGradingLockId, setSavingGradingLockId] = useState<string | null>(null);
  const [dataAction, setDataAction] = useState('');
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const fetchInstructors = async () => {
    const res = await api.get('/users');
    const instructorRows = (res.data as UserRow[]).filter((u) => u.role === 'admin');
    setInstructors(instructorRows);
    setLimitInputs((prev) => {
      const next = { ...prev };
      instructorRows.forEach((instructor) => {
        if (next[instructor._id] === undefined) {
          next[instructor._id] = String(instructor.subjectLimit ?? 1);
        }
      });
      return next;
    });
  };

  useEffect(() => {
    const init = async () => {
      try {
        const [subjectRes] = await Promise.all([
          api.get('/subjects'),
          fetchInstructors(),
        ]);
        setSubjects(subjectRes.data);
        const saved = localStorage.getItem(currentSubjectKey);
        if (!saved && subjectRes.data[0]?._id) {
          setCurrentSubjectId(subjectRes.data[0]._id);
        }
      } catch {
        // non-critical
      }

      try {
        const usageRes = await api.get('/usage');
        setUsage(usageRes.data);
      } catch {
        // non-critical
      }

      setLoading(false);
    };
    init();
  }, []);

  const handleSaveLimit = async (instructor: Instructor) => {
    const val = parseInt(limitInputs[instructor._id], 10);
    if (!val || val < 1) return;

    setSavingLimitId(instructor._id);
    try {
      const res = await api.patch(`/users/${instructor._id}/subject-limit`, { subjectLimit: val });
      setInstructors((prev) =>
        prev.map((item) => (item._id === instructor._id ? { ...item, subjectLimit: res.data.subjectLimit } : item))
      );
      setLimitInputs((prev) => ({ ...prev, [instructor._id]: String(res.data.subjectLimit) }));
    } catch (err: unknown) {
      notify(getErrorMessage(err, 'Failed to update instructor limit'), { type: 'error' });
    } finally {
      setSavingLimitId(null);
    }
  };

  const handleToggleInstructorCsv = async (instructor: Instructor) => {
    setSavingCsvLockId(instructor._id);
    try {
      const nextLocked = !instructor.csvExportLocked;
      const res = await api.patch(`/users/${instructor._id}/csv-export-lock`, { csvExportLocked: nextLocked });
      setInstructors((prev) =>
        prev.map((item) => (item._id === instructor._id ? { ...item, csvExportLocked: res.data.csvExportLocked } : item))
      );
    } catch (err: unknown) {
      notify(getErrorMessage(err, 'Failed to update CSV export access'), { type: 'error' });
    } finally {
      setSavingCsvLockId(null);
    }
  };

  const isSubjectAssigned = (instructor: Instructor, subjectId = currentSubjectId) => (
    Boolean(subjectId) &&
    (instructor.assignedSubjects || []).some((subject) => getRefId(subject) === subjectId)
  );

  const isSubjectGradingLocked = (instructor: Instructor, subjectId = currentSubjectId) => (
    Boolean(subjectId) &&
    (instructor.gradingLockedSubjects || []).some((subject) => getRefId(subject) === subjectId)
  );

  const handleToggleInstructorGrading = async (instructor: Instructor) => {
    if (!currentSubjectId) return;
    const savingKey = `${instructor._id}:${currentSubjectId}`;
    setSavingGradingLockId(savingKey);
    try {
      const nextLocked = !isSubjectGradingLocked(instructor);
      const res = await api.patch(`/users/${instructor._id}/grading-lock`, {
        subject: currentSubjectId,
        gradingLocked: nextLocked,
      });
      setInstructors((prev) =>
        prev.map((item) => (
          item._id === instructor._id
            ? {
                ...item,
                gradingLocked: res.data.gradingLocked,
                gradingLockedSubjects: res.data.gradingLockedSubjects,
              }
            : item
        ))
      );
    } catch (err: unknown) {
      notify(getErrorMessage(err, 'Failed to update grading access'), { type: 'error' });
    } finally {
      setSavingGradingLockId(null);
    }
  };

  const currentSubject = subjects.find((subject) => subject._id === currentSubjectId) || null;

  const handleSubjectChange = (subjectId: string) => {
    setCurrentSubjectId(subjectId);
    if (subjectId) localStorage.setItem(currentSubjectKey, subjectId);
  };

  const handleExportBackup = async (scope: 'subject' | 'global') => {
    setDataAction(`export-${scope}`);
    try {
      const queued = await api.get('/evaluations/export-all', {
        params: { background: 'true' },
        headers: { 'x-subject-id': scope === 'subject' ? currentSubjectId : '' },
      });
      const rows = await waitForJob<BackupRow[]>(queued.data.job.id);
      const label = scope === 'subject' ? currentSubject?.code || 'subject' : 'global';
      downloadCsv(`evalsys_${label}_backup.csv`, rows);
    } catch (err: unknown) {
      notify(getErrorMessage(err, 'Failed to export backup'), { type: 'error' });
    } finally {
      setDataAction('');
    }
  };

  const handleReset = async (scope: 'subject' | 'global') => {
    const label = scope === 'subject'
      ? `${currentSubject?.code || 'current subject'}`
      : 'the entire platform';
    const ok = await confirm({
      title: scope === 'subject' ? 'Reset Subject?' : 'Global Reset?',
      message: scope === 'subject'
        ? `This will remove active blocks and groups for ${label}. Submitted results will be moved to Archive.`
        : `This will permanently reset evaluation event data for ${label}. Export a backup first.\n\nThis action cannot be undone.`,
      confirmLabel: scope === 'subject' ? 'Reset Subject' : 'Global Reset',
      danger: true,
    });
    if (!ok) return;

    setDataAction(`reset-${scope}`);
    try {
      const confirmText = scope === 'subject'
        ? `RESET ${currentSubject?.code || ''}`
        : 'RESET GLOBAL';
      const queued = await api.post('/evaluations/master-reset', { confirmText }, {
        params: { background: 'true' },
        headers: { 'x-subject-id': scope === 'subject' ? currentSubjectId : '' },
      });
      const result = await waitForJob<{ message?: string }>(queued.data.job.id);
      notify(result.message || (scope === 'subject' ? 'Current subject data reset complete.' : 'Global reset complete.'), { type: 'success' });
    } catch (err: unknown) {
      notify(getErrorMessage(err, 'Reset failed'), { type: 'error' });
    } finally {
      setDataAction('');
    }
  };

  if (loading) {
    return (
      <div>
        <h2 className="evl-page-title mb-6">Manage Subscription</h2>
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-surface border border-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <ConfirmDialog />
      <div className="mb-8">
        <h2 className="evl-page-title">Manage Subscription</h2>
        <p className="evl-page-subtitle">
          Control paid instructor limits and feature access across the platform.
        </p>
      </div>

      <div className="mb-8">
        {usage && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
            <div className="evl-card p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-bold text-text text-sm">MongoDB Storage</h3>
                  <p className="text-text/65 text-xs mt-0.5">{usage.mongo.database}</p>
                </div>
                <span className="evl-badge-primary">{usage.mongo.estimatedUsagePercent}% used</span>
              </div>
              <div className="h-2 rounded-full bg-muted/30 overflow-hidden mb-4">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${Math.min(100, usage.mongo.estimatedUsagePercent)}%` }}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-text/60">Total</p>
                  <p className="text-sm font-black text-text">{usage.mongo.estimatedTotalMb} MB</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-text/60">Limit</p>
                  <p className="text-sm font-black text-text">{usage.mongo.freeTierLimitMb} MB</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-text/60">Collections</p>
                  <p className="text-sm font-black text-text">{usage.mongo.collections}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-text/60">Records</p>
                  <p className="text-sm font-black text-text">{usage.mongo.objects}</p>
                </div>
              </div>
            </div>

            <div className="evl-card p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-bold text-text text-sm">Proposal Storage</h3>
                  <p className="text-text/65 text-xs mt-0.5">
                    {usage.proposalStorage.bucket || 'Supabase Storage'}
                  </p>
                </div>
                <span className={usage.proposalStorage.configured && !usage.proposalStorage.error ? 'evl-badge-success' : 'evl-badge-warning'}>
                  {usage.proposalStorage.configured ? `${usage.proposalStorage.usagePercent ?? 0}% used` : 'Not Configured'}
                </span>
              </div>
              {usage.proposalStorage.configured && !usage.proposalStorage.error ? (
                <>
                  <div className="h-2 rounded-full bg-muted/30 overflow-hidden mb-4">
                    <div
                      className="h-full bg-success rounded-full"
                      style={{ width: `${Math.min(100, usage.proposalStorage.usagePercent ?? 0)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-text/60">Used</p>
                      <p className="text-sm font-black text-text">{usage.proposalStorage.usedMb ?? 0} MB</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-text/60">Limit</p>
                      <p className="text-sm font-black text-text">{usage.proposalStorage.freeTierLimitMb ?? 0} MB</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-text/60">Files</p>
                      <p className="text-sm font-black text-text">{usage.proposalStorage.files ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-text/60">Folders</p>
                      <p className="text-sm font-black text-text">{usage.proposalStorage.folders ?? 0}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-text/60 mt-4 leading-relaxed">
                    This counts files in the EvalSys proposal bucket only.
                  </p>
                </>
              ) : (
                <p className="text-sm text-text/70 leading-relaxed">
                  {usage.proposalStorage.error || usage.proposalStorage.message || 'Proposal storage usage is not available.'}
                </p>
              )}
            </div>

            <div className="evl-card p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-bold text-text text-sm">Render Service</h3>
                  <p className="text-text/65 text-xs mt-0.5">
                    Checked {new Date(usage.checkedAt).toLocaleString()}
                  </p>
                </div>
                <span className={usage.render.configured && !usage.render.error ? 'evl-badge-success' : 'evl-badge-warning'}>
                  {usage.render.configured ? 'Configured' : 'Not Configured'}
                </span>
              </div>
              {usage.render.configured && !usage.render.error ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-text/60">Service</p>
                    <p className="text-sm font-black text-text">{usage.render.name || 'Render'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-text/60">Plan</p>
                    <p className="text-sm font-black text-text">{usage.render.plan || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-text/60">Status</p>
                    <p className="text-sm font-black text-text">{usage.render.status || 'Unknown'}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-text/55 leading-relaxed">
                  {usage.render.error || usage.render.message || 'Render usage is not available.'}
                </p>
              )}
              <p className="text-[11px] text-text/60 mt-4 leading-relaxed">
                Render free-tier hours are account-level, so exact remaining hours may need checking in the Render dashboard.
              </p>
            </div>
          </div>
        )}

        <div className="evl-card overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-muted/30 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-text text-sm">Instructor Subject Limits</h3>
              <p className="text-text/70 text-xs mt-0.5">Set paid allowance and subject-level feature access per instructor.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 min-w-0 w-full xl:w-auto">
              <label htmlFor="grading-subject" className="text-[10px] font-black uppercase tracking-widest text-text/60">
                Grading Subject
              </label>
              <select
                id="grading-subject"
                value={currentSubjectId}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="evl-select !py-2 !text-xs !w-full sm:!w-56 min-w-0"
              >
                {subjects.map((subject) => (
                  <option key={subject._id} value={subject._id}>{subject.code}</option>
                ))}
              </select>
              <span className="text-[10px] font-black uppercase tracking-widest text-text/55 bg-muted/20 px-2 py-1 rounded-md">
                {instructors.length} Instructor{instructors.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {instructors.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-text/65 text-sm">No instructor accounts found.</p>
            </div>
          ) : (
            <table className="evl-table evl-resource-table">
              <thead>
                <tr>
                  <th>Instructor</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th className="text-center">Subjects Used</th>
                  <th className="text-center">Paid Limit</th>
                  <th className="text-center">CSV Export</th>
                  <th className="text-center">Grading</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {instructors.map((instructor) => {
                  const currentLimit = instructor.subjectLimit ?? 1;
                  const subjectCount = instructor.assignedSubjects?.length ?? 0;
                  const inputValue = limitInputs[instructor._id] ?? String(currentLimit);
                  const parsedInput = parseInt(inputValue, 10);
                  const unchanged = parsedInput === currentLimit;
                  const invalid = !parsedInput || parsedInput < 1;
                  const assignedToCurrentSubject = isSubjectAssigned(instructor);
                  const currentSubjectLocked = isSubjectGradingLocked(instructor);
                  const gradingSavingKey = `${instructor._id}:${currentSubjectId}`;

                  return (
                    <tr key={instructor._id}>
                      <td data-label="Instructor">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-black shrink-0">
                            {instructor.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-text text-sm">{instructor.name}</span>
                        </div>
                      </td>
                      <td data-label="Email" className="text-text/70 text-xs">{instructor.email}</td>
                      <td data-label="Status">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${instructor.isActive ? 'bg-success/10 text-success' : 'bg-muted/20 text-text/65'}`}>
                          {instructor.isActive ? 'Active' : 'Blocked'}
                        </span>
                      </td>
                      <td data-label="Subjects Used" className="text-center">
                        <span className="text-xs font-black text-text/60">{subjectCount}/{currentLimit}</span>
                      </td>
                      <td data-label="Paid Limit">
                        <input
                          aria-label={"Paid limit for " + instructor.name}
                          type="number"
                          min={1}
                          max={100}
                          value={inputValue}
                          onChange={(e) => setLimitInputs((prev) => ({ ...prev, [instructor._id]: e.target.value }))}
                          className="evl-input !py-2 text-center max-w-28 mx-auto"
                        />
                      </td>
                      <td data-label="CSV Export" className="text-center">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${instructor.csvExportLocked ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>
                          {instructor.csvExportLocked ? 'Locked' : 'Allowed'}
                        </span>
                      </td>
                      <td data-label="Grading" className="text-center">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${
                          !assignedToCurrentSubject
                            ? 'bg-muted/20 text-text/60'
                            : currentSubjectLocked ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
                        }`}>
                          {!assignedToCurrentSubject ? 'Not Assigned' : currentSubjectLocked ? 'Locked' : 'Allowed'}
                        </span>
                      </td>
                      <td data-label="Actions" className="col-actions">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            onClick={() => handleSaveLimit(instructor)}
                            disabled={savingLimitId === instructor._id || unchanged || invalid}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-primary/30 text-primary bg-primary/5 hover:bg-primary/15 transition-all disabled:opacity-40 whitespace-nowrap"
                          >
                            {savingLimitId === instructor._id ? 'Saving...' : 'Update Limit'}
                          </button>
                          <button
                            onClick={() => handleToggleInstructorCsv(instructor)}
                            disabled={savingCsvLockId === instructor._id}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all disabled:opacity-40 whitespace-nowrap ${
                              instructor.csvExportLocked
                                ? 'border-success/30 text-success bg-success/5 hover:bg-success/15'
                                : 'border-danger/30 text-danger bg-danger/5 hover:bg-danger/15'
                            }`}
                          >
                            {savingCsvLockId === instructor._id
                              ? 'Saving...'
                              : instructor.csvExportLocked ? 'Unlock CSV' : 'Lock CSV'}
                          </button>
                          <button
                            onClick={() => handleToggleInstructorGrading(instructor)}
                            disabled={!assignedToCurrentSubject || savingGradingLockId === gradingSavingKey}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all disabled:opacity-40 whitespace-nowrap ${
                              currentSubjectLocked
                                ? 'border-success/30 text-success bg-success/5 hover:bg-success/15'
                                : 'border-danger/30 text-danger bg-danger/5 hover:bg-danger/15'
                            }`}
                          >
                            {savingGradingLockId === gradingSavingKey
                              ? 'Saving...'
                              : currentSubjectLocked ? 'Unlock Grading' : 'Lock Grading'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="px-6 py-3 border-t border-muted/30 bg-bg/60">
            <p className="text-[11px] text-text/65 leading-relaxed">
              Updating a limit changes how many paid subjects the instructor can manage. CSV export is per instructor. Grading lock applies only to the selected subject.
            </p>
          </div>
        </div>
      </div>

      <div className="evl-card overflow-hidden">
        <div className="px-6 py-4 border-b border-muted/30">
          <h3 className="font-bold text-text text-sm">Data Safety</h3>
          <p className="text-text/70 text-xs mt-0.5">Export backups before resetting scoped or global event data.</p>
        </div>
        <div className="p-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-4 items-end">
          <div>
            <label className="evl-label">Subject Scope</label>
            <select
              value={currentSubjectId}
              onChange={(e) => handleSubjectChange(e.target.value)}
              className="evl-select max-w-xl"
            >
              {subjects.map((subject) => (
                <option key={subject._id} value={subject._id}>{subject.code} - {subject.title}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button
              type="button"
              onClick={() => handleExportBackup('subject')}
              disabled={!currentSubjectId || Boolean(dataAction)}
              className="evl-btn-secondary !py-2 !text-xs"
            >
              {dataAction === 'export-subject' ? 'Exporting...' : 'Export Subject Backup'}
            </button>
            <button
              type="button"
              onClick={() => handleReset('subject')}
              disabled={!currentSubjectId || Boolean(dataAction)}
              className="evl-btn-danger !py-2 !text-xs"
            >
              {dataAction === 'reset-subject' ? 'Resetting...' : 'Reset Subject Data'}
            </button>
            <button
              type="button"
              onClick={() => handleExportBackup('global')}
              disabled={Boolean(dataAction)}
              className="evl-btn-secondary !py-2 !text-xs"
            >
              {dataAction === 'export-global' ? 'Exporting...' : 'Export Global Backup'}
            </button>
            <button
              type="button"
              onClick={() => handleReset('global')}
              disabled={Boolean(dataAction)}
              className="evl-btn-danger !py-2 !text-xs"
            >
              {dataAction === 'reset-global' ? 'Resetting...' : 'Global Reset'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

