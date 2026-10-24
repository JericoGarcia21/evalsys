import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import databaseRubric from '../data/databaseRubric.json';
import productVideo from '../data/productVideo.json';
import LegalLinks, { CopyrightNotice } from '../components/LegalLinks';
import './Landing.css';

const videoUrl = `/media/evalsys-overview.mp4?v=${productVideo.revision}`;
const posterUrl = `/media/evalsys-overview-poster.jpg?v=${productVideo.revision}`;
const captionsUrl = `/media/evalsys-overview.vtt?v=${productVideo.revision}`;
const instructorRequestUrl = 'https://mail.google.com/mail/?view=cm&fs=1&to=garciajerico217%40gmail.com&su=EvalSys%20Instructor%20Account%20Request';

const chapters = [
  { seconds: 3, time: '00:03', label: 'The rubric', title: 'Instructor reviews the active rubric' },
  { seconds: 12, time: '00:12', label: 'Registration', title: 'Students register groups' },
  { seconds: 28, time: '00:28', label: 'Panel grading', title: 'Panels grade assigned groups' },
  { seconds: 50, time: '00:50', label: 'The results', title: 'Instructor reviews and exports' },
  { seconds: 61, time: '01:01', label: 'Install the app', title: 'Install EvalSys as an app' },
];
const roles = [
  { role: 'Instructor', title: 'Set the standard.', desc: 'Create subjects and blocks, choose your rubric, assign panels, and share a registration link.' },
  { role: 'Students', title: 'Bring your project.', desc: 'Register your group and members through your instructor’s link. Attach a proposal when requested.' },
  { role: 'Assigned panels', title: 'Give considered feedback.', desc: 'Review assigned groups, rate the active rubric, and submit scores with your comments.' },
  { role: 'Instructor', title: 'See the complete picture.', desc: 'Review panel averages and feedback, track missing submissions, and export group or member grades.' },
];
const faqs = [
  ['How do student groups register?', 'Ask your instructor for the registration link for your subject or block. Use it to enter your group name, members, and an optional proposal. Students do not need a dashboard account to register.'],
  ['How do I get an Instructor account?', 'Contact the developer, Jerico B. Garcia, at garciajerico217@gmail.com to request an instructor account. Include your full name, school or institution, department, and subjects you plan to evaluate. After your account is created, sign in with your temporary password and create a private password.'],
  ['How do panel judges and students get access?', 'Panel judges receive their account from the instructor managing the evaluation. Students use their instructor’s registration link to register a group; they do not need a dashboard account.'],
  ['When are final results available?', 'Final results require submissions from all assigned panels. Until then, the Results page shows which evaluations are still pending.'],
  ['Does the installed app work without internet?', 'An internet connection is required for signing in, registration, submitting evaluations, and syncing results. Installing EvalSys gives you an app window and a home-screen or desktop shortcut.'],
];
const sections = Object.entries(databaseRubric.criteria.reduce<Record<string, number>>((totals, criterion) => {
  totals[criterion.section] = (totals[criterion.section] || 0) + criterion.maxScore;
  return totals;
}, {}));

