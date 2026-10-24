# EvalSys product video — Remotion

The active video renderer is Remotion 4.0.538. The 77-second 1080p composition
uses verified browser recordings, native-size uncropped UI, a large click-highlighted cursor, motivated cuts,
beat-synchronized spring animations, an energetic original electronic soundtrack and a clear
12-second PWA installation guide. The landing page keeps its native MP4 player,
five clickable chapters, poster, text summary and optional English captions.
Remotion is not added to the application bundle.

## Install and reproduce

From `product-video/`:

```powershell
npm ci
npm --prefix remotion ci
npm run build
npm run check
npm run preview
npm run render
```

`npm run build` prepares longer scene clips from the verified original
recordings, regenerates the 132 BPM soundtrack and writes the WebVTT track.
The working capture recordings are ignored. In a fresh checkout, capture them
before `npm run build` (frontend/backend dependencies must already be installed):

```powershell
cd ../front-end
npx playwright install ffmpeg
cd ../product-video
npm run capture
```

The capture script configures the project's **existing Database Final Project
preset through the real UI**, activates it, registers a synthetic four-member
group, submits both panel evaluations, verifies 85/100 and downloads member
grades. Login happens before recording. It uses only the disposable database
from `back-end/test/browser-server.js`.

## Editable source

- `remotion/src/story.json`: scene copy, duration, camera targets and action times.
- `remotion/src/index.tsx`: frame-driven React composition and installation guide.
- `remotion/prepare.mjs`: footage retiming, soundtrack and captions.
- `remotion/render.mjs`: preview, full render, sound normalization and delivery.
- `music.mjs`: original, deterministic minor-key instrumental; no external samples.
- `assets/remotion-clips/`: prepared real footage, reusable without the raw capture.

`npm run preview` exports seven stills and a six-second grading sample into
ignored `.hyperframes/remotion/`. Inspect them before the full export. For the
interactive Remotion Studio, use `npm run dev` and its printed localhost URL.
The composition uses system Arial and local media; no runtime cloud service or
private app API is accessed during rendering.

Rendering uses installed Chrome on Windows. Override its path with
`REMOTION_BROWSER_EXECUTABLE` if needed. Remotion and its package versions are
pinned together; video setup requires Node 24, network access for dependency
installation, and the portable encoders from this media workspace. The finished
MP4 needs no rendering dependencies or external video host.

`npm run render` exports 1920×1080 at 30 fps, H.264/AAC, and normalizes the music
to -16 LUFS at 48 kHz. Only a successful render/postprocess replaces
`front-end/public/media/evalsys-overview.mp4` and its poster.

Verify the delivered production build from `front-end/`:

```powershell
npm run build
npx playwright test --config video-playback.config.ts
```

## Provenance and boundaries

The original capture is from 2026-10-24 (Asia/Manila), base revision `87e1b21` on
`dev` plus the landing-page changes. It uses actual `databaseRubric.json` and
`ratingScale.ts` behavior, the project's app-icon.svg, and synthetic accounts,
members and results. Source footage is condensed; this is not an exhaustive
real-time lesson on every screen. PWA animation explains browser installation;
it does not fabricate a completed native OS install. Internet requirements remain
explicit. Nothing is published by these commands.

Earlier HTML/GSAP source remains for comparison; `build:hyperframes` and
`render:hyperframes` explicitly target it and are not the active production path.
See `SPEC.md` for behavioral claims and `REVIEW.md` for actual verification.

References: [Remotion licensing](https://www.remotion.dev/docs/license/pricing),
[Chrome installation help](https://support.google.com/chrome/answer/9658361),
[Apple installation guide](https://support.apple.com/guide/iphone/iphea86e5236/ios).

## Cinematic recreation

The supplied standalone cinematic-product-video workflow informed the current navy/amber editorial treatment, connected-workflow title sequence, and original energetic electronic soundtrack. Existing authentic synthetic footage and 77-second chapter boundaries are retained.

Production contract: `brief.json`, `claims.md`, `script.md`, `storyboard.json`, `storyboard.md`, `style-tokens.json`, and `assets/manifest.json`. Creative choices are agent assumptions within the recreation request, not separate approvals.

`npm run render` also writes `out/ad.mp4` and `out/poster.png`; `npm run build` writes `out/captions.srt`. Captions describe screen content; there is no narration or word-alignment claim. Music and design SFX are generated on separate buses in `music.mjs`; the narration bus is intentionally empty. Native installation and human listening remain unverified; see `out/qa.md`.

Run `npm run verify` after rendering to check the delivery format, full decode, timeline continuity and measured audio headroom, and regenerate the one-second contact sheet and `out/media-qa.json`. Then run the frontend production build and playback command above. This is technical QA; full human listening is still required for subjective sound approval.

## Full-frame revision after user playback feedback

The current edit addresses cropped UI, hard-to-follow cursor movement, incomplete middle names, and insufficient ad energy. Footage was freshly captured against the redesigned blue application using an isolated fixture. All four last/first/middle-name values are asserted before registration. Each grading card is centered before rating; the large cursor turns inward near viewport edges.

The footage rectangle is exactly 1440x800 at (64,198) in the 1920x1080 film. There is no footage zoom or camera crop. Callouts have their own right rail. Registration uses six intentional edits with holds on complete names, rather than uniformly accelerating every field. Edit ranges and cursor clicks are saved in `out/edit-decision-list.json`. The driving original 132 BPM score has section builds, a brief result-reveal dip, and a final resolution.

Recommended fresh capture command from `front-end/`: `node scripts/run-regression-review.mjs --capture`. It starts and gracefully stops the disposable API without editing backend files or environment files. After render, the generated `src/data/productVideo.json` revision versions the player media, poster and captions so a prior cached film is not reused. Build the frontend and run `node scripts/run-ui-review.mjs --video` for the production playback suite.
