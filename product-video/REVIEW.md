# Current full-frame advertisement review - 2026-10-24

Artifact: front-end/public/media/evalsys-overview.mp4. Matching delivery: out/ad.mp4. Revision: bfce26805fdf. This supersedes the earlier cropped-camera exports described below.

## Corrections after user feedback

- Fresh real capture of the redesigned blue EvalSys application, using only the disposable test fixture.
- All four fictional members have complete Last, First and Middle fields. Values were asserted before successful registration. Final-MP4 stills show Rivera at 18.6s, Jordan at 20s, Santos at 21.6s and Morgan at 23.1s.
- Full native 1440x800 footage at film coordinates (64,198), with no camera crop or zoom. Titles and proof callouts occupy separate space. Natural browser scrolling remains visible; this does not show an entire long form at once.
- Large blue cursor, white outline, persistent halo, click rings, and inward rotation near viewport edges. Actual capture click coordinates were checked against the source viewport. Grading cards are centered before actual rating clicks so the current guidance stays clear of the sticky progress bar.
- Registration uses six motivated edits with completed-name holds. The original 132 BPM electronic score adds driving percussion, bass/arpeggios, section accents, a brief dip before the result reveal, and a resolved ending. No external samples, voiceover, paid service or native-installation simulation.
- Blue/slate styling matches the app. The hero player, poster and captions use a generated media revision to avoid a stale cached film.

## Current verified evidence

- Fresh capture: 1 passed (2.2 minutes), including real preset activation, 16 ratings from each of two panels, actual 90 and 80 totals, 85 average, and member CSV download. Only one panel's grading is shown in the film.
- Remotion type check, representative stills, short preview and full render passed.
- Actual H.264/AAC, 1920x1080, 30 fps, 2310 frames, exactly 77 seconds, 7240164 bytes, stereo 48 kHz. Full decode passed. Prepared clips retain 1440x800 and their exact target frame counts.
- Encoded mix measures -15.41 LUFS integrated and -2.00 dBTP. Generated source peak 0.391, below clipping.
- Inspected the final film's 77 one-second samples, exact before/after scene transitions, first and last frame, full-resolution grading and title stills, and all four completed-name proof stills. No accidental blank scene or composition-level UI crop found in these samples. Unused black cells at the end of the transition contact sheet are not film frames.
- Frontend production build passed; existing large-chunk warning remains. Delivery, public-media and built-video hashes match.
- Current production playback suite: all 4 passed (1.6 minutes), clean exit. Full playback reached the end; mobile captions/seeking, chapter navigation/install guide and Chrome installability passed.

## Review limits

Direct visual browser review was attempted using Computer Use. The tool stopped because it could not determine the current Windows browser URL with sufficient confidence to enforce policy. No further desktop interaction was attempted. Continuous personal watching or full listening is NOT claimed. Review uses rendered-frame inspection, measured audio, decode verification and automated playback; subjective excitement/music enjoyment remains unverified. Safari playback and native Android/iOS installation remain unverified. Detailed UI still benefits from fullscreen. No offline submission claim. Nothing pushed or deployed; backend source unchanged.

Production documents: brief.json, claims.md, script.md, storyboard.json/md, style-tokens.json, assets/manifest.json, out/edit-decision-list.json and out/qa.md.

---

# Historical, superseded export reviews

# Current cinematic recreation ? 2026-10-24

Recreated using the user-supplied standalone cinematic-product-video workflow. Current playable artifact: front-end/public/media/evalsys-overview.mp4; identical delivery: out/ad.mp4.

The film retains the verified synthetic capture and 77-second chapter timings. New creative treatment: navy/amber palette, connected-workflow opening/closing, shorter scene headings, stable accent rail, and an energetic original electronic soundtrack with syncopated bass, arpeggios, transition accents and a resolved ending.

