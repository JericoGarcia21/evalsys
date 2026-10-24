import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';

const slots = { setup: 9, registration: 12, grading: 15, results: 11, pwa: 9 };
const captures = JSON.parse(await readFile('.hyperframes/raw/captures.json', 'utf8'));
await mkdir('assets/clips', { recursive: true });
const manifest = [];
for (const capture of captures) {
  const probe = spawnSync(ffprobe.path, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', capture.path], { encoding: 'utf8' });
  if (probe.status !== 0) throw new Error(probe.stderr);
  const rawDuration = Number(JSON.parse(probe.stdout).format.duration);
  // Remove navigation/login setup. The final recorded interval contains the
  // actions, and finishes only after the real final state is verified.
  const seconds = Math.min(capture.seconds, rawDuration);
  const start = Math.max(0, rawDuration - seconds);
  const duration = slots[capture.id];
  const output = `assets/clips/${capture.id}.mp4`;
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(start), '-i', capture.path,
    '-an', '-vf', `setpts=${duration / seconds}*PTS,fps=30`, '-t', String(duration),
    '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Could not prepare ${capture.id}`);
  manifest.push({ scene: capture.id, sourceSeconds: seconds, trimStart: start, outputSeconds: duration, output });
}
await writeFile('assets/clips/manifest.json', JSON.stringify(manifest, null, 2));
console.log('Prepared five real interaction clips.');
