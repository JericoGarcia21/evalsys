# Chat matches the instructor's current subject

The screenshot showed the instructor's sidebar on ITP09 while floating chat remained on ITEPC03. Floating and expanded chat previously selected a saved room or room URL before considering the workspace subject.

A shared subject-aware chat hook now restricts instructor chat rooms to the current sidebar subject before applying any saved room or URL preference. Subject changes remount the corresponding conversation, preserving existing per-room drafts and aborting the previous conversation's requests. If no room matches, chat displays an empty state with no message composer instead of opening another subject. The floating header names the actual room subject. Expanding chat uses the matching selected room.

Panel users retain their existing authorized team selector because their workspace has a separate subject-selection workflow. Room authorization, message persistence, polling, retry identifiers, and backend contracts are unchanged. This fix targets the instructor sidebar mismatch shown in the screenshot.

## Verification

- `npm.cmd run build` in front-end passed with the existing bundle-size warning.
- `npm.cmd run test:e2e -- test/chat.spec.ts test/workflows.spec.ts --grep "chat" --reporter=list` passed all 7 tests.
- New checks cover stale saved rooms, another subject's room URL, switching subjects with floating or expanded chat open, separate drafts, POST routing to the selected subject's room, and a subject without a room hiding the old conversation and composer.
- Existing chat checks cover participants, sending, offline and failed-send recovery, idempotent retry identifiers, access revocation, and floating chat preserving grading scores/drafts.
- An older test expected a removed sidebar chat link. It now checks the existing floating launcher's unread badge and expands from that launcher. The final run passed.
- `git diff --check` passed. No backend source changed, so backend checks were not repeated.

Firefox, Safari, cross-tab sidebar synchronization, and screen-reader testing were not performed. No live messages were sent; the new routing tests use intercepted local responses and the grading regression uses the existing isolated test server.