Current technical evidence: Remotion type check, preview and full render passed. H.264/AAC, 1920?1080, 30 fps, 2,310 frames, exactly 77 seconds, 10,930,004 bytes. Full decode passed. Encoded audio measures -15.77 LUFS and -2.23 dBTP. Frontend production build passed with its existing chunk-size warning; delivered/source/built video hashes match. Contact sheets include all one-second samples and exact scene boundaries; representative full-resolution stills were inspected.

All four production playback test cases passed against this recreation, including full playback through the end, mobile captions/seeking, chapters and Chrome installability.

See [current QA](out/qa.md), [brief](brief.json), [script](script.md), [storyboard](storyboard.md), [claims](claims.md), and [asset manifest](assets/manifest.json). Continuous human watching/listening remains unperformed; subjective music enjoyment is unverified. Native device installation and Safari limitations persist. Nothing pushed or deployed.

---

# Historical review of the superseded export

The measurements below apply to the preceding export, not the current recreation.

# Final Remotion export review — 2026-10-24

Artifact: `front-end/public/media/evalsys-overview.mp4`.

## Verdict

The film matches the implemented core evaluation flow. It is a complete
77-second overview, not an exhaustive tutorial of every feature. See
[the coverage audit](PROJECT-VIDEO-AUDIT.md). The landing page now makes this
scope explicit. The older 63-second HyperFrames review is superseded.

## Actual evidence

- Real UI capture: **1 passed (1.8 minutes)** against isolated synthetic data.
  Instructor created and activated the existing Database Final Project preset:
  16 criteria and 40/30/30 weights. Project Atlas registered four fictional
  members. Two assigned panels rated every criterion, submitted feedback, and
  the instructor downloaded member CSV. Very Good = 90%, Good = 80%; real totals
  90 and 80 produced 85/100. Only one panel interaction is shown in the film.
- Remotion type check and final rendering passed. H.264, 1920×1080, 30 fps,
  2,310 frames, exactly 77 seconds, 11,465,025 bytes; AAC stereo 48 kHz.
  Full FFmpeg decode passed without errors. Frontend build passed; source and
  built video sizes match. Existing Vite large-chunk warning remains.
- Reviewed all 77 one-second frames as a contact sheet and representative
  full-resolution stills. Results framing was corrected before final rendering.
- Final production playback tests: **4 passed (1.5 minutes)**. Full playback
  reached the end; mobile layout/captions/seeking, clickable chapters and the
  installation guide passed. Chrome offered Install EvalSys and returned no
  installability errors.
- Applied the newly installed HyperFrames review/media guidance to this export.
  HyperFrames CLI 0.8.190 audio analysis: 77 seconds, stereo 48 kHz,
  **-19.9 LUFS**, **-7.1 dBFS true peak**, zero clipped samples, no silence
  intervals or warnings. Local evidence is
  `.hyperframes/remotion/hyperframes-audio-review.json`. The initial missing
  ffprobe attempt was rerun successfully using the project's local tools.
- Old HyperFrames HTML checks do not validate this Remotion composition.
  No HeyGen generation was used. The original local instrumental was retained;
  there is no voiceover, external music license or paid cloud rendering.

## Creative decisions and limits

Focused camera moves, paced recorded interactions and animated phase labels use
the original 116 BPM major-key score. Registration lasts 16 seconds; grading
lasts 22. Footage is labeled synthetic and condensed. Installation uses animated
platform instructions, not fabricated native installation success.

Grading is the weakest instructional segment: 16 criteria cannot each be taught
in 22 seconds. Detailed controls need fullscreen on small screens. Subject,
block, accounts, assignments and registration link are prepared prerequisites.
Super Admin and secondary workflows are deliberately outside this overview.

Continuous human watching/listening of the complete film was not performed;
review combines full automated playback, decoding, frame samples and measured
audio. Subjective music enjoyment remains unverified. Native Android/iOS
installation, Safari playback and service-worker activation in the automated
profile were not confirmed. No offline submission is claimed. Nothing was
pushed or deployed.

## Playback runner cleanup

All four test cases reported passing, but the Playwright runner stalled during cleanup without printing its final suite summary. It was interrupted after the stall (exit 1); a clean runner exit is not claimed.
