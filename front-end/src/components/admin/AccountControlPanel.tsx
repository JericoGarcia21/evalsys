import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { getApiMessage } from '../../utils/apiError';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

interface Account {
  _id: string; name: string; email: string; role: string; isActive: boolean; subjectLimit?: number;
  assignedSubjects?: Array<{ _id: string; code: string; title: string }>;
}
interface Sessions {
  sessions: Array<{ _id: string; createdAt: string; lastSeenAt: string; expiresAt: string; ip?: string; userAgent?: string; isCurrent: boolean }>;
  total: number;
}
interface Checklist {
  counts: Record<string, number>;
  checklist: Array<{ label: string; complete: boolean }>;
  reviewedAt: string | null;
}
interface TransferPreview {
  source: { name: string }; target: { name: string };
  subjects: Array<{ _id: string; code: string; title: string }>;
  counts: Record<string, number>;
}
interface Credential { _id: string; name: string; email: string; temporaryPassword: string }
const roleName = (role: string) => role === 'superadmin' ? 'Super Admin' : role === 'admin' ? 'Instructor' : 'Panel';
const date = (value: string) => new Date(value).toLocaleString();

function useControlData<T>(url: string, revision: number) {
  const key = `${url}:${revision}`;
  const [result, setResult] = useState<{ key: string; data?: T; error?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api.get<T>(url, { signal: controller.signal, headers: { 'Cache-Control': 'no-cache' } })
      .then(response => { if (!controller.signal.aborted) setResult({ key, data: response.data }); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setResult({ key, error: getApiMessage(error, 'Failed to load account controls') }); });
    return () => controller.abort();
  }, [url, key]);
  return { loading: result?.key !== key, data: result?.key === key ? result.data : undefined, error: result?.key === key ? result.error : undefined };
}

function Feedback({ error, message }: { error?: string; message?: string }) {
  return <>{error && <p role="alert" className="text-sm text-danger mt-3">{error}</p>}{message && <p role="status" className="text-sm text-success mt-3">{message}</p>}</>;
}

export default function AccountControlPanel() {
  const [revision, setRevision] = useState(0);
  const result = useControlData<Account[]>('/users', revision);
  const [accountId, setAccountId] = useState('');
  const [view, setView] = useState('accounts');
  const reload = () => setRevision(value => value + 1);
  const users = result.data || [];
  const selected = users.find(user => user._id === accountId) || users.find(user => user.role === 'admin') || users[0];
  const instructors = users.filter(user => user.role === 'admin');
  return (
    <section aria-labelledby="account-control-heading">
      <div className="evl-card p-5 mb-5">
        <h3 id="account-control-heading" className="font-bold text-text">Account control</h3>
        <p className="text-sm text-text/70 mt-2">Manage active sessions, instructor offboarding, temporary passwords, and complete subject workspace transfers. No records are deleted by these tools.</p>
        <div className="flex flex-wrap gap-2 mt-4" aria-label="Account control views">
          {[['accounts', 'Sessions & lifecycle'], ['resets', 'Bulk password reset'], ['transfer', 'Ownership transfer']].map(([value, label]) => <button type="button" key={value} aria-pressed={view === value} className={view === value ? 'evl-btn-primary' : 'evl-btn-secondary'} onClick={() => setView(value)}>{label}</button>)}
        </div>
      </div>
      {result.loading ? <p role="status">Loading accounts...</p> : result.error ? <div className="evl-card p-5"><Feedback error={result.error} /><button type="button" className="evl-btn-secondary mt-3" onClick={reload}>Retry accounts</button></div> : view === 'resets' ? <BulkPasswordReset instructors={instructors} /> : view === 'transfer' ? <OwnershipTransfer instructors={instructors} reload={reload} /> : (
        <>
          <div className="evl-card p-5 mb-5">
            <label htmlFor="control-account" className="evl-label">Account to inspect</label>
            <select id="control-account" className="evl-select" value={selected?._id || ''} onChange={event => setAccountId(event.target.value)}>
              {!users.length && <option value="">No accounts found</option>}
              {users.map(user => <option key={user._id} value={user._id}>{user.name} · {roleName(user.role)} · {user.isActive ? 'Active' : 'Inactive'}</option>)}
            </select>
          </div>
          {selected && <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
            <SessionManager key={`sessions-${selected._id}`} account={selected} />
            {selected.role === 'admin' && <InstructorLifecycle key={`lifecycle-${selected._id}`} account={selected} reloadAccounts={reload} />}
          </div>}
        </>
      )}
    </section>
  );
}

