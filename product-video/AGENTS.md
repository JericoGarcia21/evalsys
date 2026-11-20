# EvalSys video production

The canonical renderer is now Remotion, as requested by the user.

- Source: `remotion/src/index.tsx` and `remotion/src/story.json`.
- `npm run build` prepares footage, music and WebVTT from that storyboard.
- `npm run check` type-checks the Remotion composition.
- `npm run preview` exports stills and a six-second grading sample.
- `npm run render` exports the landing-page MP4 and poster. The app uses its
  native video player; keep Remotion dependencies out of the application.
- Use real recordings and the actual Database Final Project template. Never
  fabricate controls, feature behavior, success states or rubric criteria.
- Fixture accounts/groups/results are synthetic. Authenticate before recording;
  never film credentials or use live data.
- Review stills and a short render before full export. Verify final decoding,
  soundtrack levels, the frontend build and production playback tests.
- PWA instructions are guidance, not proof of a native OS installation.
- Previous HyperFrames HTML/GSAP source remains available only through the
  explicit legacy `build:hyperframes` / `render:hyperframes` commands.

See `README.md`, `SPEC.md` and `REVIEW.md` for reproduction and actual evidence.
