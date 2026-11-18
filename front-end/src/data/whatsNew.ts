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
export const CURRENT_VERSION = '1.5.0';

export const RELEASES: ReleaseNote[] = [
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
