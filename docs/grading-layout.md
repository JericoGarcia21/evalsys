# Grading layout

The supplied screenshot showed oversized rating cards, repeated full-width score fields, weak selection feedback, and section names repeated inside every card. The revised layout follows a single criterion flow grouped under rubric section headings. Each section shows rated count and earned/possible points. Criterion descriptions remain visible, with compact earned-point fields and neutral rating buttons; only the selected rating has a blue outline, check mark, and pressed state. Every rating shows its corresponding points.

A sticky summary keeps rated count, the current panel total, and a feedback/submit shortcut available while scrolling. The duplicate large total card was removed, active rubric information is shown as a simple text summary, and group members use a disclosure. The grading route uses horizontal clipping rather than an unbounded nested scroll container so the existing group navigator and the new summary can stick to the viewport. Other routes retain their scroll layout.

Scoring formulas, percentage rounding, rubric content, drafts, grading locks, offline handling, and submission contracts are unchanged. No dependency or backend change was needed.

## Verification

- `npm.cmd run build` in front-end passed, with the existing Vite bundle-size warning.
- `npm.cmd run test:e2e -- test/rubrics.spec.ts test/workflows.spec.ts --grep "percentage rating buttons|panel can submit|panel draft survives|results remain pending|panel assigned groups|floating chat preserves" --reporter=list` passed all 6 selected tests.
- Checks cover all 16 template criteria in three sections, selected/unselected pressed states, keyboard rating selection, 10.8-point decimal persistence, exact 90-point total, rated count, sticky total visibility on desktop/mobile, reload restoration, successful submission/update, legacy numeric grading, offline drafts, pending results, subject switching, and chat preserving grading drafts.
- Desktop and mobile screenshots were visually inspected at 1280 by 720 and 390 by 844. Review found a narrow mobile score field and a non-sticking summary in the first iteration; the final layout moves descriptions below the title/score row, gives numbers more space, and corrects the grading route's scroll container. Final screenshots show complete decimal scores and visible running totals.
- `git diff --check` passed. Backend tests were not repeated for this frontend-only change.

Firefox, Safari, screen readers, and exhaustive keyboard navigation were not tested. No performance gain or live deployment is claimed.

## Criterion description readability

The criterion descriptions now use 16px text, 28px line height, and a stronger text color. They wrap across the available card width, preserve line breaks, and remain visible above the ratings. Criterion titles also use 16px bold text. Score fields and rating groups reference their description through `aria-describedby`.

The quoted Conceptual Design Documentation description was checked on desktop and mobile, including full text visibility, no horizontal clipping, rendered typography, and an accessible description on the rating group. The light-theme text contrast calculation passed the 4.5:1 threshold; this is a scoped check, not an accessibility conformance claim. Both viewport screenshots were visually inspected. The focused percentage grading browser test passed, including decimal scoring, submission and draft reload, and the frontend build passed. The first test attempt had an overly scoped descendant locator, which was corrected before the successful run. Screen-reader behavior was not tested.

## Theme color refinement

The grading form uses the existing primary blue (`#2563EB`) for soft section headers, tinted score fields, and the running total. Cards and the progress bar use thin neutral borders without decorative edge stripes. Selected ratings have a solid blue background with white labels, points, and a check mark; unselected options retain a very pale blue tint. Criterion descriptions keep their dark text and white background.

After the color change, `npm.cmd run build` passed, and `npm.cmd run test:e2e -- test/rubrics.spec.ts --grep "percentage rating buttons" --reporter=list` passed. Desktop and mobile grading screenshots were visually inspected, description contrast/wrapping assertions passed, and white text against the primary-blue token was calculated at 5.17:1 contrast. `git diff --check` passed. No new palette, dependency, scoring change, or backend change was introduced. Firefox, Safari, and screen readers remain untested.
