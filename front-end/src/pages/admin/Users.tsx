import { useEffect, useState } from 'react';
import api from '../../services/api';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/useAuth';
import { notify } from '../../utils/notify';
import PasswordField from '../../components/PasswordField';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

interface Subject { _id: string; code: string; title: string; }
interface User { _id: string; name: string; email: string; role: string; isActive: boolean; assignedSubjects?: Subject[]; }
interface ResetTarget { _id: string; name: string; }
interface ImportIssue { row: number; message: string; }
interface ImportReport { type: 'success' | 'error'; title: string; message: string; issues: ImportIssue[]; }

const roleText = (role: string) => {
  if (role === 'superadmin') return 'Super Admin';
  if (role === 'admin') return 'Instructor';
  return 'Panel';
};

const getErrorMessage = (err: unknown, fallback: string) => {
  const response = (err as { response?: { data?: { message?: string } } })?.response;
  return response?.data?.message || fallback;
};

const emailUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/@evalsys\.com$/i, '')
    .replace(/@/g, '')
    .replace(/[^a-z0-9._-]/g, '');

const isStrongPassword = (password: string) =>
  password.length >= 8 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9]/.test(password);

const passwordRuleText = 'Use 8+ chars with uppercase, lowercase, number, and symbol.';
const pageSizeOptions = [10, 25, 50];

const parseCsvRow = (line: string) => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
};

const generatePassword = () => {
  const words = ['Blue', 'River', 'Maple', 'Bright', 'Silver', 'Cloud', 'North', 'Stone', 'Green', 'Cedar', 'Clear', 'Rapid'];
  const pickWord = () => words[Math.floor(Math.random() * words.length)];
  const number = Math.floor(10 + Math.random() * 90);
  const symbol = ['!', '@', '#', '$', '?'][Math.floor(Math.random() * 5)];
  return `${pickWord()}-${pickWord()}-${number}${symbol}`;
};

const generateRandomPassword = () => {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const symbols = '!@#$%&*?';
  const all = lower + upper + numbers + symbols;
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const required = [pick(upper), pick(lower), pick(numbers), pick(symbols)];
  const rest = Array.from({ length: 8 }, () => pick(all));

  return [...required, ...rest]
    .sort(() => Math.random() - 0.5)
    .join('');
};

