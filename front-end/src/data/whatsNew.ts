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
export const CURRENT_VERSION = '1.5.3';

export const RELEASES: ReleaseNote[] = [
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