function SessionManager({ account }: { account: Account }) {
  const [revision, setRevision] = useState(0);
  const result = useControlData<Sessions>(`/account-control/accounts/${account._id}/sessions`, revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const revoke = async (sessionId?: string) => {
    if (!await confirm({ title: 'Force Sign-out?', message: `Sign ${account.name} out of ${sessionId ? 'this session' : 'all sessions'}? The next authenticated request will be denied. Already-running requests cannot be recalled.`, confirmLabel: 'Force Sign-out', danger: true })) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await api.post(`/account-control/accounts/${account._id}/${sessionId ? `sessions/${sessionId}/revoke` : 'revoke-sessions'}`, { confirmText: 'SIGN OUT' });
      setMessage(response.data.message); setRevision(value => value + 1);
    } catch (err: unknown) { setError(getApiMessage(err, 'Failed to revoke sessions')); }
    finally { setBusy(false); }
  };
  return (
    <section className="evl-card p-5" aria-labelledby="sessions-heading">
      <ConfirmDialog />
      <h4 id="sessions-heading" className="font-bold text-text">Active sessions</h4>
      <p className="text-xs text-text/65 mt-2">Browser and IP details are hints, not verified device identities. Last seen updates at most every five minutes.</p>
      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" className="evl-btn-secondary" disabled={busy || result.loading} onClick={() => setRevision(value => value + 1)}>Refresh sessions</button>
        <button type="button" className="evl-btn-danger" disabled={busy || result.loading || Boolean(result.error) || !result.data?.total} onClick={() => revoke()}>Sign out all sessions</button>
      </div>
      <Feedback error={error || result.error} message={message} />
      {result.loading ? <p role="status" className="mt-4 text-sm">Loading sessions...</p> : result.data && <>
        <p className="text-sm text-text/70 mt-4">{result.data.total} active sessions{result.data.total > 100 ? ' (showing the latest 100)' : ''}</p>
        {!result.data.sessions.length && <p className="mt-3 text-sm text-text/70">No active sessions for this account.</p>}
        <ul className="divide-y divide-muted/30 mt-3">
          {result.data.sessions.map(session => <li key={session._id} className="py-4 space-y-2">
            <p className="text-xs text-text break-all">{session.userAgent || 'Unknown browser'}{session.isCurrent ? ' · Your current session' : ''}</p>
            <p className="text-xs text-text/65">IP: {session.ip || 'Unknown'} · Signed in: {date(session.createdAt)}</p>
            <p className="text-xs text-text/65">Last seen: {date(session.lastSeenAt)} · Expires: {date(session.expiresAt)}</p>
            <button type="button" className="evl-btn-danger" disabled={busy} onClick={() => revoke(session._id)}>Sign out session</button>
          </li>)}
        </ul>
      </>}
    </section>
  );
}

function InstructorLifecycle({ account, reloadAccounts }: { account: Account; reloadAccounts: () => void }) {
  const [revision, setRevision] = useState(0);
  const result = useControlData<Checklist>(`/account-control/instructors/${account._id}/offboarding`, revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const run = async (review: boolean) => {
    const action = review ? 'Record Archive Review' : account.isActive ? 'Deactivate Instructor' : 'Activate Instructor';
    if (!await confirm({ title: `${action}?`, message: review ? 'Confirm you reviewed the retained archive and retention requirements. This acknowledgement does not delete or certify records.' : `${action}: ${account.name}. Deactivation revokes sessions and preserves all data. Reactivation never restores old sessions.`, confirmLabel: action, danger: !review && account.isActive })) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = review ? await api.post(`/account-control/instructors/${account._id}/offboarding-review`, { confirmText: 'REVIEW ARCHIVE' }) : await api.patch(`/account-control/instructors/${account._id}/status`, { isActive: !account.isActive, confirmText: account.isActive ? 'DEACTIVATE' : 'ACTIVATE' });
      setMessage(response.data.message); setRevision(value => value + 1);
      if (!review) reloadAccounts();
    } catch (err: unknown) { setError(getApiMessage(err, 'Instructor action failed')); }
    finally { setBusy(false); }
  };
  return <section className="evl-card p-5" aria-labelledby="offboarding-heading">
    <ConfirmDialog />
    <h4 id="offboarding-heading" className="font-bold text-text">Instructor lifecycle & offboarding</h4>
    <p className="text-sm text-text/70 mt-2">{account.name} is {account.isActive ? 'active' : 'inactive'}. Complete the checklist before considering account removal.</p>
    <div className="flex flex-wrap gap-2 mt-4">
      <button type="button" className={account.isActive ? 'evl-btn-danger' : 'evl-btn-primary'} disabled={busy} onClick={() => run(false)}>{account.isActive ? 'Deactivate instructor' : 'Activate instructor'}</button>
      <button type="button" className="evl-btn-secondary" disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh checklist</button>
    </div>
    <Feedback error={error || result.error} message={message} />
    {result.loading ? <p role="status" className="mt-4 text-sm">Loading offboarding checklist...</p> : result.data && <>
      <ul className="mt-4 space-y-2">{result.data.checklist.map(item => <li key={item.label} className="text-sm"><span className={item.complete ? 'text-success' : 'text-text/70'}>{item.complete ? 'Complete' : 'Pending'}</span> · {item.label}</li>)}</ul>
      <dl className="grid grid-cols-2 gap-2 mt-5 text-xs">{Object.entries(result.data.counts).map(([label, value]) => <div key={label} className="rounded-lg bg-bg p-2"><dt className="break-words text-text/65">{label.replace(/([A-Z])/g, ' $1')}</dt><dd className="font-bold text-text">{value}</dd></div>)}</dl>
      <p className="text-xs text-text/65 mt-3">Archive count uses retained instructor email snapshots. Review the Archive page for historical records.</p>
      <Link to="/legacy-data" className="evl-btn-secondary mt-3">Open Archive</Link>
      <button type="button" className="evl-btn-secondary mt-3 ml-2" disabled={busy} onClick={() => run(true)}>Record archive review</button>
    </>}
  </section>;
}

