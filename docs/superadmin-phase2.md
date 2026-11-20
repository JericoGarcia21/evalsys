# Phase 2 — account control and safe offboarding

## Authorization and scope

Implementation authorized on 2026-11-20. Use the existing stack. Add account
control inside Operations; preserve existing account tools and grading policy.
No deployment or live data changes. Do not announce super-admin-only features in
the in-app What's New popup. Shared authentication changes receive instructor/
panel release notes only, per the repository release workflow.

## Requirements, architecture, and decisions

1. Persistent seven-day login sessions with JWT session ID and account version,
   expiry, last-seen timestamp, bounded user agent and IP. Never store JWTs.
   Validate session and active account before response caches. Legacy tokens
   without tracked sessions are rejected (release requires re-sign-in).
2. Super Admin can inspect any account's active sessions and revoke one or all,
   with confirmation and auditing. Logout revokes the current session. Account
   deactivation and password resets bump the account version, so reactivation
   cannot resurrect old tokens. Self-service password changes return a replacement
   token while invalidating older sessions. Expired records have a TTL index.
3. Instructor lifecycle has explicit, idempotent activate/deactivate actions, a
   computed offboarding checklist, and an audited archive-review acknowledgement.
   Bulk reset supports 1–20 instructors atomically; generate distinct strong
   passwords on the server with crypto, require change at next sign-in, display
   results once in memory, and never persist plaintext in logs or browser storage.
4. Ownership transfer moves complete selected **subject workspaces**, including
   every source-owned block/group, rubric, registration link, grading-lock setting,
   assigned/historical panel account, and subject chat room. It is not selective
   single-block splitting: panels have a single owner, and rubrics/chat are shared
   within a subject. Shared panels used outside the selection must be resolved by
   including those subjects. Reject foreign-owned/inconsistent references and
   destination workspace collisions instead of silently detaching or merging data.
5. Transfer requires immediate active maintenance and an inactive source. Validate
   source assignments, active destination, destination quota, and all dependencies
   again inside a MongoDB transaction. Copy no grades, delete no data, preserve all
   object IDs/evaluation scores/member data/archive snapshots/history. Proposal
   blobs stay at the existing storage path; record the original storage owner
   server-side so validation continues to bind the path to the same subject/group.
   Audit transfer inside the same transaction; abort if auditing fails. Revoke
   involved sessions so re-login refreshes ownership and scope.
6. Bulk reset and transfer require MongoDB replica-set/sharded transaction support.
   Unsupported standalone databases return 503 without fallback partial writes.
   No infrastructure is changed automatically. Preview is advisory; execution
   always revalidates. Operations must be quiescent during maintenance; requests
   already in flight cannot be recalled by session revocation.

## API surface

All `/api/account-control/*` endpoints use `protect` and `superadminOnly`:

- `GET /accounts/:id/sessions`; `POST /accounts/:id/revoke-sessions`;
  `POST /accounts/:id/sessions/:sessionId/revoke` (confirm `SIGN OUT`).
- `PATCH /instructors/:id/status` with boolean `isActive` and confirmation
  `ACTIVATE` or `DEACTIVATE`.
- `GET /instructors/:id/offboarding`; `POST /instructors/:id/offboarding-review`
  (confirm `REVIEW ARCHIVE`). Checklist counts are computed, not client claims.
- `POST /password-resets` with unique `instructorIds`, confirm `RESET PASSWORDS`.
- `POST /transfers/preview` with `sourceId`, `targetId`, `subjectIds` (1–20);
  `POST /transfers` with the same and confirmation `TRANSFER`.
- `POST /api/auth/logout` for the current account, also allowed during temporary
  password/maintenance restrictions.

Malformed/structured values return 400, forbidden roles 403, missing accounts 404,
conflicts/unsafe dependencies 409, transaction support unavailable 503. Responses
containing sessions, previews, or temporary credentials are `Cache-Control:
no-store`. Session details are browser-reported hints, not verified device IDs.

## Security / QA plan

Risk-based OWASP ASVS 4.0.3 scope: authentication/session invalidation (V2/V3),
server-side access control (V4), data integrity/transaction atomicity (V5/V11),
and sensitive-data exposure (V8). No compliance certification is implied.

Test real login/revocation, expiry, wrong account session IDs, role denial,
reactivation not reviving tokens, forced password rotation and replacement token,
bulk limits/no plaintext audit, invalid/missing IDs, quotas, shared panels,
destination collisions, maintenance/source preconditions, successful grade/file/
chat/link preservation, transaction rollback and standalone refusal. Browser tests
cover confirmations, error/retry, ephemeral credentials, checklist and mobile
forms. Run project backend syntax/tests and frontend build and focused E2E.

## Verification

Verified on the working `dev` tree on 2026-11-20 with unrelated local changes
preserved:

- Backend `npm run check`: PASS, 73 JavaScript source files.
- Backend `npm test`: PASS, 89 tests. New tests use an isolated one-node replica
  set for real transactions, plus the existing standalone test database to prove
  safe refusal. Coverage includes expiry, session/account binding, cached-route
  invalidation, logout during maintenance/temporary-password flow, reactivation,
  replacement tokens, bulk rotation, no plaintext audit data, rollback on audit
  failure, malformed inputs, quotas, shared panels, inconsistent references, and
  unchanged grade/file/chat/link identity after transfer. Proposal reads use a
  loopback fake Supabase adapter, never live storage.
- Frontend production build: PASS, with the existing large-chunk warning.
- Targeted ESLint on new/modified account/auth/Operations components and browser
  tests: PASS.
- Browser regression coverage: all 74 non-video cases passed across split runs.
  The broad run hit the 300-second tool timeout after 50 completed cases (49
  passed and one new test blocked by an undismissed existing success modal).
  Corrected the test to dismiss the modal. The remaining files plus all five new
  account-control cases then passed in one 31-case run. A previous audit failure
  mock was made deterministic so cancelled requests cannot consume the one-shot
  failure. The four unrelated product-video/PWA cases were not rerun for Phase 2.
  No completed single full-suite run is claimed.
- Final focused account-control browser run: all five cases PASS, including the
  unavailable-clipboard fallback. Final frontend build and targeted lint PASS;
  whitespace check PASS excluding the pre-existing unrelated trailing space in
  `front-end/src/pages/RegisterGroup.tsx`.

### Operational limits and rollout notes

- A release invalidates all old untracked tokens. Users must sign in again.
  Database fields are additive; legacy account session versions default to zero.
  Ensure normal model indexes (especially the session expiry TTL) are installed.
- Transactions preserve transfer/reset audit records atomically. Existing
  single-account audit actions still use the repository's best-effort logger;
  logs are not a guaranteed/tamper-proof compliance record.
- Offline sign-out clears local authentication and warns if server revocation
  could not be confirmed. Other copies can remain valid until expiry/admin
  revocation. Existing signed proposal URLs and already-running requests cannot
  be recalled. Password/reset/transfer revocation is enforced at the next request.
- One-time passwords are intentionally unrecoverable after leaving the view or
  losing the response. Reset again if secure delivery fails; do not persist or
  screenshot them. Clear the clipboard after manual delivery.
- This is whole-subject workspace transfer, not selective single-block splitting.
  Active/unassigned source panel accounts remain for explicit review/deactivation.
  Destination CSV limits/AI credits remain destination account policies; subject
  grading locks are carried across without granting Super Admin grading control.
- Production load, real device identification, live storage, screen-reader
  behavior, and deployment remain outside the local test scope. No infrastructure
  was changed or deployed.
