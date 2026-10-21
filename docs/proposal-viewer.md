# Proposal viewer improvements

The screenshot showed a fixed-size Word preview on a dark gray canvas, without reading controls. The viewer now uses the existing interface styles with a compact document header, a softer canvas, zoom controls, Fit width, a 100% reset, rendered page count, and a browser full-screen Expand view action. Group, subject, block, filename, and the return-to-grading link remain visible. Word pages fit the available width initially and after viewport changes; larger zoom levels scroll within the document frame.

The existing DOCX renderer, document formatting, API contract, access checks, PDF display, and legacy Word text preview are retained. No dependencies or backend changes were added. The Word iframe keeps an empty sandbox and its restrictive content security policy; document hyperlinks remain disabled. Full-screen rejection displays a recoverable message, and damaged DOCX files retain the unavailable-document state and return link.

## Verification

- `npm.cmd run build` in front-end passed; Vite's existing bundle-size warning remains.
- `npm.cmd run test:e2e -- test/panel-dashboard.spec.ts --reporter=list` passed all 7 tests.
- New browser coverage uses a two-page DOCX fixture and checks page count, zoom in/out, 100% reset, keyboard activation, Fit width after resize, full-screen entry/exit, full-screen failure, damaged-file handling, iframe sandbox, and disabled hyperlinks.
- Existing PDF preview, return-to-grading, dashboard subject filtering, error handling, selected group navigation, and member disclosure regressions passed.
- Desktop and mobile screenshots were visually inspected at 1440 by 1000 and 390 by 844. Mobile page width stays within the viewer, and the app has no horizontal document overflow.
- `git diff --check` passed. The first browser attempt had an ambiguous status-message locator because the zoom output is also a status region; the corrected test passed.

## Limits

Zoom and Fit width regenerate the sandboxed preview and can reset its scroll position. Page counts reflect the renderer's sections, rather than a guarantee of identical Microsoft Word pagination. Firefox, Safari, screen readers, and the exact proposal shown in the screenshot were not tested. Backend checks were not repeated for this frontend-only change.
