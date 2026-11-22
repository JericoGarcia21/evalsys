// Release notes shown in the one-time "What's New" popup.
// Workflow + history: see WHATS_NEW.md at the repository root.
// Every user-visible feature: add an entry below and bump CURRENT_VERSION.
export type WhatsNewAudience = 'admin' | 'superadmin' | 'panel';

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  summary?: string;
  items: string[];
  /** Feature audience for context; an empty array marks an internal-only release. */
  audience?: WhatsNewAudience[];
}

/** Bump this whenever you add a release note — users see each version once. */
export const CURRENT_VERSION = '1.7.2';

export const RELEASES: ReleaseNote[] = [
  {
    version: '1.7.2',
    date: '2026-11-22',
    title: 'The same latest update for every account',
    items: [
      'What’s New now shows the same latest public release for instructors, panel judges, and Super Admin.',
      'The popup version now matches the version in the sidebar, even when a release focuses on another role.',
      'Reopen the latest update anytime using What’s new in the sidebar.',
    ],
  },
  {
    version: '1.7.1',
    date: '2026-11-22',
    title: 'Start a new semester and share panel judges',
    audience: ['admin'],
    items: [
      'In Subjects, use Archive & Start New Semester: enter a semester label and confirm with the subject code.',
      'Results, members, feedback, and rubric details stay in your private, read-only My Archive.',
      'Old groups are cleared and registration links disabled; subjects, rubrics, blocks, and assignments stay.',
      'When Super Admin enables sharing, Assign Panels lets you choose Panels from Other Instructors.',
      'Find a judge by name, email, or instructor, select your subject’s blocks, then click Save assignments.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-11-22',
    title: 'Ready for the next semester',
    audience: ['admin'],
    items: [
      'Archive a semester from Subjects with a semester label and confirmation. Results, members, feedback, and rubric details are preserved in My Archive.',
      'Old groups are cleared while your subject, rubrics, blocks, and panel assignments stay ready for the next semester.',
      'Incomplete and ungraded groups remain clearly marked. Old registration links are disabled so you can issue fresh links.',
      'My Archive is read-only and private to the instructor who archived the semester.',
      'Subject action buttons now use matching neutral styles and a horizontal layout.',
    ],
  },
  {
    version: '1.6.6',
    date: '2026-11-22',
    title: 'Cleaner filters and table actions',
    items: [
      'Table action headings and buttons now share a consistent alignment, spacing, and minimum button height.',
      'Mobile group and resource cards keep their existing responsive action layouts.',
      'Panel dashboard subject and block filters now use compact dropdowns instead of long button lists.',
    ],
  },
  {
    version: '1.6.5',
    date: '2026-11-21',
    title: 'Better teamwork. Clearer assignments.',
    summary: 'Less account setup for instructors. One familiar login for panel judges. A clearer workspace to bring everyone together.',
    audience: ['admin', 'panel'],
    items: [
      'For instructors: find existing judges in My Panels or Other Instructors, with a simple search and clear instructor labels.',
      'Assign with confidence: select blocks, review exactly what will change, then save. Select-all and discard controls make updates easier.',
      'For panel judges: use the same account across assigned instructors when sharing is enabled. Each workspace keeps its own rubrics, grading locks, and panel chat.',
      'Presentation-ready control: cross-instructor sharing starts OFF. Super Admin can enable it or return to owner-only access while keeping saved grades and assignments.',
      'A bigger, more readable What’s New brings each upgrade into focus, on desktop and mobile.',
    ],
  },
  {
    version: '1.6.4',
    date: '2026-11-21',
    title: 'Reuse panel accounts across instructors',
    audience: ['admin', 'panel'],
    items: [
      'Assign Panels now lets instructors search My Panels and Other Instructors’ Panels and assign immediately.',
      'Cross-instructor panels are controlled by a temporary Super Admin switch, OFF by default during presentations.',
      'Panels use one login for assigned blocks across instructors, with each workspace’s rubrics, grading locks, and chat.',
      'Shared panel account deletion, deactivation, and password resets are managed by Super Admin while cross-instructor assignments exist.',
    ],
  },
  {
    version: '1.6.3',
    date: '2026-11-20',
    title: 'Super Admin interface polish',
    // Internal release record only: do not show a popup for Super Admin-only updates.
    audience: [],
    items: [
      'Resources, Operations, Security, System Control, and Archive now show their matching sidebar icons.',
      'Removed the instructor/subject selector block and Manage Subjects shortcut from the Super Admin sidebar.',
      'System Control now separates notice editing and maintenance, with clear statuses and draft previews.',
    ],
  },
  {
    version: '1.6.2',
    date: '2026-11-20',
    title: 'Relevant, scheduled notices',
    audience: ['admin', 'panel'],
    items: [
      'Announcements can now be limited to your role and assigned subjects.',
      'Scheduled notices appear during their active window and disappear after their end time.',
    ],
  },
  {
    version: '1.6.1',
    date: '2026-11-20',
    title: 'Safer sign-in sessions',
    audience: ['admin', 'panel'],
    items: [
      'Signing out now closes your server session; older untracked sessions require a fresh sign-in.',
      'Changing your password signs out older sessions while keeping your current session signed in.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-11-20',
    title: 'Super Admin audit tools and permissions',
    audience: ['superadmin'],
    items: [
      'Filter the Operations audit log by actor, action, status, and date, then export matching records as CSV.',
      'Review the read-only permission matrix in Operations to see access rules for each role.',
    ],
  },
  {
    version: '1.5.5',
    date: '2026-11-20',
    title: 'Clearer registration form',
    items: [
      'The registration form now asks for the group name only; student names belong in the member rows.',
    ],
  },
  {
    version: '1.5.4',
    date: '2026-11-19',
    title: 'Footer alignment on smaller screens',
    items: [
      'The legal footer now sits at the very bottom of the page on phones and tablets instead of just below the visible area.',
    ],
  },
  {
    version: '1.5.3',
    date: '2026-11-19',
    title: 'Pinned legal footer and stable panel results',
    items: [
      'The legal footer (Terms of Use, Privacy Policy, Copyright) now stays pinned to the bottom on every page.',
      'Adding a panel after groups were graded no longer reopens completed results or lowers their computed score.',
      'A panel added later can still submit an evaluation; that score only joins the average once it is submitted.',
      'If a panel leaves and is unassigned from a block, their submitted evaluation is kept and still counts in the result.',
      'A panel unassigned before grading is no longer counted as missing, so the group is not stuck waiting for them.',
    ],
  },
  {
    version: '1.5.2',
    date: '2026-11-18',
    title: 'Weighted rubrics in AI generation',
    audience: ['admin', 'superadmin'],
    items: [
      'The AI generator now understands weighted rubrics, such as 40% Requirements, 30% Documentation, and 30% Presentation.',
      'Criteria keep their own weights and section names, so a 100-point project rubric is generated exactly as written.',
      'Percentage rating scales with five levels (100, 90, 80, 70, 0) are supported end to end.',
    ],
  },
  {
    version: '1.5.1',
    date: '2026-11-18',
    title: 'Cleaner AI rubric review',
    audience: ['admin', 'superadmin'],
    items: [
      'The AI generator now shows a clean review of criteria and score levels before saving.',
      'Save a generated rubric in one click, or open it in the form to fine-tune it first.',
      'The rubric form hides the system key as a small label, leaving more room for criteria.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-11-18',
    title: 'AI rubrics and presentation order',
    audience: ['admin', 'superadmin'],
    items: [
      'Generate a rubric with AI: paste rubric text or upload a file and let AI build the criteria.',
      'AI credits are tracked per instructor and can be topped up by the Super Admin in Resources.',
      'New Presentation page: shuffle the presenting sequence per block and set the minutes per group.',
      'AI generation now shows live progress and clearer error messages when a provider is unavailable.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-11-14',
    title: 'Faster grading and clearer results',
    audience: ['admin', 'superadmin', 'panel'],
    items: [
      'Grading drafts are now kept per subject, so switching subjects no longer mixes up saved scores.',
      'Results and printable summaries stay anchored to the bottom of the page for easier reading.',
    ],
  },
];

export const latestReleaseForRole = (role?: string) => {
  if (!role) return null;
  return RELEASES.find((release) => !release.audience || release.audience.length > 0) || null;
};
