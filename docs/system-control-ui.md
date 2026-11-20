# System Control interface refinement

## Scope / direction

Requested: refine the Super Admin System Control UI, alongside the dashboard-icon
and sidebar cleanup. No API, privilege, targeting, maintenance or scheduling-policy
changes. Super Admin changes are recorded internally with an empty release-note
audience, so no What's New popup is added.

Use the existing product's restrained blue/slate visual language. References
inspected on 2026-11-20: `front-end/src/theme.css` (palette, typography, focus,
borders), `PlatformAnalytics.tsx` (compact administrative hierarchy), and the
current System Control/preset forms (real fields and states). No external visual
reference or additional asset library is needed for this existing-product change.

## Design and acceptance

- One compact saved-status strip, not a collection of unrelated metric cards.
- Distinct Announcements / Maintenance views, linked by URL; keep draft state when
  switching. Announcements is the default; maintenance links open its view directly.
- A clear content → audience → schedule hierarchy with properly labelled fields.
- Separate draft preview and delivery summary; distinguish unsaved edits from the
  saved notice status. Avoid implying that checking Publish has already published.
- Maintenance timing/message forms first, presets as a secondary reusable tool,
  and a separate access-impact/current-window preview. Loading presets still does
  not start downtime. Retain all original confirmations and field/action names.
- Use existing fonts, 13–14 px body/form text, 20–29 px headings, 8 px surface
  radii, subtle borders, readable muted text and semantic status colors. Meaningful
  SVGs only; no invented counts, illustrations, gradients or decorative charts.
- Desktop uses a form/preview split. Narrow screens stack into one column, with
  contained long messages and visible action buttons. Preserve keyboard focus,
  native input behavior. Main notice/schedule confirmations use a native modal
  dialog for focus containment, Escape cancellation and focus return; preset
  deletion retains its existing shared confirmation behavior.
- Verify dashboard icons and removed Super Admin sidebar controls, preserved
  instructor selectors, scheduling/announcements/preset flows, draft preservation,
  mobile overflow, failure states, build and targeted lint. Inspect actual desktop
  and mobile captures; record observed results, not source-only visual claims.

## Verification

Pending.
