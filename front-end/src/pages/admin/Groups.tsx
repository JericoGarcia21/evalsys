import { getApiMessage } from '../../utils/apiError';
import { useEffect, useState } from 'react';
import api from '../../services/api';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { formatMemberList, formatMemberName, memberSearchText, type Member, type StructuredMember } from '../../utils/members';
import { notify } from '../../utils/notify';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useOperationalScope } from '../../hooks/useOperationalScope';

interface Section { _id: string; name: string; block: string; }
interface ProposalFile { path?: string; originalName?: string; mimeType?: string; size?: number; uploadedAt?: string; }
interface Group {
  _id: string; name: string;
  section: Section;
  members: Member[];
  proposalFile?: ProposalFile;
}

type MemberFormRow = StructuredMember & { legacyName?: string };

const emptyMember = (): MemberFormRow => ({ lastName: '', firstName: '', middleName: '' });

const toMemberRows = (members: Member[] = []): MemberFormRow[] => {
  if (!members.length) return [emptyMember()];
  return members.map((member) => {
    if (typeof member === 'string') {
      return { ...emptyMember(), legacyName: member };
    }
    return {
      lastName: member.lastName || '',
      firstName: member.firstName || '',
      middleName: member.middleName || '',
    };
  });
};

const normalizeMemberRows = (rows: MemberFormRow[]) => rows
  .map((member) => {
    const legacyName = member.legacyName?.trim();
    if (legacyName) return legacyName;
    return {
      lastName: member.lastName.trim(),
      firstName: member.firstName.trim(),
      middleName: member.middleName?.trim() || '',
    };
  })
  .filter((member) => {
    if (typeof member === 'string') return Boolean(member);
    return Boolean(member.lastName || member.firstName || member.middleName);
  });

const hasInvalidStructuredMembers = (rows: MemberFormRow[]) => rows.some((member) => {
  if (member.legacyName?.trim()) return false;
  const hasAnyValue = Boolean(member.lastName.trim() || member.firstName.trim() || member.middleName?.trim());
  return hasAnyValue && (!member.lastName.trim() || !member.firstName.trim());
});

const updateMemberRow = (
  rows: MemberFormRow[],
  index: number,
  field: keyof MemberFormRow,
  value: string
) => rows.map((member, i) => {
  if (i !== index) return member;
  const next = { ...member, [field]: value };
  if (field !== 'legacyName') delete next.legacyName;
  return next;
});

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

const pageSizeOptions = [10, 25, 50];

