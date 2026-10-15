import FloatingPanelChat from './FloatingPanelChat';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import TutorialLauncher from '../tutorial/TutorialLauncher';
import {
  currentInstructorKey,
  currentSubjectKey,
  notifyOperationalScopeChanged,
} from '../hooks/useOperationalScope';

const superadminLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/users', label: 'Instructors' },
  { to: '/subjects', label: 'Subjects' },
  { to: '/subscription', label: 'Resources' },
  { to: '/operations', label: 'Operations' },
  { to: '/security', label: 'Security' },
  { to: '/system-control', label: 'System Control' },
  { to: '/legacy-data', label: 'Archive' },
];

const instructorLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/subjects', label: 'Subjects' },
  { to: '/sections', label: 'Sections' },
  { to: '/groups', label: 'Groups' },
  { to: '/users', label: 'Panel Accounts' },
  { to: '/assign-panels', label: 'Assign Panels' },
  { to: '/rubrics', label: 'Rubrics' },
  { to: '/registration-links', label: 'Registration Links' },
  { to: '/results', label: 'Results' },
  { to: '/ai-insights', label: 'AI Insights' },
];

const panelLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/grade', label: 'Grade Groups' },
];

type NavIconName = 'dashboard' | 'sections' | 'groups' | 'users' | 'assign' | 'rubrics' | 'results' | 'ai' | 'link' | 'grade' | 'subjects' | 'subscription' | 'operations' | 'security' | 'system' | 'legacy';

const getNavIconName = (to: string): NavIconName => {
  if (to === '/analytics') return 'results';
  if (to === '/subjects') return 'subjects';
  if (to === '/sections') return 'sections';
  if (to === '/groups') return 'groups';
  if (to === '/users') return 'users';
  if (to === '/assign-panels') return 'assign';
  if (to === '/rubrics') return 'rubrics';
  if (to === '/results') return 'results';
  if (to === '/ai-insights') return 'ai';
  if (to === '/registration-links') return 'link';
  if (to === '/grade') return 'grade';
  if (to === '/subscription') return 'subscription';
  if (to === '/operations') return 'operations';
  if (to === '/security') return 'security';
  if (to === '/system-control') return 'system';
  if (to === '/legacy-data') return 'legacy';
  return 'dashboard';
};

