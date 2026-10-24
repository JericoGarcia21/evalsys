import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';

const root = fileURLToPath(new URL('../', import.meta.url));
const story = JSON.parse(await readFile(new URL('./src/story.json', import.meta.url), 'utf8'));
const duration = Math.max(...story.map(scene => scene.start + scene.duration));
const music = spawnSync(process.execPath, [path.join(root, 'music.mjs'), String(duration)], { cwd: root, stdio: 'inherit' });
if (music.status) process.exit(music.status);
const captures = JSON.parse(await readFile(path.join(root, '.hyperframes/raw/captures.json'), 'utf8'));
await mkdir(path.join(root, 'assets/remotion-clips'), { recursive: true });
const editDecisions = [];
for (const capture of captures.filter(item => item.id !== 'pwa')) {
  const scene = story.find(item => item.id === capture.id);
  const probe = spawnSync(ffprobe.path, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', capture.path], { encoding: 'utf8' });
  if (probe.status) throw new Error(probe.stderr);
  const rawDuration = Number(JSON.parse(probe.stdout).format.duration);
  const seconds = Math.min(capture.seconds, rawDuration);
  const start = Math.max(0, rawDuration - seconds);
  const markers = capture.markers;
  const cuts = capture.id === 'registration' && markers ? [
    { start: 0, end: markers.firstStart, duration: 3, purpose: 'Project and block' },
    { start: markers.firstStart, end: markers.member0 + 1.1, duration: 4, purpose: 'Complete first member including middle name' },
    ...[1, 2, 3].map(index => ({ start: markers[`member${index}`] - .9, end: markers[`member${index}`] + 1.1, duration: 1.5, purpose: `Completed member ${index + 1}` })),
    { start: markers.confirmStart, end: seconds, duration: 4.5, purpose: 'Review and confirm real registration' },
  ] : [{ start: 0, end: seconds, duration: scene.duration, purpose: 'Real captured interaction' }];
  if (Math.abs(cuts.reduce((sum, cut) => sum + cut.duration, 0) - scene.duration) > .001) throw new Error('Edit duration mismatch');
  for (const cut of cuts) if (cut.start < 0 || cut.end <= cut.start || cut.end > seconds + .05) throw new Error('Invalid source edit range');
  const filters = cuts.map((cut, index) => `[0:v]trim=start=${start + cut.start}:end=${start + cut.end},setpts=${cut.duration / (cut.end - cut.start)}*(PTS-STARTPTS),fps=30,tpad=stop_mode=clone:stop_duration=0.1,trim=end_frame=${Math.round(cut.duration * 30)},setpts=N/(30*TB)[v${index}]`).join(';') + ';' + cuts.map((_,index) => `[v${index}]`).join('') + `concat=n=${cuts.length}:v=1:a=0[out]`;
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', capture.path,
    '-an', '-filter_complex', filters, '-map', '[out]', '-t', String(scene.duration),
    '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    path.join(root, `assets/remotion-clips/${scene.id}.mp4`)], { stdio: 'inherit' });
  if (result.status) process.exit(result.status);
  editDecisions.push({ id: capture.id, source: capture.path, sourceTailStart: start, duration: scene.duration, cuts, members: capture.members, cursorClicks: capture.cursorClicks });
}
const timestamp = seconds => `00:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.000`;
await writeFile(path.join(root, '../front-end/public/media/evalsys-overview.vtt'), 'WEBVTT\n\n' + story.map((s, i) =>
  `${i + 1}\n${timestamp(s.start)} --> ${timestamp(s.start + s.duration)}\n${i === 0 ? '[Upbeat instrumental music]\n' : ''}${s.title.replaceAll('\n', ' ')}\n${s.explanation}\n`).join('\n'));
const delivery = path.join(root, 'out');
await mkdir(delivery, { recursive: true });
await writeFile(path.join(delivery, 'edit-decision-list.json'), JSON.stringify(editDecisions, null, 2) + '\n');
const srtTime = seconds => new Date(seconds * 1000).toISOString().slice(11, 23).replace('.', ',');
await writeFile(path.join(delivery, 'captions.srt'), story.map((s, i) =>
  `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.start + s.duration)}\n${s.title.replaceAll('\n', ' ')}\n${s.explanation}\n`).join('\n'));
console.log(`Prepared ${duration}s Remotion edit from the verified original recordings.`);