export default function Groups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [form, setForm] = useState({ name: '', section: '' });
  const [memberRows, setMemberRows] = useState<MemberFormRow[]>([emptyMember()]);
  const [error, setError] = useState('');
  const [filterBlock, setFilterBlock] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editForm, setEditForm] = useState({ name: '', section: '' });
  const [editMemberRows, setEditMemberRows] = useState<MemberFormRow[]>([emptyMember()]);
  const [loading, setLoading] = useState(true);
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { version: scopeVersion } = useOperationalScope();



  const load = (showLoader = true) => {
    if (showLoader) setLoading(true);
    api.get('/groups')
      .then((r) => setGroups(r.data))
      .catch(err => setError(getApiMessage(err, 'Failed to load groups')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.get('/groups').then(r => setGroups(r.data)).catch(err => setError(getApiMessage(err, 'Failed to load groups'))).finally(() => setLoading(false));
    api.get('/sections').then((r) => setSections(r.data)).catch(err => setError(getApiMessage(err, 'Failed to load blocks')));
  }, [scopeVersion]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (hasInvalidStructuredMembers(memberRows)) {
      setError('Each structured member must have a last name and first name.');
      return;
    }

    const members = normalizeMemberRows(memberRows);
    if (!members.length) {
      setError('Add at least one member.');
      return;
    }

    try {
      await api.post('/groups', { ...form, members });
      setForm({ name: '', section: '' });
      setMemberRows([emptyMember()]);
      load();
    } catch (err: unknown) {
      setError(getApiMessage(err, 'Error'));
    }
  };

  const startEdit = (g: Group) => {
    setEditingGroup(g);
    setEditForm({
      name: g.name,
      section: typeof g.section === 'string' ? g.section : g.section?._id || '',
    });
    setEditMemberRows(toMemberRows(g.members));
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup) return;
    if (hasInvalidStructuredMembers(editMemberRows)) {
      notify('Each structured member must have a last name and first name.', { type: 'error' });
      return;
    }

    const members = normalizeMemberRows(editMemberRows);
    if (!members.length) {
      notify('Add at least one member.', { type: 'error' });
      return;
    }

    try {
      await api.put(`/groups/${editingGroup._id}`, { ...editForm, members });
      setEditingGroup(null);
      load();
    } catch (err: unknown) {
      notify(getApiMessage(err, 'Update failed'), { type: 'error' });
    }
  };

  const addMemberRow = () => setMemberRows((current) => [...current, emptyMember()]);
  const removeMemberRow = (index: number) => {
    setMemberRows((current) => current.length === 1 ? current : current.filter((_, i) => i !== index));
  };
  const addEditMemberRow = () => setEditMemberRows((current) => [...current, emptyMember()]);
  const removeEditMemberRow = (index: number) => {
    setEditMemberRows((current) => current.length === 1 ? current : current.filter((_, i) => i !== index));
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Delete Group?',
      message: 'This removes the active group. Submitted results will be moved to Archive.',
      confirmLabel: 'Delete Group',
      danger: true,
    });
    if (!ok) return;
    await api.delete(`/groups/${id}`);
    load();
  };

  const downloadTemplate = () => {
    const csvContent = [
      'name,block,lastName,firstName,middleName',
      'Group Omega,21-ITE-04,Dela Cruz,Juan,Reyes',
      'Group Omega,21-ITE-04,Santos,Maria,Clara',
      'Group Delta,21-ITE-05,Ibarra,Crisostomo,',
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "group_import_template.csv";
    link.click();
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      const [headerLine, ...dataLines] = lines;
      const headers = parseCsvRow(headerLine).map((header) => header.trim().toLowerCase());
      const grouped = new Map<string, { name: string; block: string; members: Member[] }>();

      dataLines.forEach((line) => {
        const values = parseCsvRow(line);
        const row = headers.reduce<Record<string, string>>((acc, header, index) => {
          acc[header] = values[index] || '';
          return acc;
        }, {});
        const name = row.name?.trim();
        const block = row.block?.trim();
        if (!name || !block) return;

        const key = `${name.toLowerCase()}::${block.toLowerCase()}`;
        const current = grouped.get(key) || { name, block, members: [] };
        const legacyMembers = row.members?.trim();
        const lastName = row.lastname?.trim();
        const firstName = row.firstname?.trim();
        const middleName = row.middlename?.trim();

        if (legacyMembers) {
          current.members.push(...legacyMembers.split(';').map((member) => member.trim()).filter(Boolean));
        } else if (lastName || firstName || middleName) {
          current.members.push({ lastName, firstName, middleName });
        }

        grouped.set(key, current);
      });

      const data = Array.from(grouped.values());

      try {
        const res = await api.post('/groups/bulk', { groups: data });
        notify(`Import Complete!\nCreated: ${res.data.created}\nSkipped: ${res.data.skipped}`, { type: 'success' });
        load();
      } catch (err: unknown) {
        notify(getApiMessage(err, 'Error during bulk import'), { type: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const filteredGroups = groups.filter((g) => {
    const sId = typeof g.section === 'string' ? g.section : g.section?._id;
    const matchesBlock = !filterBlock || sId === filterBlock;
    const searchText = [
      g.name,
      typeof g.section === 'string' ? '' : g.section?.block,
      formatMemberList(g.members, ' '),
      ...g.members.map(memberSearchText),
    ].join(' ').toLowerCase();
    const matchesSearch = !search.trim() || searchText.includes(search.trim().toLowerCase());
    return matchesBlock && matchesSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const paginatedGroups = filteredGroups.slice(pageStart, pageStart + pageSize);
  const startDisplay = filteredGroups.length ? pageStart + 1 : 0;
  const endDisplay = Math.min(pageStart + pageSize, filteredGroups.length);

  return (
    <div>
      <ConfirmDialog />
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h2 className="evl-page-title">Groups</h2>
          <p className="evl-page-subtitle">Create groups and add members. Panel judges are managed per block via the Sections page.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadTemplate} className="evl-btn-secondary !text-xs !py-1.5">
            Download Template
          </button>
          <label className="evl-btn-primary !text-xs !py-1.5 cursor-pointer">
            Bulk Import (CSV)
            <input type="file" accept=".csv" onChange={handleBulkUpload} className="hidden" />
          </label>
        </div>
      </div>

      {/* Add form */}
      <div className="evl-card p-6 mb-6">
        <h3 className="text-text font-bold text-sm mb-4">Add New Group</h3>
        <form onSubmit={handleAdd}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="evl-label">Group Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                className="evl-input" placeholder="e.g. Group Alpha" />
            </div>
            <div>
              <label className="evl-label">Section / Block</label>
              <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} required
                className="evl-select">
                <option value="">Select block</option>
                {sections.map((s) => <option key={s._id} value={s._id}>{s.block}</option>)}
              </select>
            </div>
          </div>

          <MemberRowsEditor
            rows={memberRows}
            setRows={setMemberRows}
            onAdd={addMemberRow}
            onRemove={removeMemberRow}
          />

          <div className="flex items-center gap-4 mt-5">
            <button type="submit" className="evl-btn-primary">Add Group</button>
            {error && <p className="text-danger text-sm font-medium">{error}</p>}
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-4 px-1">
        <div className="flex items-center gap-3">
          <h3 className="text-text font-bold text-sm">Group List</h3>
          <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
            {filterBlock || search ? `${filteredGroups.length} of ${groups.length}` : groups.length} Groups
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(220px,320px)_auto_auto] gap-2 items-center">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="evl-input !py-2 !text-xs bg-surface"
            placeholder="Search group, block, or member..."
          />
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-text/65 uppercase tracking-widest whitespace-nowrap">Filter by Block:</span>
            <select
              value={filterBlock}
              onChange={(e) => {
                setFilterBlock(e.target.value);
                setPage(1);
              }}
              className="evl-select !py-2 !px-3 !text-xs !w-auto bg-surface"
            >
              <option value="">All Blocks</option>
              {sections.map((s) => <option key={s._id} value={s._id}>{s.block}</option>)}
            </select>
          </div>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="evl-select !py-2 !px-3 !text-xs !w-auto bg-surface"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>{size} / page</option>
            ))}
          </select>
        </div>
      </div>
      {loading ? (
        <TableSkeleton rows={8} cols={4} />
      ) : (
        <div className="evl-card overflow-x-auto">
          <table data-tutorial="instructor-groups" className="evl-table evl-groups-table">
            <thead>
              <tr>
                <th>Group</th>
                <th>Block</th>
                <th>Members</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedGroups.map((g) => (
                <tr key={g._id}>
                  <td data-label="Group" className="font-semibold text-text">{g.name}</td>
                  <td data-label="Block" className="text-text/70">{g.section?.block}</td>
                  <td data-label="Members" className="text-text/70 text-xs">
                    {g.members.length > 0 ? (
                      <details>
                        <summary className="cursor-pointer whitespace-nowrap font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">
                          {g.members.length} {g.members.length === 1 ? 'member' : 'members'}
                        </summary>
                        <ul className="mt-2 w-40 max-w-full space-y-1 whitespace-normal break-words">
                          {g.members.map((member, index) => <li key={index}>{formatMemberName(member)}</li>)}
                        </ul>
                      </details>
                    ) : '—'}
                  </td>
                  <td data-label="Actions" className="col-actions">
                    <div className="flex flex-wrap sm:flex-nowrap justify-end gap-2">
                      {g.proposalFile?.path ? (
                        <a data-tutorial="group-proposal" href={`/proposal/${g._id}`} target="_blank" rel="noreferrer" className="evl-btn-ghost text-success border-success/30 hover:bg-success/5 hover:border-success/50">
                          View Proposal
                        </a>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] font-bold border border-muted/40 text-text/65 bg-muted/10 whitespace-nowrap">
                          No Proposal
                        </span>
                      )}
                      <button onClick={() => startEdit(g)} className="evl-btn-ghost text-primary border-primary/30 hover:bg-primary/5 hover:border-primary/50">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(g._id)} className="evl-btn-ghost text-danger border-danger/30 hover:text-danger hover:bg-danger/5 hover:border-danger/50">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredGroups.length && (
                <tr><td colSpan={4} className="text-center text-text/70 py-12">No groups found.</td></tr>
              )}
            </tbody>
          </table>
          {filteredGroups.length > 0 && (
            <div className="px-5 py-3 border-t border-muted/30 bg-bg/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-[11px] text-text/65 font-semibold">
                Showing {startDisplay}-{endDisplay} of {filteredGroups.length}
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

      {editingGroup && (
        <EditModal 
          group={editingGroup} 
          form={editForm} 
          setForm={setEditForm} 
          memberRows={editMemberRows}
          setMemberRows={setEditMemberRows}
          onAddMember={addEditMemberRow}
          onRemoveMember={removeEditMemberRow}
          sections={sections} 
          onSave={handleEditSubmit} 
          onCancel={() => setEditingGroup(null)} 
        />
      )}
    </div>
  );
}

function MemberRowsEditor({
  rows,
  setRows,
  onAdd,
  onRemove,
  compact = false,
}: {
  rows: MemberFormRow[];
  setRows: React.Dispatch<React.SetStateAction<MemberFormRow[]>>;
  onAdd: () => void;
  onRemove: (index: number) => void;
  compact?: boolean;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <label className="evl-label !mb-0">Members</label>
        <button
          type="button"
          onClick={onAdd}
          className="text-xs font-bold text-primary bg-primary/10 hover:bg-primary/15 px-3 py-1.5 rounded-lg transition-colors"
        >
          + Add Member
        </button>
      </div>
      <div className={compact ? 'grid grid-cols-1 xl:grid-cols-2 gap-3' : 'space-y-3'}>
        {rows.map((member, index) => (
          <div key={index} className="rounded-xl border border-muted/30 bg-bg/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-black text-text/70 uppercase tracking-widest">Member {index + 1}</p>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="text-[10px] font-black text-danger uppercase tracking-widest hover:underline"
                >
                  Remove
                </button>
              )}
            </div>

            {member.legacyName !== undefined ? (
              <div>
                <label className="text-[10px] font-bold text-text/65 uppercase block mb-1">Old Full Name</label>
                <input
                  value={member.legacyName}
                  onChange={(e) => setRows((current) => updateMemberRow(current, index, 'legacyName', e.target.value))}
                  className="evl-input !py-2 !text-sm"
                  placeholder="Old member name"
                />
                <p className="text-[10px] text-text/60 mt-1.5">
                  This is old data. It will stay as a full-name record unless replaced with structured fields.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-text/65 uppercase block mb-1">Last Name</label>
                  <input
                    value={member.lastName}
                    onChange={(e) => setRows((current) => updateMemberRow(current, index, 'lastName', e.target.value))}
                    required
                    className="evl-input !py-2 !text-sm"
                    placeholder="Garcia"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-text/65 uppercase block mb-1">First Name</label>
                  <input
                    value={member.firstName}
                    onChange={(e) => setRows((current) => updateMemberRow(current, index, 'firstName', e.target.value))}
                    required
                    className="evl-input !py-2 !text-sm"
                    placeholder="Jerico"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-text/65 uppercase block mb-1">Middle Name</label>
                  <input
                    value={member.middleName}
                    onChange={(e) => setRows((current) => updateMemberRow(current, index, 'middleName', e.target.value))}
                    className="evl-input !py-2 !text-sm"
                    placeholder="Bautista"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-text/60 mt-3 font-medium">Last Name and First Name are required for structured members. Middle Name is optional.</p>
    </div>
  );
}

function EditModal({ group, form, setForm, memberRows, setMemberRows, onAddMember, onRemoveMember, sections, onSave, onCancel }: { 
  group: Group;
  form: { name: string; section: string };
  setForm: React.Dispatch<React.SetStateAction<{ name: string; section: string }>>;
  memberRows: MemberFormRow[];
  setMemberRows: React.Dispatch<React.SetStateAction<MemberFormRow[]>>;
  onAddMember: () => void;
  onRemoveMember: (index: number) => void;
  sections: Section[];
  onSave: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-dark/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-muted/30 flex justify-between items-center bg-bg">
          <h3 className="font-bold text-text">Edit Group: {group.name}</h3>
          <button onClick={onCancel} className="text-text/65 hover:text-text text-xl">×</button>
        </div>
        <form onSubmit={onSave} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="evl-label">Group Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="evl-input"
              />
            </div>
            <div>
              <label className="evl-label">Section / Block</label>
              <select
                value={form.section}
                onChange={(e) => setForm({ ...form, section: e.target.value })}
                required
                className="evl-select"
              >
                <option value="">Select block</option>
                {sections.map((s) => <option key={s._id} value={s._id}>{s.block}</option>)}
              </select>
            </div>
          </div>
          <MemberRowsEditor
            rows={memberRows}
            setRows={setMemberRows}
            onAdd={onAddMember}
            onRemove={onRemoveMember}
            compact
          />
          <div className="flex gap-3 pt-2">
            <button type="submit" className="evl-btn-primary flex-1 py-2.5">Save Changes</button>
            <button type="button" onClick={onCancel} className="evl-btn-secondary px-6 py-2.5">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