export default function Landing() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const studentDialog = useRef<HTMLDialogElement>(null);
  const accountDialog = useRef<HTMLDialogElement>(null);
  const [activeChapter, setActiveChapter] = useState(-1);
  const [videoError, setVideoError] = useState(false);
  const playChapter = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    void video.play().catch(() => video.focus());
  };

  return <div className="landing">
    <a className="landing-skip" href="#main-content">Skip to content</a>
    <header className="landing-header">
      <div className="landing-container landing-nav">
        <Link to="/" className="landing-brand" aria-label="EvalSys home"><img src="/app-icon.svg" alt="" width="36" height="36" /><span>EvalSys<span className="landing-brand-note">PROJECT EVALUATION</span></span></Link>
        <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#install-app">Install app</a><button type="button" className="landing-nav-help" onClick={() => studentDialog.current?.showModal()}>Student registration</button><Link className="landing-button landing-button-small" to="/login">Sign in <span aria-hidden="true">↗</span></Link></nav>
      </div>
    </header>

    <main id="main-content">
      <section className="landing-hero" aria-labelledby="hero-heading">
        <div className="landing-container">
          <div className="landing-hero-topline"><span>FOR THE WORK BEHIND EVERY GRADE</span><span>RUBRICS → FEEDBACK → RESULTS</span></div>
          <div className="landing-hero-grid">
            <div className="landing-hero-copy">
              <p className="landing-eyebrow">INSTRUCTOR-LED. PROJECT-FOCUSED.</p>
              <h1 id="hero-heading">One evaluation.<br /><em>Connected.</em></h1>
              <p className="landing-intro">Bring your rubric, student groups, and panel feedback into one clear evaluation workflow.</p>
              <div className="landing-hero-actions"><Link to="/login" className="landing-button">Open portal <span aria-hidden="true">↗</span></Link><a href="#product-video" className="landing-text-link">Watch EvalSys in action <span aria-hidden="true">↘</span></a></div>
              <p className="landing-access-note">New instructor? <a href="#instructor-access">Request an instructor account</a></p>
              <p className="landing-access-note">Have a class registration link? <button type="button" onClick={() => studentDialog.current?.showModal()}>Start here</button></p>
            </div>
            <div id="product-video" className="landing-film" aria-labelledby="film-heading">
              <div className="landing-film-label"><h2 id="film-heading">A real workflow. In 77 seconds.</h2><span>01:17 / OVERVIEW</span></div>
              <video key={productVideo.revision} ref={videoRef} controls playsInline preload="none" poster={posterUrl} aria-label="EvalSys product overview" aria-describedby="product-video-summary" onError={() => setVideoError(true)} onTimeUpdate={() => { const time = videoRef.current?.currentTime || 0; setActiveChapter(chapters.reduce((current, chapter, index) => time >= chapter.seconds ? index : current, -1)); }}>
                <source src={videoUrl} type="video/mp4" />
                <track kind="captions" src={captionsUrl} srcLang="en" label="English" />
                Your browser does not support embedded video. <a href={videoUrl}>Download the EvalSys product video</a>.
              </video>
              {videoError && <p className="landing-video-error" role="status">The video could not load. <button type="button" onClick={() => { setVideoError(false); videoRef.current?.load(); }}>Try again</button> or use the download link below.</p>}
              <div className="landing-film-caption"><p id="product-video-summary">Real interactions · Synthetic demo data · Core-workflow overview</p><a href={videoUrl} download>Download video <span aria-hidden="true">↓</span></a></div>
            </div>
          </div>
          <div className="landing-chapters" role="group" aria-label="Video chapters"><p>EXPLORE<br />THE WORKFLOW <span aria-hidden="true">→</span></p>{chapters.map((chapter, index) => <button type="button" key={chapter.seconds} aria-label={`Play chapter: ${chapter.title}`} aria-pressed={activeChapter === index} onClick={() => playChapter(chapter.seconds)}><span>{chapter.time}</span><strong>{chapter.label}</strong><span className="landing-chapter-arrow" aria-hidden="true">↗</span></button>)}</div>
          <div className="landing-hero-bottom"><span>Built around instructors, students, and panel judges.</span><a href="#install-app">Installable PWA · How to install <span aria-hidden="true">↗</span></a></div>
        </div>
      </section>

      <section id="instructor-access" className="landing-instructor-access" aria-labelledby="instructor-access-heading">
        <div className="landing-container">
          <div>
            <p className="landing-eyebrow">NEW TO EVALSYS?</p>
            <h2 id="instructor-access-heading">Start with an instructor account.</h2>
            <p>Contact Jerico B. Garcia, the developer, to request access. Include your full name, school or institution, department, and the subjects you plan to evaluate.</p>
            <p>After your account is created, sign in, change your temporary password, and set up your evaluation. Panel judges get accounts from their instructor; students use a class registration link.</p>
          </div>
          <div className="landing-contact-action">
            <span>CONTACT THE DEVELOPER</span>
            <a href={instructorRequestUrl} target="_blank" rel="noopener noreferrer">garciajerico217@gmail.com</a>
            <a className="landing-button" href={instructorRequestUrl} target="_blank" rel="noopener noreferrer">Request instructor account <span aria-hidden="true">↗</span></a>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="landing-workflow landing-section" aria-labelledby="workflow-heading">
        <div className="landing-container"><div className="landing-section-heading"><div><p className="landing-eyebrow">THE EVALUATION, END TO END</p><h2 id="workflow-heading">Different roles.<br />One shared process.</h2></div><p>Keep each person focused on their part, from the first registration to the final grade export.</p></div>
          <ol className="landing-role-list">{roles.map((item, index) => <li key={item.title}><span className="landing-step">0{index + 1}</span><div><p className="landing-role">{item.role}</p><h3>{item.title}</h3></div><p>{item.desc}</p></li>)}</ol>
        </div>
      </section>

      <section className="landing-rubric landing-section" aria-labelledby="rubric-heading"><div className="landing-container landing-rubric-grid"><div><p className="landing-eyebrow">A CLEAR STANDARD FOR EVERY PANEL</p><h2 id="rubric-heading">Your criteria.<br />Your evaluation.</h2><p>Use an existing preset or manage a rubric for your subject. Panels work from the active criteria and performance ratings.</p><p className="landing-rubric-note">The film follows the Database Final Project preset. Final results bring together all assigned panel submissions.</p><button className="landing-text-link" type="button" onClick={() => accountDialog.current?.showModal()}>Get portal access <span aria-hidden="true">↗</span></button></div><div className="landing-rubric-example"><div className="landing-example-heading"><span>IN THE DEMO</span><span>{databaseRubric.criteria.length} CRITERIA</span></div><h3>Database Final Project</h3>{sections.map(([name, weight]) => <div className="landing-weight" key={name}><div><span>{name}</span><strong>{weight}%</strong></div><div className="landing-weight-track"><span style={{ width: `${weight}%` }} /></div></div>)}<p>One available preset. Instructors choose the rubric for their subject.</p></div></div></section>

      <section id="install-app" className="landing-install landing-section" aria-labelledby="install-heading"><div className="landing-container"><div className="landing-section-heading"><div><p className="landing-eyebrow">WEB APP. FAMILIAR WORKSPACE.</p><h2 id="install-heading">Keep EvalSys one tap away.</h2></div><p>Open it from your home screen or desktop, in its own app window. Use your existing account.</p></div><div className="landing-install-guides"><div><span className="landing-install-platform">01 / CHROME · EDGE · ANDROID</span><h3>Install from your browser.</h3><p>Choose Install when EvalSys offers it, or open your browser menu and look for Install app or Add to Home screen. Confirm, then launch EvalSys from its new icon.</p></div><div><span className="landing-install-platform">02 / IPHONE · IPAD · SAFARI</span><h3>Add to your home screen.</h3><p>Open EvalSys in Safari, tap Share, then Add to Home Screen. Enable Open as Web App if shown, then tap Add.</p></div></div><p className="landing-install-note">An internet connection is required for signing in, registration, grading, and syncing results. Install options vary by device; you can always keep using EvalSys in your browser.</p></div></section>

      <section className="landing-faq landing-section" aria-labelledby="faq-heading"><div className="landing-container landing-faq-grid"><div><p className="landing-eyebrow">BEFORE YOU BEGIN</p><h2 id="faq-heading">A few useful answers.</h2><button type="button" className="landing-text-link" onClick={() => studentDialog.current?.showModal()}>Registration link help <span aria-hidden="true">↗</span></button></div><div>{faqs.map(([q, a]) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></div></section>

      <section className="landing-start"><div className="landing-container"><div><p className="landing-eyebrow">READY WHEN YOUR CLASS IS.</p><h2>Your next evaluation starts here.</h2></div><div><Link to="/login" className="landing-button">Open portal <span aria-hidden="true">↗</span></Link><button type="button" onClick={() => accountDialog.current?.showModal()}>Need an account? Request access</button></div></div></section>
    </main>
    <footer className="landing-footer"><div className="landing-container"><Link to="/" className="landing-brand"><img src="/app-icon.svg" alt="" width="30" height="30" /><span>EvalSys</span></Link><p>Project evaluation, from rubric to results.</p><p>Developed by Jerico B. Garcia<br /><a href={instructorRequestUrl} target="_blank" rel="noopener noreferrer">garciajerico217@gmail.com</a></p></div><div className="landing-container landing-legal-footer"><CopyrightNotice /><LegalLinks /></div></footer>

    <dialog className="landing-dialog" ref={studentDialog} aria-labelledby="registration-title"><form method="dialog"><button className="landing-dialog-close" aria-label="Close registration help">×</button><p className="landing-eyebrow">FOR STUDENTS</p><h2 id="registration-title">Student Group Registration</h2><p>Your instructor provides a unique registration link for your subject or block. You don’t need a dashboard account to register.</p><p className="landing-dialog-inset">Check your class group or email for a link containing <code>/register?token=…</code>.</p><p>Contact your instructor if you haven’t received your link.</p><button className="landing-button">Understood</button></form></dialog>
    <dialog className="landing-dialog" ref={accountDialog} aria-labelledby="access-title"><form method="dialog"><button className="landing-dialog-close" aria-label="Close account help">×</button><p className="landing-eyebrow">REQUEST AN INSTRUCTOR ACCOUNT</p><h2 id="access-title">Portal Access Request</h2><p>Contact Jerico B. Garcia, the developer, to request an instructor account. Include your full name, school or institution, department, and subjects you plan to evaluate.</p><a className="landing-dialog-email" href={instructorRequestUrl} target="_blank" rel="noopener noreferrer">garciajerico217@gmail.com</a><p>Panel judge? Ask your instructor for an account. Student? Use the registration link shared by your instructor.</p><button className="landing-button">Close</button></form></dialog>
  </div>;
}
