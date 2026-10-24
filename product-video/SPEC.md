# EvalSys product walkthrough

Audience: instructors, panel judges, and students. Goal: show the implemented
workflow and explain that EvalSys is an installable PWA.

77 seconds, landscape 1920×1080, 30 fps, H.264/AAC MP4 rendered with Remotion. Real browser recordings,
visible pointer, focused camera moves, animated action labels and title reveals,
workflow progress, upbeat instrumental music, English WebVTT, and text summary.
User-controlled playback with five clickable chapters; no autoplay.

| Time | Actual screen/action | Source of behavior |
| --- | --- | --- |
| 0–3s | Brand/workflow intro | Existing EvalSys app icon and implemented roles |
| 3–12s | View active Database Final Project rubric and section weights | `src/pages/admin/Rubrics.tsx`, `src/data/databaseRubric.json` |
| 12–28s | Register Project Atlas with four synthetic members; confirm registration | `src/pages/RegisterGroup.tsx` |
| 28–50s | Assigned panel opens Project Atlas, rates all 16 criteria, adds feedback, confirms | `src/pages/panel/Grade.tsx`, `src/components/ScoreInput.tsx`, `src/data/ratingScale.ts` |
| 50–61s | Instructor views the actual 85/100 average, breakdown, and member CSV | `src/pages/admin/Results.tsx` |
| 61–73s | Animated installation instructions separated by platform | Existing manifest/install notice and landing-page guide |
| 73–77s | Portal/PWA call to action, internet requirement | Existing account-based application behavior |

Paths above are relative to `front-end/`. Instructor prerequisites (subject,
block, panel accounts/assignments, valid registration link) are supplied by the
isolated fixture. This short film does not claim to teach all setup screens.

## Rubric accuracy

This demonstration uses the project's existing **Use Database Final Project
Template** button and activates the saved rubric with **Use This Rubric**.
It does not invent a rubric or replace the real product's UI with a mockup.
The generic one-criterion QA rubric remains only in the test fixture and is not
the rubric shown or used in the delivered film.

The actual preset contains 16 criteria: Project Requirements 40%, Documentation
30%, Presentation 30%. The real Very Good rating earns 90% and Good earns 80%.
Panel A rates all criteria Very Good (90/100); Panel B rates all Good (80/100).
The actual results screen must show their average, 85/100. This is one available
preset, not a claim that every subject must use it. Instructors can manage their
own rubrics per subject.

## Motion and sound

Remotion drives the camera, spring entrances and explanations from integer
frames. The camera opens on the complete recording, then focuses into the active
form/rating area. Action labels use reviewed phase times and enter on the next
132 BPM beat. A stable chapter rail follows the same timeline; the amber accent avoids continuous pulsing.
Registration has 16 seconds rather than 12, and grading has 22 rather than 15,
so the verified recordings play closer to real interaction speed.
Recorded sequences are time-condensed and labeled as such; there are no simulated
success messages or fictional product controls. The pointer follows actual
browser events. Titles explain each phase; fullscreen reveals detailed UI text.

Music is an original deterministic 132 BPM electronic instrumental with syncopated
bass, bright keys, faster arpeggios, transition accents, and a sustained closing chord,
faded at the start/end. Music and design SFX use separate generation buses; there
is no narration. The encoded mix targets -16 LUFS with -2 dBTP limiting. No sampled or
downloaded music, voiceover, paid service, or cloud rendering is used.

## PWA claims and limits

The existing manifest uses standalone display and the existing install notice
handles the browser's native install offer. Chrome installation eligibility is
tested in a temporary normal profile; the film animates the verified install **instructions**,
not a fabricated native install or OS home screen. Internet is required for
authentication, registration, submission, and result syncing. No offline grading
submission is promised. Native iOS installation is not demonstrated.

## Current framing contract

The latest source supersedes the camera-zoom treatment described earlier: source footage stays at native 1440x800 in a matching rectangle at x=64, y=198. No footage zoom or camera crop is used. Large cursor highlights and per-criterion centering keep the real action visible. Titles and proof text have their own space. All Last/First/Middle fields are filled for four fictional members. Registration has six intentional edits with completed-field holds. The current original 132 BPM minor-key electronic score replaces the earlier major-key bed.
