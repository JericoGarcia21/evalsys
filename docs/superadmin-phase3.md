# Phase 3 — operations and reporting

## Approved scope and decisions

Authorized on 2026-11-20: targeted/scheduled announcements, reusable maintenance
presets, archive search/export, and analytics CSV reports. PDF remains optional
and is not implemented. Preserve current authorization, maintenance semantics,
archive repair/deletion confirmations, local work, and earlier phases. Do not
announce Super Admin tools in What's New. User-facing notice delivery changes may
be described to instructors/panels under the repository release-note workflow.

## Requirements, architecture, API

### Announcements

Extend the existing single platform announcement (not a multi-message campaign
system) with roles (`admin`, `panel`), subject IDs (empty = all subjects), and
optional start/end ISO timestamps with timezone. Roles and subjects combine with
AND. Instructor matching uses actual assigned subjects; panel matching requires
current block/group assignment under an active instructor who owns the subject.
Server checks ignore client-selected subject/instructor headers.

`PATCH /settings/system-controls` remains Super Admin only and validates bounded
text, booleans, role/subject arrays and schedule ranges before saving anything.
`GET /settings/notices` authenticates and returns only a currently active matching
notice, including end time for client expiry. It remains readable in maintenance,
but temporary-password restrictions stay in place. Public settings expose only
maintenance status and an empty announcement placeholder. Non-admin settings
responses never expose unmatched or unpublished announcement content. No notice
response cache. Existing announcements default to both roles/all subjects.

UI polls every 10 seconds, clears targeted content on account changes/failure,
hides at end boundaries using the local clock, and keys dismissal by revision.
Start delivery can lag until the next poll; server time remains authoritative.
All notice text is rendered as text, not HTML.

### Maintenance presets

`/settings/maintenance-presets`: Super Admin GET/POST and DELETE `/:id`.
Store a unique case-normalized name (60 chars), message (250 chars), allowed start
delay (0/5/15/30 minutes), and optional duration (1–10,080 minutes). Save/list/delete
are audited. Loading a preset **only fills the form**. Existing explicit scheduling
confirmation remains required. Duration is applied relative to the actual chosen
start on the server (`maintenanceDurationMinutes` on system-controls), not the
time the preset was loaded or the confirmation dialog was opened. Presets never toggle maintenance or
change running windows automatically. No scheduler or infrastructure changes.

### Archive

Add Super Admin `GET /legacy-data/results` with literal case-insensitive subject,
block and group substring filters (max 120 chars each), `from`/`to` inclusive UTC
archive days (fall back to updatedAt if archive date absent), and server paging.
`GET /legacy-data/results/export` shares those filters, exports all matching pages
up to 10,000 records, and returns 413 on overflow rather than truncating. Preserve
snapshot names and score values, support deleted references, and sort groups A–Z
with subject/block/panel/ID tie breaks. Existing root API remains compatible;
`includeResults=false` lets the new UI request legacy metadata without loading all
results. Deletes remain separate: global deletion is labelled **all results**, not
the filtered subset, with the existing exact server confirmation.

### Analytics

`GET /operations/analytics/export?report=registrations|grading|proposals&days=7|30|90`
is Super Admin only. Extract the existing analytics collector for list/export
reuse. Registration reports use the chosen UTC calendar period. Grading/proposal
reports are current platform-wide snapshots, not time-filtered historical values,
and include all subject buckets, not only the dashboard's top 10. Fixed CSV columns,
generation time, clear platform/subject scopes, bounded result size. No raw student
or account detail is included. This phase does not change grading calculations.

## Security and QA

Keep server-side role gates, exact ownership checks and no-store report/notice
responses. Shared CSV escaping quotes delimiters/newlines and neutralizes leading
spreadsheet formulas in every text field. Audit management changes and exports,
without treating the existing best-effort logger as tamper-proof compliance
storage. Validate filters before querying; no arbitrary database operators/regex.

Tests: role denial, public/unmatched notice non-disclosure, instructor/panel and
direct-group assignment targeting, start/end boundaries, malformed payloads with
no partial settings writes, preset uniqueness/duration/no automatic activation,
archive combined filters/date fallback/paging/CSV safety/overflow, current score
preservation, analytics report parity/period semantics/all subject buckets, and
browser failure/retry/confirmations/downloads/mobile behavior. Run backend syntax
and tests, frontend build, targeted lint, and affected browser suites. No live
data, deployment, or production query-performance claims.

## Verification

Verified locally on the working `dev` tree on 2026-11-20; unrelated local work was
preserved and no deployment or live data access was performed.

- Backend `npm run check`: PASS, 80 JavaScript source files.
- Backend `npm test`: PASS, 100 tests. New coverage proves anonymous/unmatched
  notice non-disclosure (including the older grading-toggle response), actual
  instructor/block/group audience membership, exact time boundaries, no partial
  settings changes on invalid notices, preset uniqueness and no auto-activation,
  server-calculated durations, archive UTC fallback/filtering/pagination/CSV safety,
  exactly 10,000 versus 10,001 exports, existing score preservation, and analytics
  parity plus subject buckets beyond the top ten.
- Frontend `npm run build`: PASS. The existing main-bundle >500 kB warning remains;
  no bundle-performance improvement is claimed.
- Targeted ESLint on all Phase 3 components, utilities, pages and browser tests:
  PASS.
- All 48 affected browser cases passed across targeted runs (not a full-suite
  claim). The final 26-case run passed maintenance, all six new Phase 3 flows,
  and instructor/panel workflows. Other passing runs cover analytics, archive
  export ordering, legal access, and Phase 1/2 controls. New checks include notice
  timezone delivery/expiry/plain-text rendering, a stalled private notice not
  delaying maintenance, preset save/load/delete and explicit confirmation,
  archive all-page downloads and error/retry/mobile states, report downloads and
  export recovery.
- Two browser fixture issues were corrected: initial workspace auto-selection
  could replace a transient archive failure before retry; the test now fails a
  deliberate search after loading. The archive seed now uses its own instructor,
  subject and panel so it cannot change the shared instructor's default block.
- Tracked-file whitespace check: PASS excluding the pre-existing unrelated
  trailing space in `front-end/src/pages/RegisterGroup.tsx`.

## Rollout and limitations

Settings fields are additive; old announcements default to both roles/all subjects.
Ensure the new MaintenancePreset unique-name index is installed through the normal
database/model workflow. Deploy frontend and backend together when authorized:
older clients must refresh because the public endpoint no longer sends notice
text. Public maintenance status remains compatible. Notice starts can take up to
the polling interval to appear; private requests time out after eight seconds and
never hold up independent maintenance checks. Already-delivered notices cannot be
recalled instantly when permissions change, but are cleared on the next failed or
non-matching poll; account changes are gated immediately in the UI.

Archive/report exports contain sensitive administrative data: deliver/store them
appropriately. Filters operate on retained names, not rebuilt current ownership.
Grading/proposal CSVs are current snapshots and have separate Platform and Subject
rows; do not sum both scopes together. Only registration reports use the selected
period. Zero-group subjects have no subject bucket. Export limits refuse overflow
without silently dropping rows. Audit logging retains its existing best-effort
semantics; it is not a tamper-proof compliance guarantee.

Production query plans/load, live storage, screen-reader behavior, and the complete
browser suite were not verified for this phase. PDF reports, multi-announcement
campaigns, recurring maintenance automation, and deployment remain out of scope.
