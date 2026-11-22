import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import { CardSkeleton } from '../components/LoadingSkeleton';
import { formatMemberList, memberSearchText, type Member } from '../utils/members';
import { getApiMessage } from '../utils/apiError';
import { notify } from '../utils/notify';

interface Section { _id: string; name: string; block: string; createdBy?: { _id: string; name: string }; subject?: string | { _id?: string; code?: string; title?: string }; }
interface Group { _id: string; name: string; createdBy?: string; section: Section; members: Member[]; isGraded?: boolean; }
interface Subject { _id: string; code: string; title: string; }

const currentSubjectKey = 'evalsys_current_subject_id';
const groupNameCacheKey = 'grading_group_names';
const groupStatusCacheKey = (panelId: string) => `grading_group_status_${panelId}`;
const compactSubjectTitle = (title: string) => {
  const name = title.trim();
  if (name.length <= 32) return name;
  const initials = (name.match(/[\p{L}\p{N}]+/gu) || [])
    .map((word) => [...word][0])
    .join('')
    .toLocaleUpperCase('en');
  return initials || name;
};

const getRefId = (value: string | { _id?: string } | undefined | null) => (
  typeof value === 'string' ? value : value?._id || ''
);


const subjectLabel = (subject: Section['subject']) => typeof subject === 'object' && subject
  ? [subject.code, subject.title].filter(Boolean).join(' - ') || 'Subject not linked'
  : 'Subject not linked';

