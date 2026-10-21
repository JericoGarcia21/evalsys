# Results overview

The Results screenshot showed 16 criterion columns pushing the final score off screen. Results now opens with four columns: group, panel progress, final score, and details. The same content stacks on mobile. Criterion scores, members, submitted panels, comments, and score management are available through each group's View breakdown button. Only one breakdown opens at a time, and criteria are grouped by their rubric section. This replaces the earlier horizontally scrolling Results table.

Missing panel names remain visible directly in the main row as `Not evaluated yet: ...`, as explicitly requested. They are also available in the breakdown. Pending groups do not expose provisional totals as completed grades. A section summary shows group count, completed count, and the number awaiting scores. Export permissions remain enforced; locked exports use one notice and retain distinct, disabled button labels.

The result API now includes the existing optional criterion section and description in its serialized metadata. No model migration, authorization change, scoring change, or new dependency was needed. Older rubrics use a generic Criteria heading; a result with no known rubric maximum displays its score without an invalid `/ 0` denominator.

## Verification

- `npm.cmd run build` in front-end passed with the existing Vite bundle-size warning.
- `npm.cmd run check` in back-end passed all 64 JavaScript files.
- `npm.cmd test` in back-end passed all 59 tests, including metadata persistence and panel averaging regressions.
- `npm.cmd run test:e2e -- test/score-exports.spec.ts --reporter=list` passed all 3 tests after the final changes.
- The existing 12 tests in workflows.spec.ts passed during the broader Results regression run. That run initially failed the new Results test because its 10.8 score locator matched two valid criteria. The locator was corrected and the focused suite passed.
- Browser checks cover a 16-criterion rubric, four-column layout without horizontal scrolling, final score visibility, visible missing panel names, keyboard breakdown and member disclosure, section grouping, comment access, score-management access, CSV content and ordering, export locks, legacy results without rubric metadata, and mobile overflow.
- Desktop overview, expanded breakdown, and mobile overview screenshots were visually inspected at 1280 by 900 and 390 by 844. `git diff --check` passed.

Firefox, Safari, exhaustive keyboard navigation, and screen readers were not tested. No performance improvement or live deployment is claimed.
