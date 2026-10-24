# Website policies and deployment readiness — 2026-10-24

Scope: current local `dev` working tree. No release commit, push, hosting change,
provider account action, designated-agent registration, or deployment was made.

## Added

- Public `/terms`, `/privacy`, and `/copyright` routes with a common readable
  layout, revision date, contents navigation, contact links, and copyright.
- Copyright reads “© [current year] Jerico B. Garcia. All rights reserved.”
  The terms preserve third-party and user-content ownership/licensing.
- Landing, login, workspace and registration links. Registration links open in a
  new tab to preserve the current form. The existing required checkbox remains;
  it confirms authority to provide member details, not blanket consent on behalf
  of every member or a claim that statutory consent has been logged.
- Public policies remain readable during maintenance. Maintenance still blocks
  the normal application interface. The existing backend restrictions are intact.
- A copyright-removal contact process and Gmail draft template addressed to the
  developer. Requests are manually reviewed; clicking does not send a message
  or delete any content. No registered DMCA agent or safe-harbor status is claimed.

## Facts checked in the implementation

`Group`, `Evaluation`, `Admin`, `Panel`, `ChatMessage` and `AuditLog` models define
member/account names, emails, projects, proposals, ratings/comments, messages,
security events, IP/browser information and timestamps. Passwords are hashed.
Grading and chat drafts, session tokens and preferences use local storage.
The service worker caches application resources. Archived evaluations can
survive account/group deletion. There is no single configured expiry for all
academic records. Supabase Storage is supported for proposals; MongoDB holds
application records. The stylesheet requests Google Fonts; contact links use
Gmail. These observations do not verify production provider configuration.

## Decisions still needed before real student data is collected

The developer was asked who will operate the service and which student-record
retention period applies. These facts were not invented in the policies.

| Item | Current evidence / next action |
| --- | --- |
| Responsible operator and privacy contact | Developer name/email are known. Confirm the actual legal operator and the school/operator allocation of responsibility, plus appropriate privacy contact/address. |
| Processing basis and member notices | The institution/operator must establish the applicable basis for account and educational-record processing and give required notices to all affected people. A registration checkbox alone does not settle this. |
| Retention and disposal | Confirm periods for accounts, grades/archives, proposals, chat, security logs, support/copyright requests and backups. Define and test deletion/disposal procedures; the app does not enforce one automatic academic expiry. |
| Hosting, database, storage and transfers | Confirm actual providers, regions, access agreements and any transfer requirements. README targets Vercel/Render, MongoDB Atlas and Supabase; live services/regions were not checked. |
| Copyright handling | Monitor the published inbox and define manual review/escalation, contact with uploaders and handling of mistaken restrictions. If pursuing U.S. Section 512 protections, obtain jurisdiction-specific review of eligibility, designated-agent registration/public details, repeat-infringer policy and notices/counter-notices. A page alone is insufficient. |
| Student/school authorization | Confirm who may upload other members’ information and documents, and any school/guardian requirements applicable to the audience. |

The public notice currently states the implementation's retention limitations
and tells users to obtain institution-specific information. It must be reconciled
with the confirmed deployment arrangements before production collection. These
pages are not a certification of legal compliance.

## Technical release checks

| Check | Status for this change |
| --- | --- |
| Frontend production build | PASS. TypeScript/Vite succeeded; existing large-chunk warning remains. |
| Public policy routes and mobile reflow | PASS in focused browser tests at 320, 390 and 1440 px; screenshots produced. |
| Gmail request destination, template and no automatic writes | PASS. Request subject/recipient/template/new-tab attributes checked without sending mail. |
| Maintenance exceptions | PASS in focused tests; policy routes readable, login still shows maintenance. |
| Registration/grading/auth regression | PASS: all 24 focused cases passed (1.1 minutes), clean exit, including existing maintenance and workflow cases. |
| Backend source | Unchanged. No database migration or new account/removal endpoint. |
| HTTPS/custom domain and production SPA routing | NOT VERIFIED live. Existing `front-end/vercel.json` has a SPA rewrite; verify `/terms`, `/privacy`, `/copyright`, registration links and other deep links on the selected host. |
| Production secrets, API URL and CORS | NOT VERIFIED live. Use ignored environment files/provider secrets, production `VITE_API_URL`, strong `JWT_SECRET`, correct `FRONTEND_URL`/`CORS_ORIGINS`, and backend-only storage credentials. |
| Private storage and authorization | Verify actual bucket permissions, signed-link behavior and test accounts against the target environment. Local tests do not prove live storage settings. |
| Recovery and operations | Verify backups and a restore rehearsal, monitoring, mailbox monitoring, incident/contact process and rollback for the selected release. |
| Browser/assistive-technology coverage | Current checks use Chrome. Safari, Firefox and native screen readers not assessed in this change. |

The existing `docs/final-release-check.md` concerns an older revision and is not
approval of this working tree or a live deployment. Deploy only when explicitly
authorized, after resolving the relevant decisions and target-environment checks.

## Sources consulted

- [National Privacy Commission: right to be informed](https://privacy.gov.ph/the-right-to-be-informed/)
- [National Privacy Commission: Data Privacy Act](https://privacy.gov.ph/data-privacy-act/)
- [National Privacy Commission: data-subject rights](https://privacy.gov.ph/data-subject-rights/)
- [U.S. Copyright Office: Section 512](https://www.copyright.gov/512/)
- [U.S. Copyright Office: designated-agent directory](https://www.copyright.gov/dmca-directory/)

The notice and terms are original project-specific wording informed by these
sources and the code review, not copied policies or an assertion of endorsement.

## Reproduce local checks

From `front-end/`:

```powershell
npm.cmd run build
node scripts/run-regression-review.mjs --legal
```

The runner uses the disposable synthetic API fixture. It does not load production
records or change backend source. Browser evidence is under the ignored
`front-end/test-results/legal-review/` directory.

Final local result: frontend production build PASS; 24/24 focused browser cases PASS, clean shutdown. No backend source changes, no commit/push/deploy, and no DMCA registration was performed.
