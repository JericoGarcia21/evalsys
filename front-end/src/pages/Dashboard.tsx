import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import { CardSkeleton } from '../components/LoadingSkeleton';
import { formatMemberList, memberSearchText, type Member } from '../utils/members';
import { notify } from '../utils/notify';

interface Section { _id: string; name: string; block: string; subject?: string | { _id?: string }; }
interface Group { _id: string; name: string; section: Section; members: Member[]; isGraded?: boolean; }
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

  if (user?.role === 'admin' || user?.role === 'superadmin') {
    return <AdminDashboard name={user.name} role={user.role} userId={user.id || user._id || ''} />;
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {adminCards.filter((card) => role !== 'superadmin' || card.to !== '/rubrics').map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="evl-card p-6 group hover:border-primary/50 hover:shadow-md transition-all duration-200"
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
            <div className="mt-4 text-primary text-xs font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Open →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── Panel view — choose section, see groups ── */
function PanelDashboard({ name, panelId }: { name: string; panelId: string }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lockedSubjectIds, setLockedSubjectIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');


  useEffect(() => {
    Promise.all([
      api.get('/sections'),
      api.get('/groups'),
      api.get('/auth/me')
    ]).then(([secRes, grpRes, meRes]) => {
      const fetchedSections = secRes.data;
      setSections(fetchedSections);
      if (fetchedSections.length > 0) {
        setSelectedSection(fetchedSections[0]._id);
      }
      setGroups(grpRes.data);
      if (panelId) {
        const groupNames = grpRes.data.reduce((acc: Record<string, string>, group: Group) => {
          acc[group._id] = group.name;
          return acc;
        }, {});
        const groupStatus = grpRes.data.reduce((acc: Record<string, { name: string; isGraded: boolean }>, group: Group) => {
          acc[group._id] = { name: group.name, isGraded: Boolean(group.isGraded) };
          return acc;
        }, {});
        localStorage.setItem(groupNameCacheKey, JSON.stringify(groupNames));
        localStorage.setItem(groupStatusCacheKey(panelId), JSON.stringify(groupStatus));
      }
      setLockedSubjectIds((meRes.data.gradingLockedSubjects || []).map((subject: string | { _id?: string }) => getRefId(subject)));
    })
    .catch((err) => console.error(err))
    .finally(() => setLoading(false));
  }, [panelId]);

  const filteredGroups = groups
    .filter((g) => {
      const sId = typeof g.section === 'string' ? g.section : g.section?._id;
      const matchesSection = !selectedSection || sId === selectedSection;
      const matchesSearch = g.name.toLowerCase().includes(search.toLowerCase()) || 
                            g.members.some(m => memberSearchText(m).includes(search.toLowerCase()));
      return matchesSection && matchesSearch;
    })
    .sort((a, b) => {
      if (a.isGraded === b.isGraded) return 0;
      return a.isGraded ? 1 : -1;
    });

  const gradedCount = groups.filter(g => g.isGraded).length;
  const totalCount = groups.length;
  const progressPct = totalCount > 0 ? Math.round((gradedCount / totalCount) * 100) : 0;
  const selectedSectionDoc = selectedSection
    ? sections.find((section) => section._id === selectedSection)
    : null;
  const selectedSubjectId = getRefId(selectedSectionDoc?.subject);
  const locked = Boolean(selectedSubjectId && lockedSubjectIds.includes(selectedSubjectId));

  return (
    <div>
      <div className="mb-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h2 data-tutorial="dashboard-welcome" className="evl-page-title">Welcome back, {name}</h2>
          <p className="evl-page-subtitle">
            Select a block below and grade the groups assigned to you.
          </p>
          {locked && (
            <div className="mt-3 p-2.5 bg-danger/5 border border-danger/20 rounded-lg flex items-center gap-2 text-danger text-[11px] font-bold uppercase tracking-wider">
              <span>🔒 Grading is currently locked by the instructor</span>
            </div>
          )}
        </div>

        {/* Progress Card */}
        {!loading && totalCount > 0 && (
          <div className="evl-card px-6 py-4 flex items-center gap-6 min-w-[280px] bg-surface/50 border-primary/20">
            <div className="flex-1">
              <div className="flex justify-between items-end mb-1.5">
                <span className="text-[10px] font-bold text-text/65 uppercase tracking-widest">Your Progress</span>
                <span className="text-xs font-black text-primary">{gradedCount}/{totalCount} <span className="text-[10px] text-text/65 font-medium">Graded</span></span>
              </div>
              <div className="w-full bg-muted/20 rounded-full h-1.5">
                <div 
                  className="h-1.5 rounded-full bg-primary transition-all duration-700" 
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            <div className="w-12 h-12 rounded-full border-4 border-primary/10 flex items-center justify-center relative">
              <span className="text-[10px] font-black text-primary">{progressPct}%</span>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array(6).fill(0).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : sections.length === 0 ? (
        <div className="evl-card p-12 text-center">
          <div className="text-text/60 text-4xl mb-3">⊞</div>
          <p className="text-text/70 text-sm">No groups have been assigned to you yet.</p>
        </div>
      ) : (
        <>

      <div className="mb-6 flex flex-col md:flex-row gap-4 items-center">
        {/* Section / Block tabs */}
        <div className="flex gap-2 flex-wrap flex-1">
          <button
            onClick={() => setSelectedSection(null)}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all duration-150 ${
              !selectedSection
                ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20'
                : 'border-muted/40 text-text/70 bg-surface hover:text-text'
            }`}
          >
            All Blocks
          </button>
          {sections.map((s) => (
            <button
              key={s._id}
              onClick={() => setSelectedSection(s._id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all duration-150 ${
                selectedSection === s._id
                  ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20'
                  : 'border-muted/40 text-text/70 bg-surface hover:text-text'
              }`}
            >
              {s.block}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="w-full md:w-64 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text/55 text-sm">🔍</span>
          <input 
            type="text"
            placeholder="Search group or student..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="evl-input !py-2 !pl-9 !text-xs !bg-surface/50"
          />
        </div>
      </div>

          {/* Groups grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredGroups.map((g) => (
              <Link
                key={g._id}
                to={`/grade?groupId=${g._id}`}
                className={`evl-card p-6 group transition-all duration-200 border-2 ${
                  g.isGraded 
                    ? 'border-success/20 bg-success/5 hover:border-success/40' 
                    : 'border-muted/60 hover:border-primary/50 hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold ${
                    g.isGraded ? 'bg-success text-white' : 'bg-primary/10 text-primary'
                  }`}>
                    {g.isGraded ? '✓' : g.name.charAt(0)}
                  </div>
                  {g.isGraded ? (
                    <span className="evl-badge-success">Graded</span>
                  ) : (
                    <span className="evl-badge-primary opacity-50">Pending</span>
                  )}
                </div>
                <h3 className={`text-text font-bold text-base mb-1 transition-colors ${
                  !g.isGraded && 'group-hover:text-primary'
                }`}>
                  {g.name}
                </h3>
                <p className="text-text/70 text-sm leading-relaxed">
                  {formatMemberList(g.members) || 'No members listed'}
                </p>
                <div className={`mt-4 text-xs font-semibold flex items-center gap-1 transition-all ${
                  g.isGraded ? 'text-success' : 'text-primary opacity-0 group-hover:opacity-100'
                }`}>
                  {g.isGraded ? 'Update Evaluation →' : 'Grade now →'}
                </div>
              </Link>
            ))}
            {filteredGroups.length === 0 && (
              <div className="col-span-full evl-card p-12 text-center">
                <p className="text-text/65 text-sm">No groups in this block.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

