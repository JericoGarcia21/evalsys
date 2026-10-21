# Sectioned rubrics

Authorized scope: extend Create Rubrics to support the supplied Database Final Project document, preserving existing range rubrics and instructor/subject permissions.

## Behavior and acceptance

Open Rubrics, choose New Rubric, then Use Database Final Project Template. The editable template contains 16 criteria across Project Requirements (40 points), Project Documentation (30), and Project Presentation (30). Save creates a normal instructor-owned rubric; loading and editing retain the criterion sections, descriptions, and rubric instructions.

New criteria can use score ranges or percentage ratings. Percentage ratings start with Excellent (100%), Very Good (90%), Good (80%), Needs Improvement (70%), and Not Submitted / Not Demonstrated (0%). Changing a weight or percentage recalculates its exact score to two decimal places. For example, 90% of 12 points earns 10.8 points. Panel members select a rating; arbitrary scores are rejected for percentage criteria. Section totals are derived from criterion maximum points, so no second set of weights can drift out of sync.

For panel averaging, section and direct group assignments form one unique panel set. Results stay pending until every assigned panel submits. Final grade is the sum of panel scores divided by that panel count, rounded once to two decimal places; displayed criterion averages are rounded separately. For example, three panel totals of 100, 90, and 70 produce 86.67. Existing historical evaluations remain included: the divisor is never smaller than the number of saved submitted evaluations, preserving the established behavior when assignments change or a panel is deleted.

## Data and API

The existing MongoDB/Mongoose rubric stores additive optional fields: `instructions` on rubrics; `section`, `description`, and `scoringMode` on criteria; and `percentage` on levels. Existing documents default to range scoring and need no backfill. POST and PUT `/api/rubrics` accept the new fields with the existing payload. Updates allow only title, criteria, and instructions, preserving ownership and activation scope. Criterion names are unique within a section; system keys remain unique across the rubric. The server checks calculated rating points and rejects overlapping levels. Evaluation storage already supports numeric decimals; percentage scores now bypass legacy integer rounding.

No dependency, deployment, live database migration, or infrastructure change is required. Removing the UI feature is reversible, but backend support must remain while saved percentage rubrics are in use to preserve scoring semantics.

## Verification

- `npm.cmd run check` in back-end: passed, 64 JavaScript files.
- `npm.cmd test` in back-end: passed, 56 tests, including the full template lifecycle, metadata validation, permissions, decimal scoring, exact totals, zero scores, and rejected-score recovery.
- `npm.cmd run build` in front-end: passed; Vite reports a bundle size warning.
- Selected Playwright browser regressions: passed, 18 tests across rubric creation/editing, failed-save recovery, manual percentage criteria, grading, offline drafts, results, CSV exports, and adjacent workflows. Mobile checks used a 390 by 844 viewport; keyboard checks covered rating entry, tab focus, and rating-button activation.

Regression testing found and fixed criterion keys changing on rename and floating-point total artifacts. Keys now remain stable and new keys are unique independently of list position. Evaluation storage and panel totals round to two decimal places. See [the regression report](sectioned-rubrics-regression.md) for reproductions, commands, and remaining gaps.

The template is bundled content based on the supplied document. General DOCX import is outside this change.
