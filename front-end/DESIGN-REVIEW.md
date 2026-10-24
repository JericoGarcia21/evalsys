# EvalSys interface redesign

## Direction and scope

Requested on 2026-10-24: redesign the landing page with the film in the hero,
match the existing theme colors, include the login form, and extend the visual
language across the application. The later reference specifically rejected a
border around the active sidebar tab.

The reference sources inspected were this project's actual landing page,
rendered product film, Tailwind palette, existing operational screens, and the
user's screenshot of the Sections navigation item. No external brand assets,
customer logos, metrics, or testimonials were introduced.

Use the existing primary blue `#2563EB`, dark slate `#0F172A`, white surfaces,
and `#F8FAFC` background. The public pages use editorial type hierarchy with a
restrained serif accent. Operational pages keep compact, readable sans-serif
type, explicit actions and tabular data. The selected navigation item is a
borderless light cutout joined to the content canvas, with a blue icon tile.
Keyboard focus on navigation is an underline; other controls retain focus rings.

## Implementation

- `src/theme.css`: shared tokens, controls, tables, cards, page headings, badges,
  workspace navigation, focus, public-page framing and reduced-motion support.
- `src/components/Layout.tsx`: common role-aware shell, context bar, accessible
  current-page links, named collapse controls and skip link. Existing ownership,
  subject switching, sign-out confirmation and navigation logic are retained.
- `src/pages/Landing.tsx` and `Landing.css`: responsive hero containing the real
  77-second video; no autoplay or eager MP4 download. Five chapters, descriptions,
  captions, download, installation guidance, FAQ and access help remain available.
- `src/pages/Login.tsx` and `Login.css`: coordinated layout with unchanged sign-in,
  readiness, reconnection and password-reset-help behavior. Loading names and
  form error/status associations are explicit.
- Dashboard shortcuts, registration, mandatory password change, chat and notices
  use the shared treatment. Protected instructor, panel and Super Admin screens
  inherit the controls, page headings, tables and shell. Proposal contents remain
  inside their existing sandbox; document rendering is not restyled internally.
- Password fields generate a unique ID when the caller omits one, so their
  visible labels are associated with the correct input. Visibility buttons expose
  their pressed state.
- Panel grading has an optional Focus grading control. It hides the assignment
  list and the desktop application navigation, not the scoring guidance.
  Criterion descriptions, rating explanations, proposal access, totals, draft
  status, feedback, submission and floating chat stay available. Group/rubric
  metadata is in a disclosure; repeated member/subject text in the assignment
  list is off by default and can be restored with Show list details. Toggling
  the view does not remount the scoring form or change score/draft data.

No backend file, API contract, authorization rule, scoring calculation, export
format, draft key, database schema or authentication service was changed.
Existing unrelated working-tree files were preserved. No deployment or push.

## Verification

- Frontend `npm run build`: passed, including after the latest navigation change.
  The pre-existing Vite large-chunk warning remains.
- Backend `npm run check`: passed, 64 JavaScript files. Backend `npm test`: all
  59 tests passed, covering ownership, auth, grading, exports, registration,
  maintenance, archives and chat. Backend Git diff is empty.
- Full existing browser run: 62 cases executed; 61 passed initially. One login
  loading-button accessible-name failure was found and fixed. The corrected
  production-build rerun (`node scripts/run-ui-review.mjs`) passed all 8 login
  and mobile-sidebar cases and exited successfully. This also checks the latest
  active-tab treatment. Do not describe the initial run as an uninterrupted
  62/62 pass.
- The full run included successful rubric persistence/ratings, score submissions
  and updates, offline draft preservation, subject isolation, pending averages,
  CSV ordering, maintenance controls, permissions, tutorials, proposal viewing,
  chat state and all four video playback cases.
- `node scripts/design-review.mjs`: passed landing and login at 320, 390, 768,
  and 1440 px; primary blue, no overflow, hero placement, no autoplay, password
  visibility, dialog focus/Escape/return, keyboard FAQ, chapters/captions,
  installation content and portal navigation. Desktop and mobile screenshots
  were inspected directly.