// SVG icons matching the sidebar NavIcon set exactly
const CardIcon = ({ name }: { name: string }) => {
  const common = {
    className: 'w-5 h-5',
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (name === 'subjects')
    return <svg {...common}><path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14" /><path d="M4 19h16" /><path d="M9 7h6" /><path d="M9 11h6" /></svg>;
  if (name === 'sections')
    return <svg {...common}><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></svg>;
  if (name === 'groups')
    return <svg {...common}><rect x="3" y="4" width="7" height="7" rx="1.5" /><rect x="14" y="4" width="7" height="7" rx="1.5" /><rect x="3" y="15" width="7" height="5" rx="1.5" /><rect x="14" y="15" width="7" height="5" rx="1.5" /></svg>;
  if (name === 'users')
    return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.8-3.2 2.7-5 5.5-5s4.7 1.8 5.5 5" /><circle cx="17" cy="9" r="2.5" /><path d="M15.5 14.5c2.4.3 4 1.8 4.8 4.5" /></svg>;
  if (name === 'assign')
    return <svg {...common}><circle cx="7" cy="8" r="3" /><path d="M2.8 19c.8-3.1 2.2-5 4.2-5s3.4 1.9 4.2 5" /><path d="M15 7h6" /><path d="M18 4v6" /><path d="M15 17h6" /></svg>;
  if (name === 'rubrics')
    return <svg {...common}><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m13.5 8.5 2 2" /></svg>;
  if (name === 'results')
    return <svg {...common}><path d="M4 19V5" /><path d="M4 19h16" /><rect x="7" y="11" width="3" height="5" rx="1" /><rect x="12" y="8" width="3" height="8" rx="1" /><rect x="17" y="4" width="3" height="12" rx="1" /></svg>;
  if (name === 'link')
    return <svg {...common}><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" /></svg>;
  if (name === 'subscription')
    return <svg {...common}><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z" /><path d="M12 8v4l3 3" /></svg>;
  if (name === 'operations')
    return <svg {...common}><path d="M4 5h16" /><path d="M4 12h16" /><path d="M4 19h16" /><circle cx="8" cy="5" r="1.5" /><circle cx="14" cy="12" r="1.5" /><circle cx="10" cy="19" r="1.5" /></svg>;
  if (name === 'security')
    return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="M9.5 12.5 11 14l3.5-4" /></svg>;
  if (name === 'system')
    return <svg {...common}><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>;
  if (name === 'legacy')
    return <svg {...common}><path d="M4 7h16" /><path d="M6 7V4h12v3" /><path d="M6 7v13h12V7" /><path d="M9 11h6" /></svg>;
  return null;
};

const adminCards = [
  { to: '/subjects',            label: 'Subjects',            desc: 'Create and manage subjects or courses',          icon: 'subjects' },
  { to: '/sections',            label: 'Blocks',              desc: 'Create and manage evaluation blocks',            icon: 'sections' },
  { to: '/groups',              label: 'Groups',              desc: 'Register groups and manage member lists',        icon: 'groups'   },
  { to: '/users',               label: 'Panel Accounts',      superadminLabel: 'Accounts', superadminDesc: 'Create and manage platform accounts by role', desc: 'Create and manage panel judge accounts', icon: 'users' },
  { to: '/assign-panels',       label: 'Assign Panels',       desc: 'Assign panel judges to specific blocks',         icon: 'assign'   },
  { to: '/rubrics',             label: 'Rubrics',             desc: 'Create and manage grading rubrics',              icon: 'rubrics'  },
  { to: '/results',             label: 'Results',             desc: 'View averaged scores per group',                 icon: 'results'  },
  { to: '/registration-links',  label: 'Registration Links',  desc: 'Generate token-protected enrollment links',      icon: 'link'     },
];

export default function Dashboard() {
  const { user } = useAuth();

  if (user?.role === 'superadmin') {
    return <SuperAdminDashboard name={user.name} />;
  }
  if (user?.role === 'admin') {
    return <AdminDashboard name={user.name} role="admin" userId={user.id || user._id || ''} />;
  }
  return <PanelDashboard name={user?.name ?? ''} panelId={user?.id || user?._id || ''} />;
}

/* ── Instructor view ── */
function AdminDashboard({ name, role, userId }: { name: string; role: 'admin' | 'superadmin'; userId: string }) {
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentSubject, setCurrentSubject] = useState<Subject | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/subjects'),
      api.get('/auth/me'),
    ])
      .then(([res, meRes]) => {
        const savedSubjectId = localStorage.getItem(currentSubjectKey);
        const subjects: Subject[] = res.data;
        const selected = subjects.find((subject) => subject._id === savedSubjectId) || subjects[0] || null;
        const lockedSubjects = (meRes.data.gradingLockedSubjects || []).map((subject: string | { _id?: string }) => getRefId(subject));
        setCurrentSubject(selected);
        setLocked(Boolean(selected && lockedSubjects.includes(selected._id)));
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const toggleLock = async () => {
    if (!currentSubject || !userId) return;
    try {
      const nextLocked = !locked;
      const res = await api.patch(`/users/${userId}/grading-lock`, {
        subject: currentSubject._id,
        gradingLocked: nextLocked,
      });
      const lockedSubjects = (res.data.gradingLockedSubjects || []).map((subject: string | { _id?: string }) => getRefId(subject));
      setLocked(lockedSubjects.includes(currentSubject._id));
    } catch {
      notify('Failed to toggle lock', { type: 'error' });
    }
  };

  return (
    <div>
      <div className="mb-8 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto] gap-4 xl:items-start">
        <div className="min-w-0">
          <h2 data-tutorial="dashboard-welcome" className="evl-page-title">Welcome back, {name}</h2>
          <p className="evl-page-subtitle">
            {role === 'superadmin'
              ? 'Manage the selected instructor subjects, blocks, groups, panels, and results.'
              : 'Manage subjects, blocks, groups, panels, rubrics, and results from here.'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 xl:w-[620px]">
          {currentSubject && (
            <div className="evl-card min-h-[64px] px-4 py-3 flex items-center gap-3 bg-primary/5 border-primary/20 overflow-hidden">
              <div className="min-w-9 max-w-[45%] h-9 px-2.5 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-black shrink-0">
                <span className="truncate" title={currentSubject.code}>{currentSubject.code}</span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-widest text-text/65">Current Subject</span>
                <abbr className="block text-sm font-extrabold text-text truncate no-underline cursor-help leading-snug" title={currentSubject.title} aria-label={currentSubject.title}>
                  {compactSubjectTitle(currentSubject.title)}
                </abbr>
              </div>
            </div>
          )}

          {role !== 'superadmin' && (
            <div className={`evl-card min-h-[64px] px-4 py-3 flex items-center justify-between gap-3 transition-colors ${locked ? 'bg-danger/5 border-danger/20' : 'bg-success/5 border-success/20'}`}>
              <div className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-widest text-text/65">Subject Status</span>
                <span className={`block text-xs font-extrabold uppercase truncate ${locked ? 'text-danger' : 'text-success'}`}>
                  {locked ? 'Grading Locked' : 'Grading Active'}
                </span>
              </div>
              <button 
                disabled={loading || !currentSubject}
                onClick={toggleLock}
                className={`shrink-0 px-4 py-2 rounded-lg text-[10px] font-extrabold uppercase tracking-widest transition-all ${
                  locked 
                    ? 'bg-success text-white hover:bg-success/90' 
                    : 'bg-danger text-white hover:bg-danger/90'
                }`}
              >
                {locked ? 'Unlock' : 'Lock'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="workspace-shortcuts grid grid-cols-1 sm:grid-cols-2">
        {adminCards.filter((card) => role !== 'superadmin' || card.to !== '/rubrics').map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="workspace-shortcut evl-card group transition-colors duration-150"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <CardIcon name={card.icon} />
              </div>
            </div>
            <h3 className="text-text font-bold text-base mb-1 group-hover:text-primary transition-colors">
              {role === 'superadmin' && 'superadminLabel' in card ? card.superadminLabel : card.label}
            </h3>
            <p className="text-text/70 text-sm leading-relaxed">
              {role === 'superadmin' && 'superadminDesc' in card ? card.superadminDesc : card.desc}
            </p>
            <div className="workspace-shortcut-action text-primary text-xs font-semibold flex items-center gap-1">
              Open →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* Super Admin workspace */
function SuperAdminDashboard({ name }: { name: string }) {
  const superAdminCards = [
    { to: '/analytics', label: 'Analytics', desc: 'Platform totals, trends, and grading progress', icon: 'results' },
    { to: '/users', label: 'Instructors', desc: 'Create and manage instructor accounts', icon: 'users' },
    { to: '/subjects', label: 'Subjects', desc: 'Review subjects and instructor assignments', icon: 'subjects' },
    { to: '/subscription', label: 'Resources', desc: 'Limits, credits, and storage usage', icon: 'subscription' },
    { to: '/operations', label: 'Operations', desc: 'Audit logs, activity, and backups', icon: 'operations' },
    { to: '/security', label: 'Security', desc: 'Security monitor and alerts', icon: 'security' },
    { to: '/system-control', label: 'System Control', desc: 'Maintenance mode and notices', icon: 'system' },
    { to: '/legacy-data', label: 'Archive', desc: 'Archived results and legacy records', icon: 'legacy' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h2 data-tutorial="dashboard-welcome" className="evl-page-title">Welcome back, {name}</h2>
        <p className="evl-page-subtitle">
          Manage platform accounts, subjects, resources, operations, and system settings from here.
        </p>
      </div>

      <div className="workspace-shortcuts grid grid-cols-1 sm:grid-cols-2">
        {superAdminCards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="workspace-shortcut evl-card group transition-colors duration-150"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <CardIcon name={card.icon} />
              </div>
            </div>
            <h3 className="text-text font-bold text-base mb-1 group-hover:text-primary transition-colors">
              {card.label}
            </h3>
            <p className="text-text/70 text-sm leading-relaxed">{card.desc}</p>
            <div className="workspace-shortcut-action text-primary text-xs font-semibold flex items-center gap-1">
              Open +
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* Panel workspace */
function PanelDashboard({ name, panelId }: { name: string; panelId: string }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [loading, setLoading] = useState(true);
  const [requestError, setRequestError] = useState('');
  const [requestVersion, setRequestVersion] = useState(0);
  const [lockedSubjectIds, setLockedSubjectIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api.get('/sections', { signal: controller.signal }),
      api.get('/groups', { signal: controller.signal }),
      api.get('/auth/me', { signal: controller.signal }),
    ]).then(([secRes, grpRes, meRes]) => {
      if (controller.signal.aborted) return;
      setSections(secRes.data);
      setGroups(grpRes.data);
      if (panelId) {
        const groupNames = Object.fromEntries((grpRes.data as Group[]).map(group => [group._id, group.name]));
        const groupStatus = Object.fromEntries((grpRes.data as Group[]).map(group => [
          group._id, { name: group.name, isGraded: Boolean(group.isGraded) },
        ]));
        localStorage.setItem(groupNameCacheKey, JSON.stringify(groupNames));
        localStorage.setItem(groupStatusCacheKey(panelId), JSON.stringify(groupStatus));
      }
      setLockedSubjectIds(meRes.data.gradingLockedWorkspaces ?? (meRes.data.gradingLockedSubjects || []).map(getRefId));
    }).catch((err) => {
      if (!controller.signal.aborted) setRequestError(getApiMessage(err, 'Unable to load your assigned subjects and groups.'));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [panelId, requestVersion]);

  const assignedSubjects = Array.from(new Map(sections.filter(section => getRefId(section.subject)).map(section => [
    getRefId(section.subject),
    { id: getRefId(section.subject), label: subjectLabel(section.subject) },
  ])).values());
  const visibleSections = sections.filter(section => !selectedSubject || getRefId(section.subject) === selectedSubject);
  const subjectGroups = groups.filter(group => !selectedSubject || getRefId(group.section?.subject) === selectedSubject);
  const filteredGroups = subjectGroups.filter(group =>
    (!selectedSection || group.section?._id === selectedSection) &&
    (group.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      group.members.some(member => memberSearchText(member).includes(search.trim().toLowerCase())))
  ).sort((a, b) => Number(Boolean(a.isGraded)) - Number(Boolean(b.isGraded)));
  const gradedCount = subjectGroups.filter(group => group.isGraded).length;
  const totalCount = subjectGroups.length;
  const progressPct = totalCount ? Math.round(gradedCount / totalCount * 100) : 0;
  const retry = () => {
    setLoading(true);
    setRequestError('');
    setRequestVersion(version => version + 1);
  };

  return (
    <div className="min-w-0">
      <div className="mb-6 flex flex-col xl:flex-row xl:items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 data-tutorial="dashboard-welcome" className="evl-page-title">Welcome back, {name}</h2>
          <p className="evl-page-subtitle">Choose an assigned subject and block, then open a group to review or grade it.</p>
        </div>
        {!loading && !requestError && totalCount > 0 && (
          <div className="evl-card px-5 py-4 w-full xl:w-72 xl:shrink-0 border-primary/20">
            <div className="flex justify-between gap-3 mb-2">
              <span className="text-xs font-bold text-text/65">{selectedSubject ? 'Subject progress' : 'Overall progress'}</span>
              <span className="text-xs font-black text-primary">{gradedCount}/{totalCount} graded</span>
            </div>
            <div role="progressbar" aria-label="Grading progress" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100} className="bg-muted/20 rounded-full h-2">
              <div className="h-2 rounded-full bg-primary" style={{ width: progressPct + '%' }} />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }, (_, index) => <CardSkeleton key={index} />)}
        </div>
      ) : requestError ? (
        <div className="evl-card p-8 text-center" role="alert">
          <p className="text-danger mb-4">{requestError}</p>
          <button onClick={retry} className="evl-btn-secondary">Try again</button>
        </div>
      ) : sections.length === 0 && groups.length === 0 ? (
        <div className="evl-card p-8 text-center">
          <h3 className="font-bold text-text mb-2">No assignments yet</h3>
          <p className="text-text/70 text-sm">Ask your instructor to assign you to a block or group. Assigned subjects will appear here.</p>
        </div>
      ) : (
        <>
          <section data-tutorial="panel-dashboard-subjects" aria-label="Assigned subjects" className="evl-card p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <div className="min-w-0">
              <label htmlFor="panel-dashboard-subject" className="evl-label">Subject</label>
              <select id="panel-dashboard-subject" className="evl-select w-full min-w-0" value={selectedSubject}
                onChange={event => { setSelectedSubject(event.target.value); setSelectedSection(''); }}>
                <option value="">All Subjects</option>
              {assignedSubjects.map(subject => {
                const assignedGroups = groups.filter(group => getRefId(group.section?.subject) === subject.id);
                const count = assignedGroups.filter(group => group.isGraded).length;
                const locked = lockedSubjectIds.includes(subject.id) || sections.filter(section => getRefId(section.subject) === subject.id)
                  .every(section => lockedSubjectIds.includes(`${section.createdBy?._id}:${subject.id}`));
                return <option key={subject.id} value={subject.id}>{subject.label} · {count}/{assignedGroups.length} graded{locked ? ' · Grading locked' : ''}</option>;
              })}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="panel-dashboard-block" className="evl-label">Block</label>
              <select id="panel-dashboard-block" className="evl-select w-full min-w-0" value={selectedSection}
                onChange={event => setSelectedSection(event.target.value)}>
                <option value="">All Blocks</option>
                {visibleSections.map(section => (
                  <option key={section._id} value={section._id}>
                    {section.block || section.name} · {subjectLabel(section.subject)}{section.createdBy?.name ? ` · ${section.createdBy.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="panel-group-search" className="evl-label">Search groups or students</label>
              <input id="panel-group-search" type="search" placeholder="Group or student name..."
                value={search} onChange={event => setSearch(event.target.value)} className="evl-input" />
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
            {filteredGroups.map(group => {
              const locked = lockedSubjectIds.includes(`${group.createdBy}:${getRefId(group.section?.subject)}`) || lockedSubjectIds.includes(getRefId(group.section?.subject));
              return (
                <article key={group._id}
                  className={'evl-card min-w-0 p-6 border-2 transition-colors hover:border-primary/50 ' +
                    (group.isGraded ? 'border-success/20 bg-success/5' : 'border-muted/60')}>
                  <Link to={'/grade?groupId=' + group._id} className="block">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <span className={group.isGraded ? 'evl-badge-success' : 'evl-badge-primary'}>{group.isGraded ? 'Graded' : 'Pending'}</span>
                    {locked && <span className="evl-badge-warning">Grading locked</span>}
                  </div>
                  <h3 className="text-text font-bold text-base break-words">{group.name}</h3>
                  <p className="text-primary font-semibold text-sm mt-2 break-words">{subjectLabel(group.section?.subject)}</p>
                  <p className="text-text/65 text-xs mt-1">Block: {group.section?.block || group.section?.name || 'Unassigned'}</p>
                  <p className="text-text/65 text-xs mt-1">Instructor: {group.section?.createdBy?.name || 'Unknown'}</p>
                  <div className="mt-4 text-primary text-xs font-bold">{locked ? 'Review group →' : group.isGraded ? 'Update evaluation →' : 'Grade now →'}</div>
                  </Link>
                  <button type="button" data-tutorial="panel-dashboard-members" aria-expanded={expandedGroups.includes(group._id)} aria-controls={'panel-members-' + group._id}
                    aria-label={(expandedGroups.includes(group._id) ? 'Hide' : 'Show') + ' members for ' + group.name}
                    onClick={() => setExpandedGroups(current => current.includes(group._id) ? current.filter(id => id !== group._id) : [...current, group._id])}
                    className="mt-4 text-xs font-semibold text-text/60 hover:text-primary">{expandedGroups.includes(group._id) ? 'Hide members' : 'Show members'}</button>
                  {expandedGroups.includes(group._id) && <p id={'panel-members-' + group._id} className="text-text/70 text-sm leading-relaxed mt-3 break-words border-t border-muted/20 pt-3">{formatMemberList(group.members) || 'No members listed'}</p>}
                </article>
              );
            })}
            {filteredGroups.length === 0 && (
              <div className="col-span-full evl-card p-8 text-center">
                <p className="text-text/70 text-sm">{search.trim() ? 'No groups or students match your search.' : 'No assigned groups in this selection yet.'}</p>
                {search.trim() && <button onClick={() => setSearch('')} className="evl-btn-secondary mt-4">Clear search</button>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
