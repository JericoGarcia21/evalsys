// Release notes shown in the one-time "What's New" popup.
// Workflow + history: see WHATS_NEW.md at the repository root.
// Every user-visible feature: add an entry below and bump CURRENT_VERSION.
export type WhatsNewAudience = 'admin' | 'superadmin' | 'panel';

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  items: string[];
  /** Roles that should see this release note. Omit to show everyone. */
  audience?: WhatsNewAudience[];
}

/** Bump this whenever you add a release note — users see each version once. */
export const CURRENT_VERSION = '1.6.3';

export const RELEASES: ReleaseNote[] = [
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
  return RELEASES.find((release) => !release.audience || release.audience.includes(role as WhatsNewAudience)) || null;
};
