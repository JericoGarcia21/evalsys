# EvalSys QA results — 2026-10-10

## Outcome

Local QA passes after the fixes described below. This is evidence for returning to development on dev, not certification of the hosted production system.

| Check | Result |
| --- | --- |
| Backend syntax | 55 JavaScript files pass |
| Backend automated tests | 36 passed, 0 failed |
| Chrome browser workflows | 10 passed, 0 failed |
| Frontend ESLint | Pass, no errors or warnings |
| Frontend TypeScript + production build | Pass |
| Backend dependency audit | 0 reported vulnerabilities after compatible updates |
| Frontend runtime dependency audit | 0 reported vulnerabilities |

Tests used temporary local MongoDB databases and synthetic accounts. They did not load back-end/.env or change the live Atlas database, Supabase bucket, Render service, or Vercel deployment. Upload/storage tests used a local HTTP storage emulator. The global reset was exercised only against disposable test data.

## How it works

1. Superadmin manages instructors, subject limits, account access, maintenance, announcements, backups, and archives.
2. An instructor creates or manages assigned subjects, creates blocks/groups, assigns panels, and activates a rubric for the subject. Subject selection scopes instructor pages.
3. A public registration link ties enrollment to an active instructor and subject. Students choose a block and submit members; a proposal is optional.
4. Assigned panels log in (username or email), change temporary passwords when required, select groups, and enter rubric scores/comments. Local drafts survive reloads; offline submission is disabled while the draft remains available.
5. One submitted evaluation is stored per panel/group. Updating scores replaces that panel's evaluation. Results remain pending until the unique set of block/group-assigned panels has submitted. The browser verified scores 9 and 7 average to 8.
6. Instructors see results, local score/comment insights, and CSV exports. Incomplete groups are included and marked pending. Subject locks block new submissions without hiding existing results; CSV locks are enforced by the API.
7. Group/block deletion and subject reset archive submitted results. Panel deletion retains historical scores and names. Opening Archive is read-only. Old unowned records require an explicit archive migration. The separate global reset deliberately removes active and archived data after superadmin confirmation.

## Defects fixed

- Prevented arbitrary score keys from increasing totals; required known rubric criteria and finite scores within bounds.
- Unified group/block panel assignment handling for submission completeness, averages, and exports; included groups with no submissions.
- Closed permission gaps for revoked subject access, member-only group edits, and locked CSV exports.
- Contained rejected asynchronous API handlers; malformed IDs/JSON return controlled errors and database failures do not expose internal details.
- Fixed queued/running jobs disappearing at capacity; reads preserve active jobs, overload returns 503, and finished jobs can be evicted.
- Blocked public registrations during maintenance and through inactive-owner links.
- Removed data-changing behavior from the Archive GET request. A deleted panel's retained evaluation no longer moves out of active results when Archive is opened.
- Allowed username login in the browser; the old email-only input rejected valid usernames.
- Added Results and AI Insights to instructor navigation; fixed hook ordering/dependencies, typed frontend error handling, draft hydration, and expired-session handling.
- Replaced the backend nodemon chain with native Node watch mode; applied compatible dependency security fixes. Startup waits for MongoDB rather than accepting requests before the connection is ready.
- Removed back-end/.env from the Git index while keeping the local file. Sanitized the local query helper to use environment configuration.

## Browser coverage

The ten Chrome checks cover invalid and valid login, instructor navigation, subject switching without stale groups, score submission/update confirmation, persisted drafts and offline protection, pending-to-complete two-panel averages, temporary-password redirection, expired-session logout, valid/invalid public registration, superadmin controls, and a 390 × 844 mobile login/dashboard layout.

API coverage additionally exercises roles and ownership, subject limits, duplicate records, grading locks, maintenance scheduling/cancellation, proposal upload rejection/rollback, panel deletion snapshots, archive migration, confirmed subject/global resets, job ownership/capacity, malformed requests, account lockout, and injected database failure handling.

## Re-run

Install dependencies with npm ci in both active application folders. Use Node 20.19+; Node 24 is recommended.

Back-end: npm run check; npm test; npm audit --omit=dev.

Front-end: npm run lint; npm run build; npm audit --omit=dev; npm run test:e2e.

The first test run downloads a local MongoDB binary. Browser tests start their own API/Vite servers on ports 5101 and 5179 and require those ports free. Local tests use installed Chrome. The added GitHub Actions workflow uses Playwright Chromium and is ready to run after commit/push; its Linux execution has not been verified here. Browser reports appear in front-end/playwright-report.

## Remaining limits and follow-ups

- Rotate the credentials previously committed in back-end/.env, including database, JWT, and service/API credentials. Removing the current file from tracking does not remove it from older commits. History cleanup needs a separately planned operation; no history rewrite was performed.
- Frontend full audit retains 7 development-tool advisories (2 moderate, 5 high) in the Tailwind 3 dependency chain. Runtime audit is clean. Resolving this fully needs a reviewed toolchain migration rather than a forced major-version update.
- The production JavaScript bundle is about 602 kB before gzip (about 168 kB gzipped); Vite warns about its size. Page code splitting is a follow-up.
- Hosted MongoDB connectivity, real Supabase permissions/uploads, Render/Vercel deployment configuration, service-worker installation/update, all browser engines, exhaustive mobile layouts, and load/concurrency at production scale were not tested.
- Jobs are kept in process memory and are lost on server restart. Archive workflows span multiple writes; this QA does not establish atomicity under database outage or concurrent deletion.
- Extra local frontend/, index.php, and the existing backend seed helper were preserved. The seed helper is destructive and was not executed.

## Git state

Checked-out branch is dev. Local main and dev both still point to f29296b; QA changes are uncommitted in the dev working tree. No merge commit, remote refresh, push, deployment, or history rewrite was made. Only the environment-file removal is staged. Commit a reviewed set of files; avoid git add . because unrelated local files remain untracked.