function BulkPasswordReset({ instructors }: { instructors: Account[] }) {
  const [ids, setIds] = useState<string[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const reset = async () => {
    if (!await confirm({ title: 'Reset Instructor Passwords?', message: `Reset ${ids.length} instructor passwords and sign out all their sessions? Each instructor must change their temporary password at next sign-in. Deliver credentials privately.`, confirmLabel: 'Reset Passwords', danger: true })) return;
    setBusy(true); setError(''); setMessage(''); setCredentials([]);
    try {
      const response = await api.post('/account-control/password-resets', { instructorIds: ids, confirmText: 'RESET PASSWORDS' });
      setCredentials(response.data.passwords); setMessage(response.data.message); setIds([]);
    } catch (err: unknown) { setError(getApiMessage(err, 'Bulk password reset failed')); }
    finally { setBusy(false); }
  };
  return <section className="evl-card p-5" aria-labelledby="bulk-reset-heading">
    <ConfirmDialog />
    <h4 id="bulk-reset-heading" className="font-bold text-text">Bulk instructor password reset</h4>
    <p className="text-sm text-text/70 mt-2">Select up to 20 instructors. Passwords are generated securely, displayed only in this view, and never saved to browser storage. This action requires database transaction support.</p>
    <fieldset disabled={busy} className="mt-4 space-y-2"><legend className="sr-only">Instructors to reset</legend>{instructors.map(user => <label key={user._id} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={ids.includes(user._id)} disabled={!ids.includes(user._id) && ids.length >= 20} onChange={event => setIds(previous => event.target.checked ? [...previous, user._id] : previous.filter(id => id !== user._id))} />{user.name} ({user.email})</label>)}</fieldset>
    <button type="button" className="evl-btn-danger mt-4" disabled={busy || !ids.length} onClick={reset}>{busy ? 'Resetting...' : `Reset ${ids.length} instructor passwords`}</button>
    <Feedback error={error} message={message} />
    {credentials.length > 0 && <div className="mt-5 border border-warning/40 rounded-lg p-4">
      <h5 className="font-bold text-text">Temporary passwords — deliver privately</h5>
      <p className="text-sm text-text/70 mt-2">Leaving this view or dismissing this list clears these credentials. Do not share screenshots.</p>
      <div className="flex flex-wrap gap-2 my-3"><button type="button" className="evl-btn-secondary" onClick={() => setVisible(value => !value)}>{visible ? 'Hide passwords' : 'Show passwords'}</button><button type="button" className="evl-btn-secondary" onClick={() => { setCredentials([]); setVisible(false); setMessage('Temporary passwords dismissed.'); }}>Dismiss passwords</button></div>
      <ul className="space-y-3">{credentials.map(item => <li key={item._id}><label className="text-sm font-bold">{item.name} · {item.email}<input aria-label={`Temporary password for ${item.name}`} readOnly type={visible ? 'text' : 'password'} value={item.temporaryPassword} className="evl-input mt-1 font-mono" /></label><button type="button" className="evl-btn-secondary mt-2" onClick={async () => {
        try { await navigator.clipboard.writeText(item.temporaryPassword); setMessage(`Password copied for ${item.name}. Clear the clipboard after delivery.`); }
        catch { setError('Clipboard unavailable. Show and copy the password manually.'); }
      }}>Copy password for {item.name}</button></li>)}</ul>
    </div>}
  </section>;
}

function OwnershipTransfer({ instructors, reload }: { instructors: Account[]; reload: () => void }) {
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const source = instructors.find(user => user._id === sourceId);
  const request = { sourceId, targetId, subjectIds };
  const inspect = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage(''); setPreview(null); setConfirmation('');
    try { setPreview((await api.post('/account-control/transfers/preview', request)).data); }
    catch (err: unknown) { setError(getApiMessage(err, 'Transfer preview failed')); }
    finally { setBusy(false); }
  };
  const execute = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await api.post('/account-control/transfers', { ...request, confirmText: confirmation });
      setPreview(null); setConfirmation(''); setSubjectIds([]); setMessage(response.data.message);
      // Refresh the parent only after the completion message can be read by the user.
    } catch (err: unknown) { setError(getApiMessage(err, 'Ownership transfer failed')); }
    finally { setBusy(false); }
  };
  return <section className="evl-card p-5" aria-labelledby="transfer-heading">
    <h4 id="transfer-heading" className="font-bold text-text">Transfer subject workspaces</h4>
    <p className="text-sm text-text/70 mt-2">Transfers move whole selected subject workspaces, including all their source-owned blocks, groups, rubrics, panels, links, and chat history. Grades, member records, and proposal files are preserved.</p>
    <p className="text-sm text-text/70 mt-2">Deactivate the source and enable maintenance first. Shared panels outside the selection and destination collisions are rejected. MongoDB transactions are required; there is no partial-transfer fallback.</p>
    <Link to="/system-control?view=maintenance" className="evl-btn-secondary mt-3">Open maintenance controls</Link>
    <form onSubmit={inspect} className="mt-5 space-y-4">
      <fieldset disabled={busy} className="space-y-4"><legend className="sr-only">Transfer selection</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label htmlFor="transfer-source" className="evl-label">Source instructor (inactive)</label><select id="transfer-source" required className="evl-select" value={sourceId} onChange={event => { setSourceId(event.target.value); setSubjectIds([]); setPreview(null); }}><option value="">Choose source</option>{instructors.filter(user => !user.isActive).map(user => <option key={user._id} value={user._id}>{user.name}</option>)}</select></div>
          <div><label htmlFor="transfer-target" className="evl-label">Destination instructor (active)</label><select id="transfer-target" required className="evl-select" value={targetId} onChange={event => { setTargetId(event.target.value); setPreview(null); }}><option value="">Choose destination</option>{instructors.filter(user => user.isActive).map(user => <option key={user._id} value={user._id}>{user.name} · limit {user.subjectLimit}</option>)}</select></div>
        </div>
        <fieldset className="space-y-2"><legend className="text-sm font-bold mb-2">Subjects to transfer (up to 20)</legend>{(source?.assignedSubjects || []).map(subject => <label key={subject._id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={subjectIds.includes(subject._id)} disabled={!subjectIds.includes(subject._id) && subjectIds.length >= 20} onChange={event => { setSubjectIds(previous => event.target.checked ? [...previous, subject._id] : previous.filter(id => id !== subject._id)); setPreview(null); }} />{subject.code} — {subject.title}</label>)}{source && !source.assignedSubjects?.length && <p className="text-sm text-text/70">Source has no assigned subjects.</p>}</fieldset>
        <button type="submit" className="evl-btn-primary" disabled={!sourceId || !targetId || !subjectIds.length}>{busy ? 'Checking...' : 'Preview transfer'}</button>
      </fieldset>
    </form>
    <Feedback error={error} message={message} />
    {message && <button type="button" className="evl-btn-secondary mt-3" onClick={reload}>Refresh accounts after transfer</button>}
    {preview && <div className="mt-5 border border-warning/40 rounded-lg p-4">
      <h5 className="font-bold text-text">Transfer preview: {preview.source.name} → {preview.target.name}</h5>
      <p className="text-sm text-text/70 mt-2">{preview.subjects.map(subject => subject.code).join(', ')}. All dependencies and quotas are checked again when you confirm.</p>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-4">{Object.entries(preview.counts).map(([label, value]) => <div key={label}><dt className="text-xs text-text/65">{label.replace(/([A-Z])/g, ' $1')}</dt><dd className="font-bold">{value}</dd></div>)}</dl>
      <label htmlFor="transfer-confirm" className="evl-label">Type TRANSFER to confirm</label><input id="transfer-confirm" className="evl-input max-w-sm" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" disabled={busy} />
      <button type="button" className="evl-btn-danger mt-3" disabled={busy || confirmation !== 'TRANSFER'} onClick={execute}>{busy ? 'Transferring...' : 'Confirm ownership transfer'}</button>
    </div>}
  </section>;
}
