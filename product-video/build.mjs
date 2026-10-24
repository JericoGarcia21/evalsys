import { mkdir, writeFile, copyFile } from 'node:fs/promises';

// Editable storyboard. Footage records real app interactions with synthetic data.
const scenes = [
  { id: 'intro', start: 0, duration: 3, kicker: 'PROJECT EVALUATION, CONNECTED', title: 'See the workflow.<br>Make it yours.', detail: 'Real clicks. Real grading. An installable web app.', card: true },
  { id: 'setup', start: 3, duration: 9, kicker: '01 / INSTRUCTOR', title: 'Use the subject’s active rubric.', detail: 'Database preset: Requirements 40% · Documentation 30% · Presentation 30%.', footage: 'setup', actions: ['Open the active rubric', 'Review the 40 / 30 / 30 weights', '16 actual project criteria'], focus: '100% 25%', zoom: 1.2 },
  { id: 'registration', start: 12, duration: 12, kicker: '02 / STUDENTS', title: 'Build your group.', detail: 'Use the instructor link, choose your block, and add your members.', footage: 'registration', actions: ['Name your project', 'Choose your block', 'Add your members'], focus: '50% 48%', zoom: 1.3 },
  { id: 'grading', start: 24, duration: 15, kicker: '03 / PANELS', title: 'Rate the actual criteria.', detail: 'Choose performance levels, review earned points, add feedback, and confirm.', footage: 'grading', actions: ['Use the active subject rubric', 'Choose performance ratings', 'Confirm scores + feedback'], focus: '100% 55%', zoom: 1.15 },
  { id: 'results', start: 39, duration: 11, kicker: '04 / RESULTS', title: 'See the complete picture.', detail: 'Demo: panel scores 90 and 80 average to 85 / 100. Export the member grades.', footage: 'results', actions: ['Open your block', '90 + 80 → average 85', 'Export member grades'], focus: '100% 34%', zoom: 1.2 },
  { id: 'pwa', start: 50, duration: 9, kicker: '05 / INSTALLABLE PWA', title: 'Make it an app.', detail: 'Install from your browser, or use Safari: Share → Add to Home Screen.', footage: 'pwa', actions: ['Phone or computer', 'Install from your browser', 'Launch from your icon'], focus: '50% 5%', zoom: 1.05 },
  { id: 'outro', start: 59, duration: 4, kicker: 'EVALSYS · WEB + PWA', title: 'Your workspace.<br>On your device.', detail: 'Open the portal or install EvalSys. Signing in and grading require internet.', card: true },
];
await mkdir('compositions', { recursive: true });
const css = `
  * { box-sizing: border-box; margin: 0; }
  #root { position: absolute; inset: 0; overflow: hidden; background: #071324; color: #f8fafc; font-family: Inter, sans-serif; }
  .atmosphere { position:absolute; inset:0; background:radial-gradient(ellipse at 12% 15%, #124677 0%, transparent 58%),radial-gradient(ellipse at 90% 90%, #123d45 0%, transparent 60%),#071324; }
  .grid { position:absolute; inset:0; opacity:.12; background-image:linear-gradient(#7dd3fc 1px,transparent 1px),linear-gradient(90deg,#7dd3fc 1px,transparent 1px);background-size:80px 80px; }
  .content { position: absolute; inset: 0; }
  .kicker { font-size: 28px; letter-spacing: 5px; font-weight: 700; color: #93c5fd; }
  .heading { position: absolute; left: 200px; top: 40px; width: 1000px; }
  h1 { font-size: 60px; line-height: 1.15; letter-spacing: -2px; font-weight: 800; margin-top: 12px; }
  .screen { position: absolute; left: 240px; top: 210px; width: 1440px; height: 800px; border:2px solid #5386a8; border-radius: 20px; overflow: hidden; background: #f8fafc; box-shadow:0 24px 80px #0008; }
  .camera { position:absolute; inset:0; }
  .screen video { display: block; width: 100%; height: 100%; object-fit: contain; }
  .note { position: absolute; top: 167px; left: 200px; right: 200px; font-size: 28px; color: #cbd5e1; line-height: 1.35; }
  .fixture { position:absolute; left:1200px; top:35px; width:520px; text-align:right; color:#cbd5e1; font-size:28px; }
  .action { position:absolute; left:1250px; top:88px; width:470px; height:60px; }
  .action .clip { position:absolute; inset:0; display:flex;align-items:center;justify-content:center; border:1px solid #67e8f9; border-radius:30px;background:#123747;color:#a5f3fc;font-size:28px;font-weight:700; }
  .rail { position:absolute; left:240px; top:1028px; width:1440px; display:flex;justify-content:space-between;font-size:28px;font-weight:700;color:#9cacbe; }
  .rail .active { color:#67e8f9; }
  .title-line { display:block; overflow:hidden; }
  .title-word { display:block; }
  .card { position: absolute; left: 200px; right: 200px; top: 200px; }
  .mark { width: 90px; height: 90px; margin-bottom: 24px; }
  .card h1 { font-size: 110px; line-height: 1.08; margin-top: 30px; letter-spacing: -4px; max-width:950px; }
  .card p { font-size: 32px; line-height: 1.5; color: #cbd5e1; max-width: 860px; margin-top: 38px; }
  .hero-art { position:absolute; left:1190px; top:350px; width:480px;height:480px;border:2px solid #5386a8;border-radius:100px;display:flex;flex-direction:column;justify-content:center;align-items:center;background:#153956;box-shadow:0 30px 90px #0007; }
  .hero-art img { width:180px;height:180px;margin-bottom:35px; }
  .hero-art p { font-size:32px;font-weight:800;color:#a5f3fc; }
  .line { position: absolute; bottom: 0; left: 0; width: 1920px; height: 8px; background: #2563eb; transform-origin: left center; }
`;
for (const scene of scenes) {
  const stage = ['setup', 'registration', 'grading', 'results', 'pwa'].indexOf(scene.id);
  const actions = (scene.actions || []).map((label, index) => `<div id="${scene.id}-action-${index}" class="clip" data-start="${index * scene.duration / 3}" data-duration="${scene.duration / 3}" data-track-index="3"><span id="${scene.id}-label-${index}">${label}</span></div>`).join('');
  const rail = `<div class="rail">${['SETUP', 'REGISTER', 'GRADE', 'RESULTS', 'INSTALL'].map((label, index) => `<span class="${index === stage ? 'active' : ''}">${index + 1} / ${label}</span>`).join('')}</div>`;
  const title = scene.title.split('<br>').map(line => `<span class="title-line" data-layout-allow-overflow><span class="title-word">${line}</span></span>`).join('');
  const content = scene.card
    ? `<div class="card"><div class="kicker">${scene.kicker}</div><h1>${title}</h1><p>${scene.detail}</p></div><div class="hero-art"><img src="assets/app-icon.svg" alt="EvalSys"><p>WEB + INSTALLABLE PWA</p></div>`
    : `<div class="heading"><div class="kicker">${scene.kicker}</div><h1>${scene.title}</h1></div><p class="note">${scene.detail}</p><div class="screen"><div id="${scene.id}-camera" class="camera" data-layout-allow-overflow><video id="${scene.id}-footage" class="clip" data-start="0" data-duration="${scene.duration}" data-track-index="1" src="assets/clips/${scene.footage}.mp4" muted playsinline></video></div></div><p class="fixture">${scene.id === 'pwa' ? 'Install guide · Browser menus vary' : 'Recorded demo · Condensed'}</p><div class="action">${actions}</div>${rail}`;
  await writeFile(`compositions/${scene.id}.html`, `<template>
<style>${css}</style>
<div id="root" data-composition-id="${scene.id}" data-width="1920" data-height="1080">
  <div id="${scene.id}-atmosphere" class="atmosphere" data-layout-ignore></div><div class="grid" data-layout-ignore></div>
  <div id="${scene.id}-content" class="content" data-hold="Intentional reading time for the product explanation">${content}</div>
  <div id="${scene.id}-line" class="line" data-layout-ignore></div>
</div>
<script>
  const tl = gsap.timeline({ paused: true });
  tl.fromTo('#${scene.id}-content', { opacity: 0.85, y: 12 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, 0);
  tl.fromTo('#${scene.id}-line', { scaleX: 0 }, { scaleX: 1, duration: ${scene.duration}, ease: 'none' }, 0);
  tl.fromTo('#${scene.id}-atmosphere', { opacity:.65 }, { opacity:1, duration:${scene.duration}, ease:'none' }, 0);
  ${scene.card ? `tl.fromTo('.title-word', { y:125 }, { y:0, stagger:.13, duration:.8, ease:'power4.out' }, .08);
  tl.fromTo('.hero-art', { x:70, rotation:8, scale:.8, opacity:.3 }, { x:0, rotation:0, scale:1, opacity:1, duration:1, ease:'power3.out' }, 0);
  tl.to('.hero-art', { y:-16, duration:${scene.duration - 1}, ease:'sine.inOut' }, 1);` : `tl.fromTo('.screen', { y:30, scale:.97, opacity:.3 }, { y:0, scale:1, opacity:1, duration:.6, ease:'power3.out' }, 0);
  tl.fromTo('#${scene.id}-camera', { scale:1, transformOrigin:'${scene.focus}' }, { scale:${scene.zoom}, duration:1.2, ease:'power2.inOut' }, .8);
  tl.to('#${scene.id}-camera', { scale:1, duration:.7, ease:'power2.inOut' }, ${scene.duration - .8});
  ${scene.actions.map((_, index) => `tl.fromTo('#${scene.id}-label-${index}', { x:22, opacity:0 }, { x:0, opacity:1, duration:.4, ease:'power3.out' }, ${index * scene.duration / 3});`).join('\n')}`}
  window.__timelines['${scene.id}'] = tl;
</script>
</template>
`);
}
await writeFile('index.html', `<!doctype html>
<html lang="en" data-resolution="landscape">
<head><meta charset="utf-8"><meta name="viewport" content="width=1920, height=1080">
<title>EvalSys — Product Overview</title>
<script src="assets/gsap.min.js"></script>
<style>*{margin:0;box-sizing:border-box}html,body,#root{width:1920px;height:1080px;overflow:hidden;background:#0f172a}.clip{position:absolute;inset:0}</style>
</head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="63" data-width="1920" data-height="1080" data-fps="30">
${scenes.map(s => `<div id="${s.id}" class="clip" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html" data-start="${s.start}" data-duration="${s.duration}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080"></div>`).join('\n')}
<audio id="product-music" class="clip" data-start="0" data-duration="63" data-track-index="2" data-volume="0.85" src="assets/audio/product-bed.wav"></audio>
</div>
<script>window.__timelines = window.__timelines || {}; window.__timelines.main = gsap.timeline({paused:true});</script>
</body></html>`);
const timestamp = seconds => `00:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.000`;
await mkdir('../front-end/public/media', { recursive: true });
await writeFile('../front-end/public/media/evalsys-overview.vtt', 'WEBVTT\n\n' + scenes.map((s, i) => `${i + 1}\n${timestamp(s.start)} --> ${timestamp(s.start + s.duration)}\n${i === 0 ? '[Upbeat instrumental music]\n' : ''}${s.title.replaceAll('<br>', ' ')}\n${s.detail}\n`).join('\n'));
// The app's own mark is used in the player poster.
await copyFile('../front-end/public/app-icon.svg', 'assets/app-icon.svg');