export default function Users() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'panel', createdBy: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetCopyMessage, setResetCopyMessage] = useState('');
  const [resetting, setResetting] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(() => new Set());
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const pageTitle = isSuperadmin ? 'Accounts' : 'Panel Accounts';
  const pageSubtitle = isSuperadmin
    ? 'Create, review, and manage platform accounts by role.'
    : 'Create and manage evaluator panel accounts.';
  const visibleRoles = isSuperadmin ? ['superadmin', 'admin', 'panel'] : ['panel'];
  const activeCount = users.filter((item) => item.isActive).length;
  const activeInstructors = users.filter((item) => item.role === 'admin' && item.isActive);
  const panelOwnerRequired = isSuperadmin && form.role === 'panel';
  const createGridClass = isSuperadmin && form.role === 'panel'
    ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 items-start'
    : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_170px] gap-4 items-start';
  const normalizedSearch = search.trim().toLowerCase();
  const filteredUsers = users.filter((item) => {
    const matchesRole = !roleFilter || item.role === roleFilter;
    const matchesStatus = !statusFilter || (statusFilter === 'active' ? item.isActive : !item.isActive);
    const matchesSearch = !normalizedSearch || [
      item.name,
      item.email,
      roleText(item.role),
      item.assignedSubjects?.map((subject) => `${subject.code} ${subject.title}`).join(' ') || '',
    ].join(' ').toLowerCase().includes(normalizedSearch);
    return matchesRole && matchesStatus && matchesSearch;
  });
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const paginatedUsers = filteredUsers.slice(pageStart, pageStart + pageSize);
  const startDisplay = filteredUsers.length ? pageStart + 1 : 0;
  const endDisplay = Math.min(pageStart + pageSize, filteredUsers.length);
  // Accounts are shown in one unified list (not split by role).
  const hasAccountFilters = Boolean(search || roleFilter || statusFilter);
  const selectedUsers = users.filter((item) => selectedAccountIds.has(item._id));
  const visiblePageIds = paginatedUsers.map((item) => item._id);
  const allVisibleSelected = visiblePageIds.length > 0 && visiblePageIds.every((id) => selectedAccountIds.has(id));

  const load = () => {
    setLoading(true);
    api.get('/users')
      .then((r) => setUsers(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.get('/users')
      .then((r) => setUsers(r.data))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const username = emailUsername(form.email);
    if (!username) {
      setError('Email username is required');
      return;
    }
    if (isSuperadmin && form.role === 'panel' && !form.createdBy) {
      setError('Select the instructor who owns this panel account');
      return;
    }
    if (!isStrongPassword(form.password)) {
      setError(passwordRuleText);
      return;
    }
    try {
      await api.post('/users', { ...form, email: username });
      setForm({ name: '', email: '', password: '', role: 'panel', createdBy: '' });
      load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Error'));
    }
  };


  const toggleAccountSelection = (id: string) => {
    setSelectedAccountIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisibleSelection = () => {
    setSelectedAccountIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visiblePageIds.forEach((id) => next.delete(id));
      } else {
        visiblePageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const clearSelectedAccounts = () => setSelectedAccountIds(new Set());

  const handleBulkStatus = async (makeActive: boolean) => {
    const targets = selectedUsers.filter((item) => item.isActive !== makeActive);
    if (!targets.length) {
      notify(`Selected accounts are already ${makeActive ? 'active' : 'blocked'}.`, { type: 'info' });
      return;
    }
    const ok = await confirm({
      title: makeActive ? 'Unblock Accounts?' : 'Block Accounts?',
      message: `${makeActive ? 'Unblock' : 'Block'} ${targets.length} selected account${targets.length === 1 ? '' : 's'}?`,
      confirmLabel: makeActive ? 'Unblock Accounts' : 'Block Accounts',
      danger: !makeActive,
    });
    if (!ok) return;
    await Promise.all(targets.map((item) => api.patch(`/users/${item._id}/toggle`)));
    notify(`${targets.length} account${targets.length === 1 ? '' : 's'} ${makeActive ? 'unblocked' : 'blocked'}.`, { type: 'success' });
    clearSelectedAccounts();
    load();
  };

  const handleBulkDelete = async () => {
    if (!selectedUsers.length) return;
    const ok = await confirm({
      title: 'Delete Selected Accounts?',
      message: `Delete ${selectedUsers.length} selected account${selectedUsers.length === 1 ? '' : 's'}? Submitted panel results will be kept.`,
      confirmLabel: 'Delete Accounts',
      danger: true,
    });
    if (!ok) return;
    await Promise.all(selectedUsers.map((item) => api.delete(`/users/${item._id}`)));
    notify(`${selectedUsers.length} account${selectedUsers.length === 1 ? '' : 's'} deleted.`, { type: 'success' });
    clearSelectedAccounts();
    load();
  };
  const handleToggle = async (id: string) => {
    await api.patch(`/users/${id}/toggle`);
    load();
  };

  const handleDelete = async (id: string) => {
    const target = users.find((item) => item._id === id);
    const ok = await confirm({
      title: 'Delete Account?',
      message: target?.role === 'panel'
        ? `Delete ${target.name}? Submitted results from this panel will be kept.`
        : `Delete ${target?.name || 'this account'}?`,
      confirmLabel: 'Delete Account',
      danger: true,
    });
    if (!ok) return;
    await api.delete(`/users/${id}`);
    load();
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError('');
    if (!isStrongPassword(resetPassword)) {
      setResetError(passwordRuleText);
      return;
    }
    if (resetPassword !== resetConfirm) {
      setResetError('Passwords do not match.');
      return;
    }
    setResetting(true);
    try {
      const res = await api.patch(`/users/${resetTarget._id}/reset-password`, { newPassword: resetPassword });
      notify(res.data.message, { type: 'success' });
      setResetTarget(null);
      setResetPassword('');
      setResetConfirm('');
      setResetCopyMessage('');
      load();
    } catch (err: unknown) {
      setResetError(getErrorMessage(err, 'Failed to reset password'));
    } finally {
      setResetting(false);
    }
  };

  const copyResetPassword = async () => {
    if (!resetPassword) return;
    try {
      await navigator.clipboard.writeText(resetPassword);
      setResetCopyMessage('Temporary password copied successfully.');
    } catch {
      setResetError('Copy failed. Please copy the password manually.');
    }
  };

  const generateResetPassword = () => {
    const password = generatePassword();
    setResetPassword(password);
    setResetConfirm(password);
    setResetError('');
    setResetCopyMessage('');
  };

  const openTemporaryPasswordModal = (target: ResetTarget) => {
    const password = generatePassword();
    setResetTarget(target);
    setResetPassword(password);
    setResetConfirm(password);
    setResetError('');
    setResetCopyMessage('');
  };

  const downloadTemplate = () => {
    const rows = isSuperadmin
      ? [
          'name,email,password,role,createdBy,subjectLimit',
          'Juan Dela Cruz,juan,Panel@123,panel,<instructor_id>,',
          'Maria Clara,maria,Admin@123,admin,,1',
        ]
      : [
          'name,email,password,role',
          'Juan Dela Cruz,juan,Panel@123,panel',
          'Maria Clara,maria.panel,Panel@123,panel',
        ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'user_import_template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportReport(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = String(event.target?.result || '');
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (!lines.length) {
        setImportReport({
          type: 'error',
          title: 'Import file is empty',
          message: 'Upload a CSV file with a header row and at least one account row.',
          issues: [],
        });
        return;
      }

      const headers = parseCsvRow(lines[0]).map((header) => header.trim().toLowerCase());
      const requiredHeaders = ['name', 'email', 'password', 'role'];
      const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
      if (missingHeaders.length) {
        setImportReport({
          type: 'error',
          title: 'Import headers are incomplete',
          message: `Missing required column${missingHeaders.length === 1 ? '' : 's'}: ${missingHeaders.join(', ')}.`,
          issues: [],
        });
        return;
      }

      const issues: ImportIssue[] = [];
      const rows: Array<Record<string, string>> = [];
      const seenEmails = new Set<string>();
      const selectedInstructorId = window.localStorage.getItem('evalsys_current_instructor_id') || '';

      lines.slice(1).forEach((line, index) => {
        const rowNumber = index + 2;
        const values = parseCsvRow(line);
        const row = headers.reduce<Record<string, string>>((acc, header, cellIndex) => {
          acc[header] = values[cellIndex]?.trim() || '';
          return acc;
        }, {});
        const role = (row.role || 'panel').toLowerCase();
        const email = emailUsername(row.email || '');

        if (!row.name) issues.push({ row: rowNumber, message: 'Name is required.' });
        if (!email) issues.push({ row: rowNumber, message: 'Email username is required and must only use letters, numbers, dots, underscores, or hyphens.' });
        if (!row.password) issues.push({ row: rowNumber, message: 'Password is required.' });
        if (row.password && !isStrongPassword(row.password)) issues.push({ row: rowNumber, message: passwordRuleText });
        if (!visibleRoles.includes(role)) issues.push({ row: rowNumber, message: `Role must be ${visibleRoles.map(roleText).join(' or ')}.` });
        if (email && seenEmails.has(email)) issues.push({ row: rowNumber, message: 'Duplicate email username in this CSV file.' });
        if (isSuperadmin && role === 'panel' && !row.createdby && !selectedInstructorId) {
          issues.push({ row: rowNumber, message: 'Panel rows need a createdBy instructor ID, or select an instructor context before importing.' });
        }

        if (email) seenEmails.add(email);
        rows.push({
          name: row.name,
          email,
          password: row.password,
          role,
          createdBy: row.createdby || selectedInstructorId,
          subjectLimit: row.subjectlimit,
        });
      });

      if (!rows.length) {
        setImportReport({
          type: 'error',
          title: 'No account rows found',
          message: 'The CSV only contains a header row. Add at least one account row and try again.',
          issues: [],
        });
        return;
      }

      if (issues.length) {
        setImportReport({
          type: 'error',
          title: 'Import needs attention',
          message: `${issues.length} issue${issues.length === 1 ? '' : 's'} found. Fix the CSV and upload it again.`,
          issues,
        });
        notify('CSV import has validation errors. Review the import details on the Accounts page.', { type: 'error' });
        return;
      }

      try {
        const res = await api.post('/users/bulk', { users: rows });
        const backendErrors = (res.data.errors || []).map((message: string) => ({ row: 0, message }));
        const skipped = Number(res.data.skipped || 0);
        const created = Number(res.data.created || 0);
        setImportReport({
          type: skipped || backendErrors.length ? 'error' : 'success',
          title: skipped || backendErrors.length ? 'Import finished with skipped rows' : 'Import complete',
          message: `Created: ${created}. Skipped: ${skipped}.`,
          issues: backendErrors,
        });
        notify(`Import complete. Created: ${created}. Skipped: ${skipped}.`, { type: created ? 'success' : 'error' });
        load();
      } catch (err: unknown) {
        const message = getErrorMessage(err, 'Error during bulk import');
        setImportReport({
          type: 'error',
          title: 'Import failed',
          message,
          issues: [],
        });
        notify(message, { type: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };
  return (
    <div>
      <ConfirmDialog />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="evl-page-title">{pageTitle}</h2>
          <p className="evl-page-subtitle">{pageSubtitle}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadTemplate} className="evl-btn-secondary !text-xs !py-1.5">
            Download Template
          </button>
          <label className="evl-btn-primary !text-xs !py-1.5 cursor-pointer">
            Bulk Import (CSV)
            <input type="file" accept=".csv" onChange={handleBulkUpload} className="hidden" />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="evl-card p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-text/65">Total Accounts</p>
          <p className="text-2xl font-black text-text mt-1">{users.length}</p>
        </div>
        <div className="evl-card p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-text/65">Active</p>
          <p className="text-2xl font-black text-success mt-1">{activeCount}</p>
        </div>
        <div className="evl-card p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-text/65">{isSuperadmin ? 'Panels' : 'Blocked'}</p>
          <p className="text-2xl font-black text-primary mt-1">
            {isSuperadmin ? users.filter((item) => item.role === 'panel').length : users.length - activeCount}
          </p>
        </div>
      </div>
      {importReport && (
        <div className={`mb-6 rounded-lg border px-5 py-4 ${importReport.type === 'success' ? 'border-success/25 bg-success/10' : 'border-danger/25 bg-danger/10'}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className={`text-sm font-black ${importReport.type === 'success' ? 'text-success' : 'text-danger'}`}>{importReport.title}</h3>
              <p className="text-sm text-text/75 mt-1">{importReport.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setImportReport(null)}
              className="text-[10px] font-black uppercase tracking-widest text-text/50 hover:text-text"
            >
              Dismiss
            </button>
          </div>
          {importReport.issues.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-muted/30 bg-surface/70">
              {importReport.issues.slice(0, 20).map((issue, index) => (
                <div key={`${issue.row}-${index}`} className="px-3 py-2 text-xs text-text/75 border-b border-muted/20 last:border-b-0">
                  <span className="font-black text-text">{issue.row ? `Row ${issue.row}` : 'Server'}:</span> {issue.message}
                </div>
              ))}
              {importReport.issues.length > 20 && (
                <div className="px-3 py-2 text-xs font-bold text-text/60">
                  {importReport.issues.length - 20} more issue{importReport.issues.length - 20 === 1 ? '' : 's'} not shown.
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Add form */}
      <div className="evl-card p-6 mb-6">
        <h3 className="text-text font-bold text-sm mb-4">Create New Account</h3>
        <form onSubmit={handleAdd}>
          <div className={createGridClass}>
            <div>
              <label className="evl-label">Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                className="evl-input" placeholder="Full name" />
            </div>
            <div>
              <label className="evl-label">Email</label>
              <div className="flex">
                <input
                  type="text"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: emailUsername(e.target.value) })}
                  required
                  className="evl-input rounded-r-none"
                  placeholder="username"
                />
                <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-primary/30 bg-primary/5 text-xs font-black text-primary">
                  @evalsys.com
                </span>
              </div>
              <p className="text-[11px] text-text/60 font-semibold mt-1.5">Type only the username. The domain is always @evalsys.com.</p>
            </div>
            <div>
              <label className="evl-label">Password</label>
              <div className="flex">
                <PasswordField
                  value={form.password}
                  onChange={(value) => setForm({ ...form, password: value })}
                  className="flex-1"
                  inputClassName="rounded-r-none font-mono"
                  placeholder="Generate or type"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, password: generateRandomPassword() })}
                  className="px-3 rounded-r-lg border border-l-0 border-muted bg-bg text-xs font-bold text-primary hover:bg-primary/5 whitespace-nowrap"
                >
                  Generate
                </button>
              </div>
              <p className={`text-[11px] font-semibold mt-1.5 ${form.password && !isStrongPassword(form.password) ? 'text-danger' : 'text-text/60'}`}>
                {passwordRuleText}
              </p>
            </div>
            <div>
              <label className="evl-label">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, createdBy: e.target.value === 'panel' ? form.createdBy : '' })}
                className="evl-select">
                <option value="panel">Panel</option>
                {isSuperadmin && <option value="admin">Instructor</option>}
              </select>
            </div>
            {isSuperadmin && form.role === 'panel' && (
              <div>
                <label className="evl-label">Instructor Owner</label>
                <select
                  value={form.createdBy}
                  onChange={(e) => setForm({ ...form, createdBy: e.target.value })}
                  required
                  className="evl-select"
                >
                  <option value="">Select instructor</option>
                  {activeInstructors.map((instructor) => (
                      <option key={instructor._id} value={instructor._id}>
                        {instructor.name}
                      </option>
                    ))}
                </select>
                {!activeInstructors.length && (
                  <p className="text-[10px] text-danger mt-1">Create an active instructor first.</p>
                )}
              </div>
            )}
            <div className={isSuperadmin && form.role === 'panel' ? 'xl:col-span-5 flex items-center gap-4 pt-1' : 'flex items-end'}>
              <button
                type="submit"
                disabled={panelOwnerRequired && (!form.createdBy || !activeInstructors.length)}
                className="evl-btn-primary disabled:opacity-40 w-full xl:w-auto"
              >
                Create Account
              </button>
            </div>
          </div>
          {error && <p className="text-danger text-sm font-medium mt-3">{error}</p>}
        </form>
      </div>

      <div className="evl-card p-4 mb-5">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,1fr)_160px_150px_130px_auto] gap-3 items-end">
          <div>
            <label className="evl-label">Search Accounts</label>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="evl-input !py-2"
              placeholder="Search name, email, role, or subject..."
            />
          </div>
          <div>
            <label className="evl-label">Role</label>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="evl-select !py-2"
            >
              <option value="">All roles</option>
              {visibleRoles.map((role) => (
                <option key={role} value={role}>{roleText(role)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="evl-label">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="evl-select !py-2"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
          <div>
            <label className="evl-label">Page Size</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="evl-select !py-2"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setRoleFilter('');
              setStatusFilter('');
              setPage(1);
            }}
            disabled={!hasAccountFilters}
            className="evl-btn-secondary !py-2.5 !text-xs disabled:opacity-40"
          >
            Clear Filters
          </button>
        </div>
        <p className="mt-3 text-[11px] font-semibold text-text/60">
          Showing {startDisplay}-{endDisplay} of {filteredUsers.length} matching account{filteredUsers.length === 1 ? '' : 's'}.
        </p>
        <div className="mt-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-lg border border-muted/30 bg-bg/60 px-3 py-3">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-text/70">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleVisibleSelection}
              disabled={!visiblePageIds.length}
              className="h-4 w-4 accent-primary"
            />
            Select visible accounts
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-text/60">
              {selectedUsers.length} selected
            </span>
            <button
              type="button"
              onClick={() => handleBulkStatus(false)}
              disabled={!selectedUsers.length}
              className="evl-btn-secondary !py-2 !px-3 !text-xs disabled:opacity-40"
            >
              Block Selected
            </button>
            <button
              type="button"
              onClick={() => handleBulkStatus(true)}
              disabled={!selectedUsers.length}
              className="evl-btn-secondary !py-2 !px-3 !text-xs disabled:opacity-40"
            >
              Unblock Selected
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={!selectedUsers.length}
              className="evl-btn-danger !py-2 !px-3 !text-xs disabled:opacity-40"
            >
              Delete Selected
            </button>
            {selectedUsers.length > 0 && (
              <button
                type="button"
                onClick={clearSelectedAccounts}
                className="text-[10px] font-black uppercase tracking-widest text-text/50 hover:text-text px-2"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Account groups */}
      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : (
        <div className="evl-card overflow-hidden">
          <div className="px-5 py-4 border-b border-muted/30 flex items-center justify-between bg-bg/50">
            <div>
              <h3 className="text-sm font-black text-text">Accounts</h3>
              <p className="text-[11px] text-text/65 mt-0.5">
                {paginatedUsers.length} account{paginatedUsers.length !== 1 ? 's' : ''} on this page
              </p>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md bg-muted/20 text-text/60">
              {paginatedUsers.filter((item) => item.isActive).length} Active
            </span>
          </div>

          {paginatedUsers.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-text/65">
              No accounts found.
            </div>
          ) : (
            <div className="divide-y divide-muted/30">
              {paginatedUsers.map((u) => (
                <div key={u._id} className="grid grid-cols-1 lg:grid-cols-[32px_1.4fr_1.6fr_120px_260px] gap-3 px-5 py-4 items-center">
                  <div>
                    <input
                      type="checkbox"
                      checked={selectedAccountIds.has(u._id)}
                      onChange={() => toggleAccountSelection(u._id)}
                      aria-label={`Select ${u.name}`}
                      className="h-4 w-4 accent-primary"
                    />
                  </div>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-text truncate">{u.name}</p>
                      <p className="text-[11px] text-text/60">{roleText(u.role)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-text/55 truncate">{u.email}</p>
                  <div>
                    <span className={u.isActive ? 'evl-badge-success' : 'evl-badge-danger'}>
                      {u.isActive ? 'Active' : 'Blocked'}
                    </span>
                  </div>
                  <div className="flex items-center justify-start lg:justify-end gap-2 whitespace-nowrap">
                    <button onClick={() => handleToggle(u._id)}
                      className="evl-btn-ghost text-primary border-primary/30 hover:bg-primary/5 hover:border-primary/50">
                      {u.isActive ? 'Block' : 'Unblock'}
                    </button>
                    <button onClick={() => openTemporaryPasswordModal({ _id: u._id, name: u.name })}
                      className="evl-btn-ghost text-primary border-primary/30 hover:bg-primary/5 hover:border-primary/50">
                      Temp Pass
                    </button>
                    <button onClick={() => handleDelete(u._id)}
                      className="evl-btn-ghost text-danger border-danger/30 hover:text-danger hover:bg-danger/5 hover:border-danger/50">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {filteredUsers.length > 0 && (
            <div className="evl-card px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-[11px] text-text/65 font-semibold">
                Showing {startDisplay}-{endDisplay} of {filteredUsers.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-muted text-text/60 hover:text-text disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-[11px] font-bold text-text/70 px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-muted text-text/60 hover:text-text disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {resetTarget && (
        <div className="fixed inset-0 z-[100] bg-dark/60 flex items-center justify-center p-4">
          <form onSubmit={handleResetPassword} className="w-full max-w-md bg-surface border border-muted/40 rounded-lg shadow-xl p-6">
            <h3 className="font-extrabold text-text text-lg">Set Temporary Password</h3>
            <p className="text-text/60 text-sm mt-1">
              Give this password to <strong>{resetTarget.name}</strong>. They can use it to sign in, then EvalSys will require them to change it.
            </p>
            {resetError && <div className="evl-alert-error mt-4">{resetError}</div>}
            {resetCopyMessage && (
              <div className="mt-4 rounded-lg border border-success/25 bg-success/10 px-4 py-3 text-sm font-semibold text-success">
                {resetCopyMessage}
              </div>
            )}
            <div className="mt-5">
              <label className="evl-label">Temporary Password</label>
              <div className="flex">
                <PasswordField
                  value={resetPassword}
                  onChange={setResetPassword}
                  className="flex-1"
                  inputClassName="rounded-r-none font-mono"
                  placeholder="Generate or type temporary password"
                  autoComplete="new-password"
                  defaultVisible
                />
                <button
                  type="button"
                  onClick={generateResetPassword}
                  className="px-3 border border-l-0 border-muted bg-bg text-xs font-bold text-primary hover:bg-primary/5 whitespace-nowrap"
                >
                  Generate
                </button>
                <button
                  type="button"
                  onClick={copyResetPassword}
                  disabled={!resetPassword}
                  className="px-3 rounded-r-lg border border-l-0 border-muted bg-bg text-xs font-bold text-primary hover:bg-primary/5 whitespace-nowrap disabled:opacity-40"
                >
                  Copy
                </button>
              </div>
              <p className="text-[11px] text-text/55 font-semibold mt-1.5">
                This is the password they will use if they forgot their old password. They must change it after signing in.
              </p>
            </div>
            <div className="mt-4">
              <label className="evl-label">Confirm Temporary Password</label>
              <PasswordField
                value={resetConfirm}
                onChange={setResetConfirm}
                autoComplete="new-password"
              />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setResetTarget(null)} disabled={resetting} className="evl-btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={resetting} className="evl-btn-primary">
                {resetting ? 'Saving...' : 'Save Temporary Password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