const NavIcon = ({ name }: { name: NavIconName }) => {
  const common = {
    className: 'w-[18px] h-[18px]',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'dashboard') {
    return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
  }
  if (name === 'subjects') {
    return <svg {...common}><path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14" /><path d="M4 19h16" /><path d="M9 7h6" /><path d="M9 11h6" /></svg>;
  }
  if (name === 'sections') {
    return <svg {...common}><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></svg>;
  }
  if (name === 'groups') {
    return <svg {...common}><rect x="3" y="4" width="7" height="7" rx="1.5" /><rect x="14" y="4" width="7" height="7" rx="1.5" /><rect x="3" y="15" width="7" height="5" rx="1.5" /><rect x="14" y="15" width="7" height="5" rx="1.5" /></svg>;
  }
  if (name === 'users') {
    return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.8-3.2 2.7-5 5.5-5s4.7 1.8 5.5 5" /><circle cx="17" cy="9" r="2.5" /><path d="M15.5 14.5c2.4.3 4 1.8 4.8 4.5" /></svg>;
  }
  if (name === 'assign') {
    return <svg {...common}><circle cx="7" cy="8" r="3" /><path d="M2.8 19c.8-3.1 2.2-5 4.2-5s3.4 1.9 4.2 5" /><path d="M15 7h6" /><path d="M18 4v6" /><path d="M15 17h6" /></svg>;
  }
  if (name === 'rubrics') {
    return <svg {...common}><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m13.5 8.5 2 2" /></svg>;
  }
  if (name === 'results') {
    return <svg {...common}><path d="M4 19V5" /><path d="M4 19h16" /><rect x="7" y="11" width="3" height="5" rx="1" /><rect x="12" y="8" width="3" height="8" rx="1" /><rect x="17" y="4" width="3" height="12" rx="1" /></svg>;
  }
  if (name === 'ai') {
    return <svg {...common}><path d="M12 3v3" /><path d="M12 18v3" /><path d="M3 12h3" /><path d="M18 12h3" /><path d="m5.6 5.6 2.1 2.1" /><path d="m16.3 16.3 2.1 2.1" /><path d="m18.4 5.6-2.1 2.1" /><path d="m7.7 16.3-2.1 2.1" /><circle cx="12" cy="12" r="3" /></svg>;
  }
  if (name === 'link') {
    return <svg {...common}><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" /></svg>;
  }
  if (name === 'subscription') {
    return <svg {...common}><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z" /><path d="M12 8v4l3 3" /></svg>;
  }
  if (name === 'legacy') {
    return <svg {...common}><path d="M4 7h16" /><path d="M6 7V4h12v3" /><path d="M6 7v13h12V7" /><path d="M9 11h6" /></svg>;
  }
  if (name === 'operations') {
    return <svg {...common}><path d="M4 5h16" /><path d="M4 12h16" /><path d="M4 19h16" /><circle cx="8" cy="5" r="1.5" /><circle cx="14" cy="12" r="1.5" /><circle cx="10" cy="19" r="1.5" /></svg>;
  }
  if (name === 'security') {
    return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="M9.5 12.5 11 14l3.5-4" /></svg>;
  }
  if (name === 'system') {
    return <svg {...common}><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>;
  }
  return <svg {...common}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></svg>;
};

interface UserRef {
  id?: string;
  _id?: string;
}

interface GradingDraft {
  scores?: Record<string, unknown>;
  comments?: string;
  rubricId?: string;
  groupId?: string;
  groupName?: string;
}

const getPanelId = (user?: UserRef) => user?.id || user?._id || '';
const groupNameCacheKey = 'grading_group_names';
const groupStatusCacheKey = (panelId: string) => `grading_group_status_${panelId}`;
const selectedRubricCacheKey = (panelId: string) => `grading_selected_rubric_${panelId}`;
const roleLabel = (role?: string) => {
  if (role === 'admin') return 'Instructor';
  if (role === 'superadmin') return 'Super Admin';
  if (role === 'panel') return 'Panel';
  return role || '';
};

interface Subject {
  _id: string;
  code: string;
  title: string;
}

interface Instructor {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive?: boolean;
}

const hasDraftContent = (draft?: GradingDraft | null) => {
  const scores = draft?.scores || {};
  const hasScores = Object.values(scores).some((value) => value !== '' && value !== null && value !== undefined);
  return hasScores || Boolean(draft?.comments?.trim());
};

