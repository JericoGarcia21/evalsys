import React from 'react';
import { AbsoluteFill, Composition, Html5Audio, Img, OffthreadVideo, Sequence, registerRoot, spring, staticFile, useCurrentFrame } from 'remotion';
import storyData from './story.json';

const FPS = 30;
const BEAT = FPS * 60 / 132;
export const DURATION = Math.max(...storyData.map(scene => scene.start + scene.duration)) * FPS;
type Scene = { id: string; start: number; duration: number; eyebrow: string; title: string; explanation: string; actions?: string[]; actionAt?: number[]; focus?: number[]; zoom?: number };
const story: Scene[] = storyData;
const C = { ink: '#0f172a', blue: '#2563eb', mint: '#93c5fd', paper: '#f8fafc', muted: '#b8c5d7' };

const Reveal: React.FC<{ children: React.ReactNode; delay?: number; style?: React.CSSProperties }> = ({ children, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const p = spring({ frame: frame - delay, fps: FPS, config: { damping: 23, stiffness: 140 } });
  return <div style={{ ...style, opacity: Math.max(0, p), transform: `translateY(${(1 - p) * 40}px)` }}>{children}</div>;
};

const Backdrop: React.FC<{ global: number }> = ({ global }) => {
  return <AbsoluteFill style={{ background: C.ink }}>
    <div style={{ position: 'absolute', width: 1450, height: 1450, borderRadius: '50%', left: -500, top: -950, background: 'radial-gradient(circle,#263c57,transparent 68%)', opacity: .8 }} />
    <div style={{ position: 'absolute', right: -400, bottom: -650, width: 1350, height: 1350, borderRadius: '50%', background: 'radial-gradient(circle,#133f75,transparent 68%)' }} />
    <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 2, background: C.mint, opacity: .45 }} />
    <div style={{ position: 'absolute', left: 110, bottom: 12, right: 110, height: 3, background: '#ffffff20' }}>
      <div style={{ height: 3, width: `${global / DURATION * 100}%`, background: C.mint }} />
    </div>
  </AbsoluteFill>;
};

const Header: React.FC<{ scene: Scene }> = ({ scene }) => <>
  <div style={{ position: 'absolute', top: 46, left: 110, display: 'flex', alignItems: 'center', gap: 18 }}>
    <Img src={staticFile('app-icon.svg')} style={{ width: 42, height: 42 }} />
    <span style={{ fontSize: 24, letterSpacing: 4, fontWeight: 800, color: C.mint }}>{scene.eyebrow}</span>
  </div>
  <Reveal delay={2} style={{ position: 'absolute', left: 110, top: 118, right: 100 }}>
    <h1 style={{ fontSize: 66, letterSpacing: -2.8, lineHeight: 1.08, margin: 0 }}>{scene.title}</h1>
  </Reveal>
</>;

const RecordedScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const global = frame + scene.start * FPS;
  const actionTimes = scene.actionAt || [0, scene.duration / 3, scene.duration * 2 / 3];
  const action = Math.max(0, actionTimes.filter(time => frame >= time * FPS).length - 1);
  const labels = ['RUBRIC', 'REGISTER', 'GRADE', 'RESULTS', 'INSTALL'];
  const ids = ['setup', 'registration', 'grading', 'results', 'pwa'];
  const proof = scene.id === 'setup' ? ['16', 'project criteria', '40 / 30 / 30', 'Preset section weights']
    : scene.id === 'registration' ? ['4', 'fictional members', 'Full names', 'Last, first, and middle names filled']
    : scene.id === 'grading' ? ['16', 'rubric criteria', 'Guidance visible', 'Focus view, real ratings and feedback']
    : ['85', 'out of 100', '90 + 80', 'Two panel totals, one actual average'];
  return <AbsoluteFill>
    <Backdrop global={global} />
    <div style={{ position: 'absolute', left: 64, top: 38, display: 'flex', alignItems: 'center', gap: 16 }}><Img src={staticFile('app-icon.svg')} style={{ width: 36, height: 36 }} /><span style={{ color: C.mint, fontSize: 21, fontWeight: 700, letterSpacing: 3 }}>{scene.eyebrow}</span></div>
    <Reveal delay={2} style={{ position: 'absolute', left: 64, right: 64, top: 100 }}><h1 style={{ margin: 0, fontSize: 58, lineHeight: 1.1, letterSpacing: -2, fontWeight: 800 }}>{scene.title}</h1></Reveal>
    {/* Exact native-size 1440x800 capture. No camera crop, zoom or UI overlay. */}
    <div style={{ position: 'absolute', left: 64, top: 198, width: 1440, height: 800, overflow: 'hidden', borderRadius: 8, outline: '1px solid #ffffff35', background: '#f8fafc' }}>
      <OffthreadVideo src={staticFile('remotion-clips/' + scene.id + '.mp4')} muted style={{ width: 1440, height: 800, objectFit: 'contain' }} />
    </div>
    <div style={{ position: 'absolute', left: 1540, top: 198, width: 316, height: 800, padding: '26px 22px', borderTop: '3px solid ' + C.blue, background: '#182840' }}>
      <div style={{ fontSize: 16, letterSpacing: 2, color: C.muted, fontWeight: 700 }}>THE REAL WORKFLOW</div>
      <div style={{ display: 'flex', gap: 7, marginTop: 25 }}>{scene.actions?.map((label, i) => <div key={label} style={{ flex: 1, height: 4, background: action >= i ? C.mint : '#ffffff20' }} />)}</div>
      <div style={{ fontSize: 30, lineHeight: 1.3, fontWeight: 700, marginTop: 22, minHeight: 120 }}>{scene.actions?.[action]}</div>
      <div style={{ fontSize: 100, lineHeight: 1, letterSpacing: -5, color: C.mint, fontWeight: 800, marginTop: 40 }}>{proof[0]}</div>
      <div style={{ fontSize: 23, color: C.muted, marginTop: 10 }}>{proof[1]}</div>
      <div style={{ fontSize: 32, lineHeight: 1.25, fontWeight: 700, marginTop: 55 }}>{proof[2]}</div>
      <div style={{ fontSize: 23, lineHeight: 1.5, color: C.muted, marginTop: 15 }}>{proof[3]}</div>
      <div style={{ position: 'absolute', left: 22, right: 22, bottom: 28, color: C.muted, fontSize: 18, lineHeight: 1.5 }}>Actual EvalSys capture.<br />Synthetic demo. Condensed.</div>
    </div>
    <div style={{ position: 'absolute', left: 64, right: 64, bottom: 28, display: 'flex', justifyContent: 'space-between', fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>{ids.map((id,i) => <span key={id} style={{ color: scene.id === id ? C.mint : '#8e9fb4' }}>{String(i+1).padStart(2,'0')} / {labels[i]}</span>)}</div>
  </AbsoluteFill>;
};

const InstallScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const global = frame + scene.start * FPS;
  const firstBeat = Math.ceil(scene.start * FPS / BEAT) * BEAT - scene.start * FPS;
  const guides = [
    { title: 'Chrome / Edge / Android', note: 'Use the install offer, or your browser menu.', steps: ['Choose Install app or Add to Home screen.', 'Confirm installation on your device.', 'Launch EvalSys from its new icon.'] },
    { title: 'iPhone / iPad · Safari', note: 'Open EvalSys in Safari first.', steps: ['Tap Share, then Add to Home Screen.', 'Enable Open as Web App if shown.', 'Tap Add, then open the EvalSys icon.'] },
  ];
  return <AbsoluteFill><Backdrop global={global} /><Header scene={scene} />
    <Reveal delay={8} style={{ position: 'absolute', top: 215, left: 110, color: C.muted, fontSize: 30 }}>{scene.explanation}</Reveal>
    {guides.map((guide, column) => <Reveal key={guide.title} delay={firstBeat + column * BEAT} style={{ position: 'absolute', left: 110 + column * 870, top: 330, width: 830, height: 530, background: column ? '#30343a' : '#142f55', border: '1px solid #74b4c85c', borderRadius: 24, padding: 38 }}>
      <div style={{ fontSize: 32, fontWeight: 800, color: column ? C.mint : '#a9c9ff' }}>{guide.title}</div>
      <div style={{ marginTop: 16, fontSize: 25, color: C.muted }}>{guide.note}</div>
      {guide.steps.map((step, i) => <Reveal key={step} delay={firstBeat + (2 + i * 4) * BEAT} style={{ display: 'flex', gap: 20, marginTop: 30, alignItems: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: 15, background: '#ffffff18', color: C.mint, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: 26, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
        <div style={{ fontSize: 28, lineHeight: 1.35 }}>{step}</div>
      </Reveal>)}
    </Reveal>)}
    <Reveal delay={firstBeat + 12 * BEAT} style={{ position: 'absolute', top: 910, left: 110, width: 1700, color: C.muted, fontSize: 27, lineHeight: 1.4 }}>Install steps vary by device. Signing in, registration, grading, and syncing results require internet.</Reveal>
  </AbsoluteFill>;
};

const TitleScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const global = frame + scene.start * FPS;

  return <AbsoluteFill><Backdrop global={global} />
    <div style={{ position: 'absolute', left: 110, top: 150, color: C.mint, fontSize: 25, letterSpacing: 4, fontWeight: 800 }}>{scene.eyebrow}</div>
    <div style={{ position: 'absolute', left: 110, top: 260, width: 1100 }}>
      {scene.title.split('\n').map((line, i) => <Reveal key={line} delay={i * BEAT / 2} style={{ fontSize: 112, fontWeight: 900, lineHeight: 1.09, letterSpacing: -5 }}>{line}</Reveal>)}
      <Reveal delay={BEAT} style={{ marginTop: 42, maxWidth: 940, color: C.muted, fontSize: 34, lineHeight: 1.45 }}>{scene.explanation}</Reveal>
    </div>
    <div style={{ position: 'absolute', left: 1260, top: 245, width: 500 }}>
      <Img src={staticFile('app-icon.svg')} style={{ width: 80, height: 80, marginBottom: 32 }} />
      {['Define the rubric', 'Register the project', 'Evaluate with feedback', 'Review the results'].map((label, i) => <Reveal key={label} delay={8 + i * 5} style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '22px 0', borderBottom: '1px solid #ffffff25' }}>
        <span style={{ fontSize: 23, color: C.mint }}>0{i + 1}</span><span style={{ fontSize: 29 }}>{label}</span>
      </Reveal>)}
      <Reveal delay={30} style={{ color: C.mint, fontSize: 23, marginTop: 30 }}>{scene.id === 'outro' ? 'OPEN THE PORTAL / INSTALL EVALSYS' : 'ONE EVALUATION, CONNECTED'}</Reveal>
    </div>
  </AbsoluteFill>;
};

const Film = () => <AbsoluteFill style={{ color: C.paper, fontFamily: 'Arial, sans-serif' }}>
  <Html5Audio src={staticFile('audio/product-bed.wav')} volume={.85} />
  {story.map(scene => <Sequence key={scene.id} from={scene.start * FPS} durationInFrames={scene.duration * FPS}>
    {scene.id === 'pwa' ? <InstallScene scene={scene} /> : scene.actions ? <RecordedScene scene={scene} /> : <TitleScene scene={scene} />}
  </Sequence>)}
</AbsoluteFill>;

const Root = () => <Composition id="EvalSys" component={Film} width={1920} height={1080} fps={FPS} durationInFrames={DURATION} />;
registerRoot(Root);
