# Final release check — 2026-10-21

Candidate: application changes on `dev`, based on `534444e`. This report is committed with the tested candidate. Target branches: `origin/dev`, then `origin/main`, as authorized by the user. Local skill directories and unrelated AGENTS.md edits are excluded.

| Gate | Result | Evidence |
| --- | --- | --- |
| Backend syntax | PASS | `npm.cmd run check`: 64 JavaScript files |
| Backend integration/unit tests | PASS | `npm.cmd test`: 59 passed, zero failed/skipped |
| Frontend production build | PASS | `npm.cmd run build`: TypeScript and Vite succeeded |
| Frontend lint | PASS | `npm.cmd run lint`: exit 0 |
| Full browser regression | PASS | `npm.cmd run test:e2e -- --reporter=list`: 58 passed, zero failed, 4.1 minutes |
| Source document match | PASS | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-database-rubric.ps1 -DocumentPath <source-docx>`: 16 criteria, five ratings, instructions, 40/30/30 section totals, 100 total |
| Patch whitespace | PASS | `git diff --cached --check` |

The document SHA256 is `26644FA12292BE0CFB1A141C95AC396BE812B2C9DDE3150A34FF23B85E49511D`.

Browser tests ran in Chrome on Windows against isolated local frontend/API servers and an in-memory MongoDB fixture. Coverage includes rubric creation/editing and save recovery, stable criterion keys, percentage scores, readable descriptions and keyboard selection, draft persistence/offline recovery, score submission/update, unique panel assignment averaging, pending/missing panels, results breakdowns, CSV/archive exports and locks, subject-scoped chat/drafts, proposal zoom/fullscreen/sandbox/error recovery, and mobile layouts. Adjacent regressions cover permissions, authentication/session expiry, registration, maintenance, analytics, navigation, and tutorials. Fresh desktop and mobile grading screenshots were inspected; descriptions wrap and the decorative edge stripes are removed. Local browser artifacts are in ignored `front-end/test-results/`.

Backend permission and validation checks cover cross-instructor/subject access, protected rubric ownership fields, invalid ratings, zero scores, legacy range scoring, revoked assignments, and historical/deleted-panel evaluations. The schema additions are optional; no database migration or dependency change is required.

Release assessment: GO for the tested Git changes. Vite reports a chunk larger than 500 kB; the build succeeds. Firefox, Safari, screen readers, production storage/services, load testing, and a live deployment smoke test are NOT VERIFIED in this pass. Repository pushes may trigger existing hosting automation; this check does not claim deployment health.

Recovery: retain backend support for saved percentage rubrics. Reverting only the frontend presentation is safe; a full backend rollback after new percentage rubrics have been saved requires preserving the new scoring semantics. No production data or infrastructure was modified during testing.
