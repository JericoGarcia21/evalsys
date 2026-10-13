# EvalSys project review — 2026-10-10

Follow-up: the defects listed below were investigated and fixed during QA. See [QA_RESULTS.md](QA_RESULTS.md) for current verification and remaining limitations. This report retains the original audit findings.

## Scope and current state

Review of the tracked application structure, API routes, models, main permission/grading/archive/storage/session flows, frontend lint, and local-only folders. This is a code review and local verification, not a live deployment certification or exhaustive user-interface test.

- Working branch: dev. Keep new work here.
- Local main and dev point to f29296b. Local main is three commits ahead of the stored origin/main reference; no remote refresh or push was performed.
- The earlier development preparation changes remain uncommitted, along with this report.
- Active applications: front-end/ (React/TypeScript/Vite) and back-end/ (Express/Mongoose).
- The separate frontend/ implementation was removed at the user’s request. The active React application is front-end/.
- evalsys/ is empty and root index.php is empty.

## How the application works

1. Super Admin manages instructors, subject limits, assignments, platform operations, maintenance, announcements, and archives.
2. Instructor creates/manages assigned subjects, blocks, groups, panel accounts, instructor-owned rubrics, and registration links.
3. Public registration uses a token link tied to an instructor and subject. A proposal upload is optional.
4. Panels see their assigned groups, select rubrics, enter scores/comments, keep local drafts, and submit evaluations.
5. Results aggregate evaluations and show incomplete grading when expected panels are missing. CSV exports include group or member results.
6. Subject/group/block removal snapshots evaluations into archive records. A distinct global reset permanently deletes records.

Data relationships: Admin.assignedSubjects -> Subject; Section.subject -> Subject; Section.createdBy and Group.createdBy -> Admin; Group.section -> Section; Panel.createdBy -> Admin; Section.assignedPanels/Group.assignedPanels -> Panel; Evaluation -> Group, Panel, Rubric, Subject. Accounts are split into admin_acc and panel_acc collections. Proposal files use a private Supabase bucket and ten-minute signed URLs. Authentication uses JWT stored in browser localStorage. Cache keys include account and subject/instructor context. Background jobs and response caches are stored in process memory.

AI Insights computes statistics and keyword-based comment signals locally; it does not call an AI model.

## Verification results

| Check | Result |
| --- | --- |
| Frontend TypeScript build check | Passed |
| Frontend Vite production build | Passed; main JavaScript bundle is about 592 kB before gzip |
| Frontend development server smoke check | Passed: HTTP 200 with application root |
| Backend syntax check | Passed: 51 JavaScript files, including the new check script |
| Frontend ESLint | Failed: 38 errors and 8 warnings |
| Extra-score validation probe | Reproduced: unknown bonus key survives validation and contributes to total |
| Export group-assignment fallback probe | Reproduced: an empty section panel array masks group-level assignments |
| Database login/grading/archive integration | Not tested against a database |
| Supabase uploads and deployed applications | Not tested |

No tracked automated test suite or CI workflow was found. Build and syntax success do not establish correct grading, authorization, or archive behavior.

## Priority findings

### P1 — Secrets remain tracked by Git

Evidence: git ls-files includes back-end/.env despite .gitignore excluding environment files. Ignoring a file does not stop tracking an already committed file. A local debug script also contained a hardcoded database connection credential; the earlier preparation changed that script to use MONGO_URI.

Next: rotate exposed credentials with the account owners/providers, keep current values in local/deployment environment configuration, stop tracking back-end/.env while retaining the local file, and inspect historical exposure. A history rewrite is a separate coordinated task; removing the file in a new commit does not erase old copies. Do not publish new work before resolving this.

### P1 — Extra score fields can inflate grades

Evidence: back-end/src/middleware/validate.middleware.js:19 validates rubric keys but retains other submitted keys. back-end/src/controllers/evaluation.controller.js:220 sums every value in the submitted object.

Offline reproduction: rubric quality maxScore=10; request scores={quality:10,bonus:1000}. Middleware calls next and controller total logic produces 1010.

Next: require a plain score object, reject unknown keys, validate each required criterion, and calculate totals from the validated rubric criteria only. Add regression coverage for unknown keys, missing keys, invalid values, score bounds, and unauthorized rubric/group combinations. This is an API issue even if the normal UI never sends extra keys.

### P1 — Uncaught async API failures are not consistently handled

Evidence: installed Express is 4.22.2; its router invokes handlers without catching returned rejected promises. Many routes directly register async controllers (for example auth.routes.js:5 and group.routes.js:17) without wrappers. Several controllers await database operations outside try/catch. back-end/src/index.js ends without a shared API error handler.

Next: wrap async route/middleware handlers and add a shared JSON error handler, covering malformed IDs, validation failures, duplicate keys, and database/storage failures. The backgroundJob wrapper handles its own promise failures but does not cover the other routes. Test failure paths using isolated dependencies, not production data.

### P1 — Global reset deletes archived evaluations too