const getPanelDraftGroups = (panelId?: string) => {
  if (!panelId) return [];
  const prefix = `grading_draft_${panelId}_`;
  const selectedRubricId = localStorage.getItem(selectedRubricCacheKey(panelId));
  let cachedNames: Record<string, string> = {};
  let cachedStatus: Record<string, { name?: string; isGraded?: boolean }> = {};
  try {
    cachedNames = JSON.parse(localStorage.getItem(groupNameCacheKey) || '{}');
  } catch {
    localStorage.removeItem(groupNameCacheKey);
  }
  try {
    cachedStatus = JSON.parse(localStorage.getItem(groupStatusCacheKey(panelId)) || '{}');
  } catch {
    localStorage.removeItem(groupStatusCacheKey(panelId));
  }
  return Object.keys(localStorage).filter((key) => {
    return key.startsWith(prefix);
  }).map((key) => {
    try {
      const draft = JSON.parse(localStorage.getItem(key) || 'null');
      if (!hasDraftContent(draft)) return null;
      if (selectedRubricId && draft?.rubricId !== selectedRubricId) return null;
      const groupId = draft?.groupId || key.replace(prefix, '');
      if (cachedStatus[groupId]?.isGraded) {
        localStorage.removeItem(key);
        return null;
      }
      return draft?.groupName || cachedStatus[groupId]?.name || cachedNames[groupId] || `Group ${groupId}`;
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  }).filter(Boolean) as string[];
};

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const links = user?.role === 'admin'
    ? instructorLinks
    : user?.role === 'superadmin'
      ? superadminLinks
      : panelLinks;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [currentInstructorId, setCurrentInstructorId] = useState(() => localStorage.getItem(currentInstructorKey) || '');
  const [currentSubjectId, setCurrentSubjectId] = useState(() => localStorage.getItem(currentSubjectKey) || '');
  const [subjectMenuOpen, setSubjectMenuOpen] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const currentSubject = useMemo(
    () => subjects.find((subject) => subject._id === currentSubjectId) || null,
    [subjects, currentSubjectId]
  );

  useEffect(() => {
    if (user?.role !== 'superadmin') return;
    api.get('/users')
      .then((res) => {
        const activeInstructors = (res.data as Instructor[]).filter(
          (account) => account.role === 'admin' && account.isActive
        );
        setInstructors(activeInstructors);
        const saved = localStorage.getItem(currentInstructorKey);
        const savedExists = activeInstructors.some((instructor) => instructor._id === saved);
        if (!savedExists) {
          const nextId = activeInstructors[0]?._id || '';
          if (nextId) localStorage.setItem(currentInstructorKey, nextId);
          else localStorage.removeItem(currentInstructorKey);
          localStorage.removeItem(currentSubjectKey);
          setCurrentInstructorId(nextId);
          setCurrentSubjectId('');
          notifyOperationalScopeChanged();
        }
      })
      .catch(() => undefined);
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'superadmin') return;
    if (user?.role === 'superadmin' && !currentInstructorId) {
      return;
    }
    api.get('/subjects')
      .then((res) => {
        setSubjects(res.data);
        const saved = localStorage.getItem(currentSubjectKey);
        const savedExists = res.data.some((subject: Subject) => subject._id === saved);
        if (!savedExists && res.data.length > 0) {
          localStorage.setItem(currentSubjectKey, res.data[0]._id);
          setCurrentSubjectId(res.data[0]._id);
          notifyOperationalScopeChanged();
        } else if (!res.data.length) {
          localStorage.removeItem(currentSubjectKey);
          setCurrentSubjectId('');
          notifyOperationalScopeChanged();
        }
      })
      .catch(() => undefined);
  }, [user?.role, currentInstructorId]);

  const handleInstructorChange = (instructorId: string) => {
    if (!instructorId || instructorId === currentInstructorId) return;
    localStorage.setItem(currentInstructorKey, instructorId);
    localStorage.removeItem(currentSubjectKey);
    setSubjects([]);
    setCurrentInstructorId(instructorId);
    setCurrentSubjectId('');
    notifyOperationalScopeChanged();
  };

  const handleSubjectChange = (subjectId: string) => {
    if (!subjectId || subjectId === currentSubjectId) {
      setSubjectMenuOpen(false);
      return;
    }
    localStorage.setItem(currentSubjectKey, subjectId);
    setCurrentSubjectId(subjectId);
    setSubjectMenuOpen(false);
    notifyOperationalScopeChanged();
  };

  const handleLogout = async () => {
    const draftGroups = user?.role === 'panel' ? getPanelDraftGroups(getPanelId(user)) : [];
    const draftCount = draftGroups.length;
    if (draftCount > 0) {
      const shownGroups = draftGroups.slice(0, 8).map((name) => `- ${name}`).join('\n');
      const extraGroups = draftCount > 8 ? `\n...and ${draftCount - 8} more` : '';
      const proceed = await confirm({
        title: 'Sign Out With Drafts?',
        message: `You still have ${draftCount} unsubmitted grading draft${draftCount === 1 ? '' : 's'} saved only on this browser.\n\n` +
          `Groups:\n${shownGroups}${extraGroups}\n\n` +
          'If you sign out, those scores are NOT submitted yet. They can only be restored by logging back in on this same device/browser.',
        confirmLabel: 'Sign Out',
        danger: true,
      });
      if (!proceed) return;
    }
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-bg relative">
      <ConfirmDialog />
      {/* Mobile Top Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-dark flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white text-sm font-extrabold">
            E
          </div>
          <h1 className="text-white font-bold text-sm">EvalSys</h1>
        </div>
        <button 
          data-tutorial="mobile-menu"
          aria-label="Toggle navigation menu"
          aria-expanded={mobileOpen}
          aria-controls="workspace-sidebar"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="w-10 h-10 flex items-center justify-center text-white text-2xl"
        >
          {mobileOpen ? '×' : '☰'}
        </button>
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-dark/60 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        id="workspace-sidebar"
        aria-label="Workspace sidebar"
        className={`
          ${collapsed ? 'lg:w-[72px]' : 'lg:w-64'} 
          ${mobileOpen ? 'translate-x-0 visible' : '-translate-x-full invisible lg:visible'} w-72 max-w-[calc(100vw-1rem)]
          lg:translate-x-0 lg:flex
          fixed lg:sticky top-0 h-dvh left-0
          bg-dark flex flex-col shrink-0 overflow-hidden transition-all duration-200 z-50 shadow-xl shadow-dark/10
        `}
      >
        {/* Brand */}
        <div className="h-[70px] flex items-center justify-between px-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white text-sm font-extrabold shadow-sm shadow-primary/30">
              E
            </div>
            {(!collapsed || mobileOpen) && (
              <div>
                <h1 className="text-white font-extrabold text-sm leading-none">EvalSys</h1>
                <p className="text-white/60 text-[10px] mt-1 uppercase tracking-widest font-bold">
                  {roleLabel(user?.role)}
                </p>
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden w-11 h-11 shrink-0 rounded-lg text-white text-2xl hover:bg-white/10"
          >
            ×
          </button>
          {/* Collapse toggle (only desktop) */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex w-7 h-7 items-center justify-center rounded-lg text-white/55 hover:text-white hover:bg-white/10 transition-colors text-xs"
          >
            {collapsed ? '▸' : '◂'}
          </button>
        </div>

        {/* Navigation */}
        <nav data-tutorial="navigation" className="flex flex-col gap-1 flex-1 min-h-0 px-3 py-4 overflow-y-auto overflow-x-hidden overscroll-contain [&>*]:shrink-0">
          {(user?.role === 'admin' || user?.role === 'superadmin') && (!collapsed || mobileOpen) && (
            <div className="min-w-0 mb-4 px-1 pb-4 border-b border-white/10">
              {user?.role === 'superadmin' && (
                <div className="mb-3">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/45 block mb-1.5">
                    Instructor
                  </label>
                  <select
                    id="sidebar-instructor"
                    aria-label="Instructor"
                    value={currentInstructorId}
                    onChange={(event) => handleInstructorChange(event.target.value)}
                    className="w-full min-w-0 min-h-11 rounded-lg bg-white/[0.07] border border-white/10 text-white text-xs font-bold px-3 py-2 outline-none hover:bg-white/10 focus:ring-2 focus:ring-primary/40 transition-colors"
                  >
                    {!instructors.length && <option value="">No instructors</option>}
                    {instructors.map((instructor) => (
                      <option key={instructor._id} value={instructor._id} className="text-text bg-surface">
                        {instructor.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <label className="text-[9px] font-black uppercase tracking-widest text-white/45 block mb-1.5">
                Subject
              </label>
              <div className="relative">
                <button
                  type="button"
                  data-tutorial="subject-switcher"
                  aria-expanded={subjectMenuOpen}
                  aria-controls="sidebar-subjects"
                  onClick={() => setSubjectMenuOpen((open) => !open)}
                  className="w-full min-h-10 rounded-lg bg-white/[0.07] border border-white/10 text-white text-left px-3 py-2 outline-none hover:bg-white/10 focus:ring-2 focus:ring-primary/40 transition-colors"
                  title={currentSubject ? `${currentSubject.code} - ${currentSubject.title}` : 'Select subject'}
                >
                  <span className="block text-xs font-bold truncate pr-5">
                    {currentSubject ? `${currentSubject.code} - ${currentSubject.title}` : 'Select subject'}
                  </span>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/65 text-[10px]">
                    {subjectMenuOpen ? '^' : 'v'}
                  </span>
                </button>

                {subjectMenuOpen && (
                  <div id="sidebar-subjects" className="relative mt-1 rounded-lg border border-white/10 bg-dark shadow-xl z-50 overflow-hidden">
                    <div className="max-h-48 overflow-y-auto py-1">
                      {subjects.map((subject) => {
                        const active = subject._id === currentSubjectId;
                        return (
                          <button
                            key={subject._id}
                            type="button"
                            onClick={() => handleSubjectChange(subject._id)}
                            className={`w-full min-h-11 text-left px-3 py-2 text-xs transition-colors ${
                              active
                                ? 'bg-primary text-white font-bold'
                                : 'text-white/70 hover:bg-white/10 hover:text-white'
                            }`}
                            title={`${subject.code} - ${subject.title}`}
                          >
                            <span className="block whitespace-normal break-words">{subject.code} - {subject.title}</span>
                          </button>
                        );
                      })}
                      {!subjects.length && (
                        <div className="px-3 py-2 text-xs text-white/65">No subjects yet</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <Link
                to="/subjects"
                onClick={() => setMobileOpen(false)}
                className="mt-2 w-full text-[10px] font-black text-primary hover:text-white hover:bg-primary/20 rounded-lg py-2 transition-colors flex items-center justify-center gap-1"
              >
                Manage Subjects
              </Link>
            </div>
          )}
          {(!collapsed || mobileOpen) && (
            <div className="px-2 pt-1 pb-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/35">
                {user?.role === 'superadmin' ? 'Platform' : 'Workspace'}
              </span>
            </div>
          )}
          {links.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-150 ${isActive
                    ? 'bg-primary text-white shadow-sm shadow-primary/25'
                    : 'text-white/70 hover:text-white hover:bg-white/[0.07]'
                  }`}
              >
                <span className="w-5 h-5 flex items-center justify-center shrink-0">
                  <NavIcon name={getNavIconName(link.to)} />
                </span>
                {(!collapsed || mobileOpen) && <span>{link.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div className="border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0">
          {(!collapsed || mobileOpen) ? (
            <>
              <div className="flex items-center gap-2.5 mb-3 px-1">
                <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/75 text-xs font-black uppercase shrink-0">
                  {user?.name?.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-white text-xs font-bold truncate">{user?.name}</p>
                  <p className="text-white/55 text-[10px] truncate">{user?.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/account-security"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-[11px] font-bold text-white/75 hover:bg-white/10 hover:text-white transition-colors"
                  title="Change password"
                >
                  Password
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex-1 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-[11px] font-bold text-white/65 hover:border-danger/30 hover:bg-danger/10 hover:text-danger transition-colors"
                >
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full text-white/65 hover:text-danger py-2 flex items-center justify-center text-sm transition-colors"
            >
              â»
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-auto pt-16 lg:pt-0">
        <div
          key={`${currentInstructorId || 'self'}:${currentSubjectId || 'none'}`}
          className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8 2xl:px-14"
        >
          <div className="flex justify-end mb-4"><TutorialLauncher /></div>
          {children}
        </div>
      </main>
      <FloatingPanelChat key={user?.role + ":" + (user?.id || user?._id || "")} />
    </div>
  );
}
