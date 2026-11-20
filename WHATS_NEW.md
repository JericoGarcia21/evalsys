# What's New — release notes workflow

This file is the human-facing checklist for the in-app **"What's New"** popup.
The popup itself renders from `front-end/src/data/whatsNew.ts`; this document
explains what to change and keeps the release history in one place.

## Rule

**Every user-visible feature or fix ships with a release note.**

- Add an entry to `RELEASES` in `front-end/src/data/whatsNew.ts`.
- Bump `CURRENT_VERSION` to the same version string.
- Add the same row to the History table below.
- Run `npm run build` in `front-end/`.

Do **not** bump the version for refactors, tests, formatting, dependency
updates, or anything a user cannot see — otherwise everyone gets a popup for
nothing.

Bumping the version makes the popup appear **once per user, per device** after
their next login. Users can reopen it anytime from the sidebar link
**"What's new · vX.Y.Z"**.

## Steps

1. Open `front-end/src/data/whatsNew.ts`.
2. Add a new object at the **top** of `RELEASES` (newest first).
3. Update `export const CURRENT_VERSION = 'x.y.z';`.
4. Copy the row into the History table in this file.
5. Verify with `npm run build` in `front-end/`.

## Entry template

```ts
{
  version: '1.6.0',
  date: '2026-11-20',
  title: 'Short headline about the release',
  audience: ['admin', 'superadmin'],
  items: [
    'One short sentence per change, written for the user.',
    'Say what they can now do, not how it was built.',
  ],
},
```

### Audience values

| Value | Who sees it |
| --- | --- |
| `['admin']` | Instructors only |
| `['superadmin']` | Super Admin only |
| `['admin', 'superadmin']` | Instructor + Super Admin (most features) |
| `['panel']` | Panel judges only |
| omitted | Everyone |

If the current role has no matching entry, that user sees no popup.

### Writing the items

- Keep each item to one sentence, under ~110 characters.
- User language: "Shuffle presenting order per block", not "added `blockOf()` helper".
- 2–5 items per release. If you have more, it is probably more than one release.
- Mention the page or button name so people can find it.

## Re-testing the popup locally

The "seen" flag is stored per user in `localStorage` under
`evalsys_whats_new_seen_<userId>`. To see the popup again:

1. DevTools → Application → Local Storage → delete that key, then reload.
2. Or click **"What's new · vX.Y.Z"** in the sidebar.

## History

| Version | Date | Title | Audience | Summary |
| --- | --- | --- | --- | --- |
| 1.6.3 | 2026-11-20 | Super Admin interface polish | Internal only — no popup | Added five dashboard icons, removed sidebar scope selectors, and refined System Control with separate views and previews; empty audience prevents a popup. |
| 1.6.2 | 2026-11-20 | Relevant, scheduled notices | Instructor, Panel | User-facing announcement delivery now respects role, actual subject assignments, and schedule windows. No Super Admin tools announced. |
| 1.6.1 | 2026-11-20 | Safer sign-in sessions | Instructor, Panel | Shared authentication update: tracked sessions, server-side sign-out, and session rotation after password changes. No Super Admin feature announcement. |
| 1.6.0 | 2026-11-20 | Super Admin audit tools and permissions | Super Admin | Operations gains filtered, paginated audit logs, safe CSV export, and a read-only role permission matrix. |
| 1.5.5 | 2026-11-20 | Clearer registration form | Everyone | Registration asks for the group name only; student names go in the member rows. |
| 1.5.4 | 2026-11-19 | Footer alignment on smaller screens | Everyone | Legal footer sits at the very bottom of the page on phones and tablets. |
| 1.5.3 | 2026-11-19 | Pinned legal footer and stable panel results | Everyone | Legal footer pinned to the bottom on every page; adding a panel after grading no longer reopens or changes completed results; unassigning a panel keeps their submitted score and stops counting them as missing. |
| 1.5.2 | 2026-11-18 | Weighted rubrics in AI generation | Instructor, Super Admin | AI now reads criterion weights and percentage scales, preserving sections and 100-point totals for rubrics like the Database Final Project. |
| 1.5.1 | 2026-11-18 | Cleaner AI rubric review | Instructor, Super Admin | Redesigned AI review panel with level chips, one-click save, and a tidier rubric form. |
| 1.5.0 | 2026-11-18 | AI rubrics and presentation order | Instructor, Super Admin | AI rubric generation from text/file, per-instructor AI credits, Presentation page with per-block shuffle and minutes, live generation progress. |
| 1.4.0 | 2026-11-14 | Faster grading and clearer results | Everyone | Grading drafts scoped per subject, results/footer layout fixes. |

> Keep the two most recent rows plus the current release. Older rows can be
> trimmed from both the table and `RELEASES`; the popup only ever shows the
> newest matching release.
