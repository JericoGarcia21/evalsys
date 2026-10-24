import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { mkdir, copyFile, unlink, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, '.hyperframes/remotion');
await mkdir(out, { recursive: true });
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
const serveUrl = await bundle({ entryPoint: fileURLToPath(new URL('./src/index.tsx', import.meta.url)), publicDir: path.join(root, 'assets') });
const composition = await selectComposition({ serveUrl, id: 'EvalSys', browserExecutable });
const common = { serveUrl, composition, browserExecutable, logLevel: 'warn' };
const still = process.argv.find(value => value.startsWith('--still='));
if (process.argv.includes('--preview') || still) {
  for (const frame of still ? [Number(still.split('=')[1])] : [30, 210, 600, 1050, 1650, 2000, 2250]) {
    await renderStill({ ...common, frame, imageFormat: 'png', output: path.join(out, `frame-${frame}.png`) });
  }
  if (!still) await renderMedia({ ...common, codec: 'h264', crf: 20, concurrency: 3, frameRange: [840, 1019], outputLocation: path.join(out, 'preview.mp4') });
  console.log(`Remotion preview rendered to ${out}`);
} else {
  let last = -1;
  const raw = path.join(out, 'master.mp4');
  await renderMedia({ ...common, codec: 'h264', crf: 20, concurrency: 3, audioCodec: 'aac', audioBitrate: '160k', sampleRate: 48000,
    outputLocation: raw,
    onProgress: ({ progress }) => { const step = Math.floor(progress * 10); if (step !== last) { last = step; console.log(`Remotion render: ${step * 10}%`); } },
  });
  const final = path.join(out, 'evalsys-overview.mp4');
  const mix = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-c:v', 'copy',
    '-af', 'loudnorm=I=-16:TP=-2:LRA=8', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-t', String(composition.durationInFrames / composition.fps), '-movflags', '+faststart', final], { stdio: 'inherit' });
  if (mix.status !== 0) throw mix.error || new Error('Soundtrack encoding failed');
  const poster = path.join(out, 'poster.jpg');
  const image = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '2', '-i', final, '-frames:v', '1', '-vf', 'scale=1280:720', poster], { stdio: 'inherit' });
  if (image.status !== 0) throw image.error || new Error('Poster extraction failed');
  const media = path.join(root, '../front-end/public/media');
  await copyFile(final, path.join(media, 'evalsys-overview.mp4'));
  await copyFile(poster, path.join(media, 'evalsys-overview-poster.jpg'));
  const revision = createHash('sha256').update(await readFile(final)).digest('hex').slice(0, 12);
  await writeFile(path.join(root, '../front-end/src/data/productVideo.json'), JSON.stringify({ revision }, null, 2) + '\n');
  const delivery = path.join(root, 'out');
  await mkdir(delivery, { recursive: true });
  await copyFile(final, path.join(delivery, 'ad.mp4'));
  const png = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '2', '-i', final, '-frames:v', '1', path.join(delivery, 'poster.png')], { stdio: 'inherit' });
  if (png.status !== 0) throw png.error || new Error('PNG poster extraction failed');
  await unlink(raw);
  console.log(`Remotion export complete: ${path.join(media, 'evalsys-overview.mp4')}`);
}
