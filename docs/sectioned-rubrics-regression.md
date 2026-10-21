# Sectioned rubric regression report

Run date: 2026-10-21. Environment: Windows, local Chrome through the existing Playwright runner, Express API and temporary MongoDB fixtures. Branch: dev, working tree based on commit 534444e0a3a66d97613a0e690067e354f6f50bec, including the uncommitted sectioned-rubric implementation and regression fixes. No production database or live infrastructure was changed.

## Reproduced defects and fixes

1. Renaming Conceptual Design in a saved document template changed its system key from `section0criterion1` to `revisedConceptualDesign1`. Saved scores use these keys, so a rename must preserve them. The browser regression failed with those exact expected and actual values before the fix. The editor now preserves existing keys and generates a unique identifier only when naming a new criterion. Browser checks pass for renaming, and for deleting a criterion then adding another with the same label in a different section.
2. Selecting 90% for all 16 template criteria produced an API total of `90.00000000000001` instead of `90`. The exact-total API assertion failed before the fix. API submission, the evaluation save hook, and the panel's displayed total now round to two decimal places. The API and browser submission assertions pass with an exact total of 90; individual scores such as 10.8 remain intact.

## Executed checks

| Command and location | Result |
| --- | --- |
| back-end: `npm.cmd test` | 56 passed, 0 failed |
| back-end: `npm.cmd run check` | 64 JavaScript files passed syntax checks |
| front-end: `npm.cmd run build` | Passed, with Vite's bundle-size warning |
| front-end: `npm.cmd run test:e2e -- test/rubrics.spec.ts test/workflows.spec.ts test/score-exports.spec.ts --reporter=list` | 17 passed, 0 failed |
| front-end: `npm.cmd run test:e2e -- test/rubrics.spec.ts --grep "manual percentage" --reporter=list` | 1 passed, 0 failed; added after the 17-test run |
| repository: `git diff --check` | Passed |

The initial browser attempts exposed one test locator mismatch and a test setup that had not explicitly selected QA101. These were corrected before relying on those tests. During the 17-test run, sandbox permissions blocked Playwright's test-server cleanup; terminating only the two test servers with the required execution permission allowed the runner to exit successfully. The final focused browser run used that permission and exited normally.

## Covered behavior

- All 16 document criteria and section totals of 40, 30, and 30; instructions, descriptions, and rating metadata survive save, read, and partial update.
- Failed rubric save leaves the form populated and permits a successful retry.
- Duplicate names are accepted across sections and rejected within the same section. New criterion keys remain unique after removal and insertion; existing keys survive renaming.
- Manual percentage rubric creation and editing a rating from 90% to 85% recalculates 12 points to 10.2.
- Mouse and keyboard rating selection, read-only calculated score inputs, draft restoration, submission, and submitted-score reload retain decimals.
- Zero ratings work; missing, blank, nonnumeric, negative, excessive, and non-rating scores are rejected without altering saved scores.
- Cross-instructor edits fail; protected subject, owner, and activation fields cannot be changed through a rubric edit. Malformed metadata and rating percentages are rejected.
- Full template grading by two panels produces final results of 90, including a 10.8 criterion average. Activation maintains one active rubric, and deletion preserves saved evaluations and selects a replacement.
- Legacy integer score rounding, grading updates, offline drafts, completed versus pending results, CSV sorting, session handling, subject switching, and adjacent registration/chat workflows pass their existing regressions.
- The 390 by 844 mobile editor and grading view have no horizontal document overflow. The captured mobile editor viewport was visually inspected. Tab navigation and Enter activation of a rating were exercised.

## Remaining evidence gaps

Firefox, Safari, screen-reader testing, exhaustive keyboard navigation, all possible viewport sizes, and production deployment behavior were not checked. The browser CSV regressions verify existing export behavior; weighted results are verified through the API, rather than through a new real-data weighted CSV download. No load or performance improvement is claimed. Vite's bundle-size warning remains.

## Results table screenshot follow-up

The supplied Results screenshot showed names squeezed into a narrow Members column, making every row tall with a 16-criterion rubric. The desktop table now puts names inside a collapsed member disclosure beneath each group, keeps the group column visible during horizontal scrolling, and gives criterion headers at least 160 pixels. Member data and CSV exports remain intact. The scroll region supports keyboard focus; the existing mobile cards remain available at narrow widths.

Executed after the layout change: `npm.cmd run test:e2e -- test/score-exports.spec.ts --reporter=list` passed all 3 tests, and `npm.cmd run build` passed with the existing bundle-size warning. The new test uses the full 16-criterion template and five members, verifies the collapsed row is below 160 pixels tall, expands and collapses names with Enter, checks the group and final result remain visible at the far right, confirms all members remain in CSV, and checks mobile page overflow. The final desktop screenshot at 1280 by 800 was visually inspected. `git diff --check` passed. Backend tests were not repeated because this follow-up changes only the Results UI and its browser regression.

## Direct comparison with the Word source

Verified the current `D:\Downloads\Database_Final_Project_Complete_Rubrics.docx` on 2026-10-21 with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-database-rubric.ps1 -DocumentPath 'D:\Downloads\Database_Final_Project_Complete_Rubrics.docx'`. The read-only verifier opens the OOXML content without changing or closing the user's document. SHA-256 of the checked source: `26644FA12292BE0CFB1A141C95AC396BE812B2C9DDE3150A34FF23B85E49511D`.

Result: all 16 criterion names, descriptions, weights, section membership, and percentage scoring modes match; all 5 rating labels, descriptions, and percentages match; section totals match at 40/30/30, totaling 100; every body paragraph matches the stored instructions, including group size, related subject, presentation requirements, evaluation notes, and the 34 + 26 + 25 = 85 example. Letter prefixes are omitted from criterion labels for the application's own numbering. No rubric content correction was needed.

The browser save regression now checks all saved criteria and instructions against the verified template and all 80 rating definitions and calculated scores against the document's scale. Executed `npm.cmd run test:e2e -- test/rubrics.spec.ts --grep "template handles failed save" --reporter=list`: 1 passed, 0 failed. This verifies a newly created rubric, not existing user-edited records. No application source changed during this comparison, so the production build and backend suite were not repeated.

## Assigned-panel averaging follow-up

Added API regressions for the full document rubric with one panel assigned in both scopes, two panels assigned only to the group, and three unique panels across section and group assignments with an overlap. Checks cover pending results before the last submission, missing panel names, per-criterion averages, completed section results, group result detail, and export totals.

Before the fix, the one- and two-panel tests passed; the three-panel test failed with 86.66 instead of 86.67 for panel totals of 100, 90, and 70. Results summed criterion averages after rounding each one, while export averaged the full panel totals. Section and group result endpoints now calculate the final total from unrounded criterion sums divided by the existing divisor, then round once. Criterion display values retain two-decimal rounding. Assignment union, missing-panel checks, and the historical-evaluation fallback divisor remain unchanged.

After the fix, `npm.cmd test` in back-end passed all 59 tests, including these three new cases and the existing deleted-panel preservation regression. `npm.cmd run check` passed all 64 JavaScript files. `git diff --check` passed. Frontend tests/build were not repeated because this follow-up changes only backend arithmetic and API tests. No live records were rewritten.
