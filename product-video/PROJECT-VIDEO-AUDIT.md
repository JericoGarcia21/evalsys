# Project-to-video coverage audit

Reviewed 2026-10-24 on `dev`, against the current working tree rather than an
independently deployed release. Paths below are relative to the repository.

## Claims in the 77-second film

| Time | Claim and finding | Implementation evidence |
| --- | --- | --- |
| 3–12s | Active Database preset: 16 criteria, 40/30/30. Matches one existing preset, not a universal rubric. | `front-end/src/pages/admin/Rubrics.tsx`, `front-end/src/data/databaseRubric.json` |
| 12–28s | Valid instructor link, member entry and registration confirmation. Real registration captured; four members are this example. Students need no dashboard account. | `front-end/src/pages/RegisterGroup.tsx:57`, `:106`, `:129`; `back-end/src/controllers/registrationLink.controller.js` |
| 28–50s | Assigned panel rates criteria and submits feedback. Actual controls and successful submission; grading must be open. | `front-end/src/pages/panel/Grade.tsx:373`, `:382`, `:900`; `front-end/src/data/ratingScale.ts`; `back-end/src/controllers/evaluation.controller.js:213` |
| 50–61s | Demo totals 90 and 80 average 85; member CSV downloads. Actual results verified. Final results require all assigned panels; incomplete results are pending. | `back-end/src/controllers/evaluation.controller.js:388`; `front-end/src/pages/admin/Results.tsx:185`, `:441` |
| 61–73s | Installable PWA with browser-specific guidance. Chrome eligibility/offer verified; instructions do not prove native installation on every OS. | `front-end/public/manifest.webmanifest`, `front-end/src/components/InstallAppNotice.tsx` |
| 73–77s | Internet needed for server actions. Local drafts do not mean offline submission. | `front-end/src/pages/panel/Grade.tsx:373`, `:961`; API-backed registration/auth/results |

Capture: `front-end/scripts/product-video.capture.spec.ts` (one passing test).
Playback: `front-end/test/product-video.spec.ts` (four passing tests).
Script/captions: `product-video/remotion/src/story.json`.

## Whole-project inventory and omissions

Routes/role restrictions were cross-checked in `front-end/src/App.tsx`; README
supplied the wider feature inventory. This inventory does not establish that
unshown features were independently tested in this video review.

| Implemented area | Film coverage | Source under `front-end/src/` |
| --- | --- | --- |
| Instructor-owned rubrics | Active preset shown; custom authoring omitted | `pages/admin/Rubrics.tsx` |
| Subjects, blocks, accounts and panel assignments | Prepared prerequisites; setup screens omitted | `pages/admin/Subjects.tsx`, `Sections.tsx`, `Users.tsx`, `AssignPanels.tsx` |
| Registration links and group management/import | Public registration shown; link creation/import/editing omitted | `pages/admin/RegistrationLinks.tsx`, `Groups.tsx` |
| Panel grading, feedback, results and member CSV | Main demonstrated flow | `pages/panel/Grade.tsx`, `pages/admin/Results.tsx` |
| Draft recovery, grading locks and grade updates | Omitted | `pages/panel/Grade.tsx` |
| Optional proposal uploads and previews | Omitted | `pages/RegisterGroup.tsx`, `pages/ProposalViewer.tsx` |
| Pending results, feedback details and group-summary CSV | Not taught separately | `pages/admin/Results.tsx` |
| Local score/comment Insights | Omitted; no automatic AI grading claim | `pages/admin/AIInsights.tsx` |
| Instructor/panel subject-team chat | Omitted | `pages/panel/PanelChat.tsx` |
| Interactive guided tutorials | Omitted | `tutorial/` |
| Super Admin analytics, limits, maintenance, announcements, operations, security and archives | Omitted | `pages/admin/Analytics.tsx`, `Subscription.tsx`, `SystemControl.tsx`, `Operations.tsx`, `SecurityMonitor.tsx`, `LegacyData.tsx` |
| Sign-in, password changes and account security | Authentication established before recording | `pages/Login.tsx`, `ChangePassword.tsx`, `AccountSecurity.tsx` |
| PWA installation and updates | Installation explained; update lifecycle omitted | `components/InstallAppNotice.tsx`, `UpdateAvailableNotice.tsx`, `registerServiceWorker.ts` |

## Assessment

No unsupported feature claim was found in the current storyboard/captions.
The demonstration is internally consistent with the actual fixture, rubric and
scoring implementation. It does not cover the whole application's feature set.
Keep it labeled a core-workflow overview; exhaustive onboarding requires slower
role-specific tutorials covering setup and error cases. A successful render or
audio audit does not prove unshown features work. See `REVIEW.md` for export
measurements and remaining review limits.

## Cinematic recreation

The recreation preserves this claim inventory, authentic synthetic source footage and the same 77-second chapter boundaries. Titles and visual treatment changed; the music is a new energetic original electronic arrangement. No new capture or unshown feature test is claimed. Current export measurements and playback evidence are in REVIEW.md and out/qa.md.

## Full-frame capture revision

The latest revision recaptures the redesigned app, includes all four middle names and shows Focus grading with guidance visible. The same preset, scores, synthetic four-member group and chapter timing remain. Current footage is not the earlier camera-zoom capture. See REVIEW.md for the explicit Computer Use playback-review blocker and the latest measured/automated evidence.