- Workspace screenshot sweep passed: 26 authorized desktop role/route screens,
  9 mobile workspace screens, and public registration. No browser page errors
  or viewport overflow in those checks. Contact sheet and representative
  full-resolution dashboard, Sections, analytics, grading, registration and
  password-change screenshots were inspected.

The Operations screenshot contains its existing storage request error state:
the isolated fixture does not configure Supabase Storage, and the backend's
proposal-orphan listing explicitly requires it. No backend/storage settings
were altered or fabricated for this review; the successful storage-connected
Operations state remains unverified. The registration screenshot caught a
tutorial-invitation entrance animation, not a stable expanded form state.

The initial full-run Playwright process stalled in server cleanup after all
cases had reported. Its eventual process outcome is recorded below; a clean
initial suite exit is not assumed. The separate production UI runner explicitly
owns and closes its server to avoid that cleanup dependency.

The initial full-run process was interrupted after its cleanup stall (exit 1).
The additional complete regression run with the latest grading view passed all
63 tests in 4.3 minutes and exited with code 0. `node scripts/run-regression-review.mjs` explicitly owns the dev
server and, when needed, starts the disposable API with a graceful shutdown
bridge; it edits no backend file or environment file. It closed its owned servers cleanly after the successful run.

## Evidence and reproduction

From `front-end/`, build first, then run:

```powershell
npm.cmd run build
node scripts/design-review.mjs
node scripts/run-ui-review.mjs
node scripts/run-regression-review.mjs
```

For the read-only workspace screenshot sweep, run the project's disposable
`back-end/test/browser-server.js` fixture, then from `front-end/` run
`node scripts/workspace-review.mjs`. The sweep is fixed to loopback port 5101;
it does not use live data. It suppresses automatic chat read acknowledgements
instead of sending writes. Full browser workflow tests validate actual writes.
Screenshots and the route manifest are under `test-results/workspace-review/`.

Initial setup/build failures were corrected before final checks: an invalid
relative script path, a login JSX edit boundary, and a Tailwind component-layer
directive in a separately processed stylesheet. The first screenshot sweep
stopped because password change lacked a main landmark; that landmark was added.
A subsequent sweep stopped on its read-only guard when chat acknowledged a
message; the harness now suppresses those automatic writes. These were not
reported as successful runs.

This is a Chrome-based functional and visual review, not a whole-site WCAG
conformance claim. Native screen-reader behavior, Safari/Firefox, native PWA
installation and every possible combination of live records remain unverified.

The new grading-focus test explicitly checks that criterion guidance and rating explanations remain visible, view changes preserve scores and comments, proposal/chat controls remain available, no evaluation is submitted by toggling the view, and 320/390 px layouts do not overflow. Its first assertion mistakenly expected a rating description without the visible rating-name prefix; the locator was corrected, and the case passed in the complete regression rerun. Desktop and mobile focus screenshots were inspected.

## Final result

The latest complete browser run passed 63/63 tests (4.3 minutes), with clean runner and server shutdown. This supersedes the initial run and the earlier focus-test locator failure. The production frontend build passed after the final product-code change; backend syntax and all 59 backend tests passed. No backend file changed. Nothing was committed, pushed or deployed.

## Instructor account requests

Added a hero link and visible developer-contact section on the landing page, plus matching FAQ, access dialog and login guidance. New instructors email Jerico B. Garcia at garciajerico217@gmail.com with their name, institution, department and subjects. The mailto link pre-fills an account-request subject; no email is sent by the application. Panel accounts remain instructor-managed and students use registration links. Frontend build and the existing four-width landing/login review passed. No backend or account-creation logic changed.

Contact-link update: Instructor requests and developer email links now open Gmail web compose in a new tab, with the recipient and request subject prefilled, rather than using the OS mailto handler. This supersedes the mailto description above. No email is sent automatically.