Evidence: back-end/src/controllers/evaluation.controller.js:628-638 restricts global reset to Super Admin and confirmation RESET GLOBAL, then calls Evaluation.deleteMany({}), Group.deleteMany({}), and Section.deleteMany({}). Archived evaluations share the Evaluation collection.

This may be intentional, but it must be clearly distinct from subject reset, which archives submitted evaluations. The README's general preservation language should state the exception. Decide whether global reset should preserve archives, or require a separately named permanent purge with explicit warning and a verified backup. No reset action was executed during review.

### P2 — Export-all ignores legacy group-level assignments

Evidence: back-end/src/controllers/evaluation.controller.js:536 uses row.assignedPanelDocs || group.assignedPanels || []. Aggregation returns an empty array for a section with no assigned panels; an empty array is truthy, so the fallback is skipped.

Offline reproduction: two group-assigned panels, no section-assigned panels, one submitted evaluation. Export logic chooses zero expected panels and reports no missing panels. It can mark incomplete group-level grading as complete.

Next: normalize section and group assignments into a single documented policy, apply it consistently to section results/group results/exports, and test section-only, group-only, mixed, deleted-panel, and incomplete cases.

### P2 — Maintenance does not cover public registration

Evidence: registrationLink.routes.js:21-22 registers public handlers without protect; findUsableLink validates link status, expiry, and subject state, but does not check Settings maintenance status. Protected routes and login do check maintenance.

Next: decide whether maintenance should freeze public registrations/uploads. If yes, add the same maintenance check before multipart processing and database/storage writes. Check inactive/deleted instructor behavior too: public link lookup populates name/email without testing instructor isActive.

### P2 — Frontend lint failures and session consistency

ESLint reports 18 explicit-any errors, 15 effect state-update errors, 4 declaration-order/immutability errors, 1 render-purity error, and 8 hook dependency warnings. Grade.tsx has 8 errors; RegistrationLinks.tsx has 6; Groups.tsx and Operations.tsx have 4 each. These are lint findings, not proof that every flagged component fails at runtime.

Session observations: the API interceptor clears the token on 401 and emits unauthorized, but AuthProvider does not subscribe to clear its user state. Initial /auth/me handling removes the token on any error except 429, including temporary network/server failures.

Next: make session expiration clear both token and user, keep transient failures distinct from invalid authentication, then fix effect/dependency issues and replace loose types. Keep lint enabled rather than disabling rules globally.

### P2 — Archive reads mutate records

Evidence: legacyData.controller.js:74-121 runs archiveEvaluations from the GET archive handler, including records with missing group/panel references. Merely opening the Archive page can change evaluation state. There is no matching mutation-based cache invalidation for those writes.

Next: move migration/repair behavior to an explicit audited operation; keep normal reads read-only. Test deleted-panel snapshots versus active-group result behavior and use a test database for archive tests.

### P3 — Operational reliability, documentation, and navigation

- job.service.js keeps jobs in memory and prunes at >= MAX_JOBS even on reads. A full queue can discard the oldest job on a status lookup; running jobs are not protected from pruning. A server restart loses job status/results.
- DNS servers are hardcoded in back-end/src/index.js:3. Make the override an explicit optional configuration after confirming the original connectivity need.
- Instructor sidebar lacks Results and AI Insights. Results remains reachable from dashboard cards; AI Insights has a route but no navigation link found in the sidebar/dashboard.
- QA_RESULTS.md opens with a not-ready verdict but marks its listed issues fixed. risk.md still says backend check scripts are missing and exports use loops; export-all now uses aggregation and router-aware unauthorized navigation exists. SCALABILITY.md is also older than the current aggregation/index/job code.
- Large frontend bundle is a performance follow-up after correctness work. Capacity claims in SCALABILITY.md are not backed by a load test in this review.
- Untracked seed.js deletes an existing admin before recreating it with a fixed weak password. Preserve it for inspection; do not run it against an existing database as a startup step.

## Recommended work order on dev

1. Resolve tracked secrets and credential exposure; review local-only files before staging anything.
2. Fix grading validation and export completeness, with regression tests.
3. Add reliable async API error handling.
4. Define and test archive/global reset policy and public maintenance behavior on a separate development database.
5. Fix frontend lint and session-state handling; restore useful instructor navigation.
6. Refresh QA/risk/scalability notes and add repeatable checks to CI.
7. Commit reviewed changes on dev, push dev when intended, and promote to main only after the checks and end-to-end workflow pass.

## Manual acceptance workflow on a development database

Use two instructors with separate subjects, two panel accounts per block, and at least two groups. Check first login/password change; token registration; optional proposal upload and authorized viewing; instructor/subject switching; cross-instructor access denial; rubric selection; local draft recovery; score submission/update; partial and complete result exports; grading lock; immediate and scheduled maintenance; group/block deletion archive preservation; subject reset archive preservation; and backup export/restore. Test destructive paths only with disposable data. Record observed results instead of reusing the old QA verdict.

## Development commands

From separate terminals, run npm run dev inside back-end and front-end. Open http://localhost:5173. Run npm run check in back-end and npm run build plus npm run lint in front-end before committing. Current backend config exists, but connection and end-to-end behavior have not been certified.
