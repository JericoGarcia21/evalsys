import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { copyFileSync, mkdirSync, unlinkSync } from 'node:fs';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';

// Portable encoders stay outside the application's dependency tree.
const env = { ...process.env, FFMPEG_PATH: ffmpeg, FFPROBE_PATH: ffprobe.path,
  PATH: [path.dirname(ffmpeg), path.dirname(ffprobe.path), process.env.PATH].join(path.delimiter) };
if (!process.env.npm_execpath) throw new Error('Run this script with npm run render.');
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'exec', '--yes', '--package=hyperframes@0.8.190', '--', 'hyperframes', 'render', '.',
  '--fps', '30', '--quality', 'standard', '--output', '../front-end/public/media/evalsys-overview.mp4',
  ...process.argv.slice(2)], { stdio: 'inherit', env });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
mkdirSync('.hyperframes', { recursive: true });
const normalized = '.hyperframes/normalized-overview.mp4';
const mix = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y',
  '-i', '../front-end/public/media/evalsys-overview.mp4', '-c:v', 'copy',
  '-af', 'loudnorm=I=-20:TP=-2:LRA=8', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-t', '63',
  '-movflags', '+faststart', normalized], { stdio: 'inherit' });
if (mix.error) throw mix.error;
if (mix.status !== 0) process.exit(mix.status ?? 1);
copyFileSync(normalized, '../front-end/public/media/evalsys-overview.mp4');
unlinkSync(normalized);
const poster = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '2',
  '-i', '../front-end/public/media/evalsys-overview.mp4', '-frames:v', '1', '-vf', 'scale=1280:720',
  '../front-end/public/media/evalsys-overview-poster.jpg'], { stdio: 'inherit' });
if (poster.error) throw poster.error;
process.exit(poster.status ?? 1);
