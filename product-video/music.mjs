import { mkdir, writeFile } from 'node:fs/promises';

// Original deterministic electronic score: syncopated bass, major-key arpeggios,
// scene-cut accents, rising subdivisions, and a closing tonic resolution.
// No downloaded track, samples, voice service, or third-party music rights.
const rate = 44100, duration = Number(process.argv[2] || 63), beat = 60 / 132;
if (!Number.isFinite(duration) || duration < 1 || duration > 300) throw new Error('Invalid music duration');
const samples = Math.ceil(rate * duration);
const left = new Float32Array(samples), right = new Float32Array(samples);
const hz = note => 440 * 2 ** ((note - 69) / 12);
const sfxLeft = new Float32Array(samples), sfxRight = new Float32Array(samples);
function note(start, length, midi, gain, kind, pan = 0, bus = 'music') {
  const freq = hz(midi);
  let noiseState = 12345 + Math.round(start * 1000);
  for (let i = 0; i < Math.ceil(length * rate); i++) {
    const index = Math.round(start * rate) + i;
    if (index >= samples) break;
    const t = i / rate;
    const attack = Math.min(1, t / (kind === 'pad' ? .25 : .012));
    const release = Math.min(1, (length - t) / .22);
    const decay = kind === 'pad' ? 1 : Math.exp(-t * (kind === 'tick' ? 60 : kind === 'snare' ? 20 : kind === 'kick' ? 12 : 2.2));
    const fundamental = Math.sin(2 * Math.PI * freq * t);
    noiseState = (Math.imul(noiseState, 1664525) + 1013904223) >>> 0;
    const noise = noiseState / 2147483648 - 1;
    const tone = kind === 'kick' ? Math.sin(2 * Math.PI * (54 * t + 1.8 * (1 - Math.exp(-t * 35))))
      : kind === 'snare' ? noise * .8 + fundamental * .2
      : kind === 'tick' ? noise
      : kind === 'key'
      ? fundamental + .22 * Math.sin(2 * Math.PI * freq * 2 * t) + .08 * Math.sin(2 * Math.PI * freq * 3 * t)
      : kind === 'bass' ? fundamental + .28 * Math.sin(2 * Math.PI * freq * 2 * t) + .12 * Math.sin(2 * Math.PI * freq * 3 * t)
      : fundamental;
    const fade = Math.min(1, index / rate / 1.2, (duration - index / rate) / 2.4);
    const musicTime = index / rate;
    const revealDip = musicTime > 49.65 && musicTime < 50 && bus === 'music' ? .22 : 1;
    const value = gain * attack * release * decay * tone * fade * revealDip;
    (bus === 'sfx' ? sfxLeft : left)[index] += value * (1 - pan * .35);
    (bus === 'sfx' ? sfxRight : right)[index] += value * (1 + pan * .35);
  }
}
const chords = [[62, 65, 69, 74], [58, 62, 65, 70], [60, 65, 69, 72], [60, 64, 67, 72]];
const melody = [81, 84, 86, 89, 86, 84, 81, 79];
for (let bar = 0; bar * 4 * beat < duration; bar++) {
  const start = bar * 4 * beat;
  const chord = chords[bar % chords.length];
  chord.forEach((pitch, index) => note(start, 4 * beat + .4, pitch, .018, 'pad', (index - 1.5) / 2));
  if (start < 3 || start >= duration - 4) continue;
  const energy = start < 3 ? .45 : start < 28 ? .8 : start < 50 ? 1 : start < 61 ? 1.12 : .75;
  note(start, .65 * beat, chord[0] - 24, .15 * energy, 'bass');
  note(start + 1.5 * beat, .45 * beat, chord[0] - 12, .10 * energy, 'bass');
  note(start + 3.5 * beat, .4 * beat, chord[0] - 24, .11 * energy, 'bass');
  note(start + 2 * beat, 1.2 * beat, chord[0] - 24, .1, 'bass');
  note(start, .3, 36, .12, 'kick');
  note(start + 2 * beat, .3, 36, .11, 'kick');
  note(start + beat, .25, 36, .085 * energy, 'kick');
  note(start + 3 * beat, .25, 36, .085 * energy, 'kick');
  note(start + beat, .2, 62, .045, 'snare');
  note(start + 3 * beat, .2, 62, .045, 'snare');
  if (start >= 12) for (let subdivision = 0; subdivision < 8; subdivision++) {
    note(start + subdivision * beat / 2, .25, chord[subdivision % 4] + 24, .029 * energy, 'key', subdivision % 2 ? .65 : -.65);
    note(start + subdivision * beat / 2, .07, 110, .012 * energy, 'tick', subdivision % 2 ? -.4 : .4);
  }
  if (start >= 28 && start < 50) for (let sixteenth = 0; sixteenth < 16; sixteenth++) note(start + sixteenth * beat / 4, .13, chord[sixteenth % 4] + 24, .018 * energy, 'key', sixteenth % 2 ? .5 : -.5);
  for (let pulse = 0; pulse < 4; pulse++) {
    note(start + pulse * beat, .8, chord[pulse] + 12, .085, 'key', pulse % 2 ? .45 : -.45);
    note(start + pulse * beat + beat / 2, .15, 102, .015, 'tick');
  }
  if (bar > 0) {
    note(start + .5 * beat, .65, melody[bar % melody.length], .07, 'key', .2);
    note(start + 2.5 * beat, .65, melody[(bar + 2) % melody.length], .06, 'key', -.2);
  }
}
// Original accents on scene cuts, routed through a separate design-SFX bus.
for (const cut of [3, 12, 28, 50, 61, 73]) {
  note(cut, .65, 36, .14, 'kick', 0, 'sfx');
  note(cut, 1.1, 84, .055, 'key', -.25, 'sfx');
  if (cut === 28 || cut === 50) for (let i = 0; i < 8; i++) {
    note(cut - 1 + i / 8, .08, 95 + i, .012 + i * .002, 'tick', i % 2 ? .5 : -.5, 'sfx');
  }
}
// Tonic resolution and a music tail; narration bus intentionally empty.
[50, 62, 65, 69, 74].forEach((pitch, i) => note(duration - 4, 4, pitch, .036, 'pad', (i - 2) / 3));
for (let i = 0; i < samples; i++) { left[i] += sfxLeft[i] * .8; right[i] += sfxRight[i] * .8; }
const wav = Buffer.alloc(44 + samples * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 4, 28);
wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(samples * 4, 40);
let peak = 0;
for (let i = 0; i < samples; i++) {
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), 46 + i * 4);
}
if (peak >= .95) throw new Error(`Music exceeds safe peak level: ${peak}`);
await mkdir('assets/audio', { recursive: true });
await writeFile('assets/audio/product-bed.wav', wav);
console.log(`Original driving 132 BPM cinematic electronic score: ${duration}s; peak ${peak.toFixed(3)} (no clipping).`);
