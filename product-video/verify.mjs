import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';

const root = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(root, 'out/ad.mp4');
const run = (exe, args) => {
  const result = spawnSync(exe, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || String(result.error));
  return result;
};
const story = JSON.parse(fs.readFileSync(path.join(root, 'remotion/src/story.json')));
let end = 0;
for (const scene of story) {
  if (scene.start * 30 !== end) throw new Error('Timeline gap or overlap');
  end = (scene.start + scene.duration) * 30;
}
if (end !== 2310) throw new Error('Incorrect frame count');
const edits = JSON.parse(fs.readFileSync(path.join(root, 'out/edit-decision-list.json')));
const registration = edits.find(scene => scene.id === 'registration');
if (registration.members?.length !== 4 || registration.members.some(member => member.length !== 3 || member.some(name => !name.trim()))) throw new Error('Incomplete registration names');
for (const edit of edits) {
  const source = JSON.parse(run(ffprobe.path, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames', '-of', 'json', path.join(root, `assets/remotion-clips/${edit.id}.mp4`)]).stdout).streams[0];
  if (source.width !== 1440 || source.height !== 800 || Number(source.nb_frames) !== edit.duration * 30) throw new Error('Source dimensions/frame count mismatch');
  for (const point of edit.cursorClicks) if (point.x < 0 || point.x >= 1440 || point.y < 0 || point.y >= 800) throw new Error('Click outside source viewport');
}
const probe = JSON.parse(run(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', target]).stdout);
const video = probe.streams.find(s => s.codec_type === 'video');
const audio = probe.streams.find(s => s.codec_type === 'audio');
if (video.width !== 1920 || video.height !== 1080 || video.r_frame_rate !== '30/1' || video.codec_name !== 'h264' || Math.abs(Number(probe.format.duration) - 77) > .1 || audio.codec_name !== 'aac') throw new Error('Unexpected media format');
run(ffmpeg, ['-hide_banner', '-v', 'error', '-i', target, '-f', 'null', '-']);
const loud = run(ffmpeg, ['-hide_banner', '-i', target, '-af', 'loudnorm=I=-16:TP=-2:LRA=8:print_format=json', '-f', 'null', '-']).stderr;
const match = loud.match(/\{\s*"input_i"[\s\S]*?\}/);
if (!match) throw new Error('Missing audio measurement');
const levels = JSON.parse(match[0]);
if (Number(levels.input_tp) > -1) throw new Error('Insufficient peak headroom');
fs.writeFileSync(path.join(root, 'out/media-qa.json'), JSON.stringify({ format: probe.format, video, audio, levels, timelineFrames: end, decode: 'passed', sourceViewport: '1440x800', footageRectangle: { x: 64, y: 198, width: 1440, height: 800, crop: false }, completeMemberNames: registration.members, cursorClickBounds: 'passed' }, null, 2) + '\n');
run(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-i', target, '-vf', 'fps=1,scale=280:-1,tile=7x11', '-frames:v', '1', path.join(root, 'out/contact-sheet.jpg')]);
const boundaryFrames = [0, 89, 90, 359, 360, 839, 840, 1499, 1500, 1829, 1830, 2189, 2190, 2309];
const select = boundaryFrames.map(frame => `eq(n,${frame})`).join('+');
run(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-i', target, '-vf', `select='${select}',scale=480:-1,tile=4x4`, '-frames:v', '1', path.join(root, 'out/transitions.jpg')]);
console.log(JSON.stringify({ duration: probe.format.duration, dimensions: `${video.width}x${video.height}`, fps: video.r_frame_rate, frames: video.nb_frames, bytes: probe.format.size, loudness: levels.input_i, truePeak: levels.input_tp, decode: 'passed', timelineFrames: end }, null, 2));
