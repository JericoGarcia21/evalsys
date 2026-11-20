# Super-admin visibility — Phase 1

## Approved scope and requirements

Approved on 2026-11-20: extend Operations with a read-only permission matrix,
server-filtered audit browsing, and filtered CSV export. Preserve the existing
instructor-only grading-lock route and unrelated local work. Dashboard widgets,
editable roles, archive restore, session management, and deployment are excluded.

## Architecture and API contract

Use the existing React/Express/Mongoose stack without new dependencies or schema
changes. Operations has Overview, Audit Log, and Permissions sections. The matrix
documents reviewed route/controller behavior; it is not an authorization engine.
Future permission changes must update its descriptions and regression tests.

- `GET /api/operations/audit-logs`: existing super-admin gate; optional `actor`
  (literal case-insensitive name/email substring, max 120 characters), `action`
  (exact match, max 120), `status` (`success`/`failed`), `from`, `to` (strict
  `YYYY-MM-DD`). Dates include whole UTC days; end is exclusive next midnight.
  Invalid inputs return 400. `page` and `limit` are positive integers (limit
  capped at 200); `page` or `paginate=true` returns `{ items, pagination }`.
  Legacy calls retain the array response, defaulting to the latest 80 records.
  Both results and totals use the same filter, ordered newest first with ID ties.
- `GET /api/operations/audit-logs/export`: same authorization and filters, ignores
  pagination, exports all matching records up to 10,000. More returns 413 with
  instructions to narrow filters. Empty results return header-only CSV. The
  response is an attachment with `Cache-Control: no-store`.

CSV columns: ID, timestamp UTC, action, status, actor name/email/role, entity
type/ID/name, instructor, subject. IP addresses, user agents, and arbitrary
metadata are excluded. Actor/entity snapshots remain usable after account
deletion; linked instructor/subject names may be empty if deleted.

## Security and limitations

All API access stays super-admin-only, independent of navigation visibility.
Search escapes regular-expression syntax and rejects structured query values.
CSV quotes delimiters/newlines and neutralizes leading spreadsheet formulas.
An `audit.export` event records filters and exported row count after generation;
it is not included in that export. Logging remains best-effort under the existing
audit service: no tamper-proof/compliance-delivery guarantee is made. The matrix
does not grant permissions or implement archive restore. Subject reassignment is
not a full workspace/ownership transfer. Existing audit indexes are reused; query
performance at production scale has not been benchmarked.

## Acceptance criteria and implementation plan

1. Add shared bounded audit filters and CSV serialization; extend list/export APIs.
2. Add independently loaded Operations sections, accessible filter controls,
   server pagination, UTC labels, loading/empty/error/retry states, CSV feedback,
   and read-only permission descriptions. Cancel stale browse requests.
3. Test combined filters and boundaries, malformed inputs, role denial, paging,
   CSV safety, export overflow, failure/retry, mobile layout, and instructor-only
   grading locks. Preserve existing Operations tools.
4. Bump release notes and run backend syntax/tests, frontend build, and targeted
   Playwright tests using isolated in-memory databases. Record actual outcomes.

## Verification

Verified locally on 2026-11-20 on the working `dev` tree (with existing local
changes preserved), using isolated MongoDB memory servers and Chrome:

- `back-end/`: `npm run check` — PASS, 66 JavaScript files.
- `back-end/`: `npm test` — PASS, 74 tests, including filter validation, UTC
  boundaries, legacy response compatibility, role/ownership denial, CSV safety,
  export audit metadata, and exactly 10,000 versus 10,001 matching records.
- `front-end/`: `npm run build` — PASS. Vite still reports a main chunk over
  500 kB; bundle splitting is outside this feature's scope.
- Targeted ESLint on both new components, Operations, the new audit browser
  tests, and the adjusted sidebar test — PASS.
- `npm run test:e2e` — first 47 cases passed before the 240-second command
  timeout, including all five new audit/permission cases. These cover real CSV
  download across pages, empty/reset states, load/export failure and retry,
  stale-request cancellation, narrow-screen keyboard access, and route denial.
- Remaining browser files were run with `npx playwright test
  test/score-exports.spec.ts test/sidebar-mobile.spec.ts test/tutorials.spec.ts
  test/workflows.spec.ts`: 25 passed; one existing sidebar assertion expected a
  Super Admin grading-unlock button removed by the approved instructor-only
  policy. Updated that assertion to require no grading controls or grading-lock
  writes. `npx playwright test test/sidebar-mobile.spec.ts` then passed all four.
  All 73 browser cases have passed across the split runs; there was no completed
  single full-suite run.
- Changed-file `git diff --check` — PASS. A whole-worktree check flags existing
  trailing whitespace in the unrelated local `RegisterGroup.tsx` change; it was
  not modified for this feature.

No deployment, production data access, or live infrastructure changes. Production
query performance, screen-reader behavior, and guaranteed audit-write delivery
are not verified by these checks.
