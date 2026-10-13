import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { driver, type Driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tutorial.css';
import { useAuth } from '../context/useAuth';
import { TutorialContext } from './TutorialContext';
import { actionReady, tutorials, type TutorialRole } from './tours';
import { readTutorial, tutorialKey, writeTutorial } from './storage';

interface Session { role: TutorialRole; key: string; index: number; }
function visibleTarget(selector?: string): HTMLElement | undefined {
  if (!selector) return;
  return [...document.querySelectorAll<HTMLElement>(selector)].find(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && rect.right > 0 && rect.left < window.innerWidth;
  });
}
function waitForTarget(selector: string | undefined, signal: AbortSignal): Promise<HTMLElement | undefined> {
  if (!selector) return Promise.resolve(undefined);
  return new Promise(resolve => {
    const finish = (element?: HTMLElement) => {
      observer.disconnect();
      window.clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      resolve(element);
    };
    const cancel = () => finish();
    const check = () => { const element = visibleTarget(selector); if (element) finish(element); };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    const timer = window.setTimeout(() => finish(), 8000);
    signal.addEventListener('abort', cancel, { once: true });
    check();
  });
}

export default function TutorialProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isRegistration = location.pathname === '/register' || location.pathname.startsWith('/register/');
  const role: TutorialRole | null = isRegistration ? 'registration' : user?.role === 'admin' ? 'instructor' : user?.role === 'panel' ? 'panel' : null;
  const identity = role === 'registration' ? 'anonymous-browser' : user?.id || user?._id || '';
  const key = role && identity ? tutorialKey(identity, role) : '';
  const [registrationReady, setRegistrationReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [dismissedKey, setDismissedKey] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [completedMessage, setCompletedMessage] = useState(false);
  const driverRef = useRef<Driver | null>(null);
  const locationRef = useRef(location.pathname);
  useEffect(() => { locationRef.current = location.pathname; }, [location.pathname]);
  const available = Boolean(role && !loading && (role === 'registration' || !user?.mustChangePassword) && (role !== 'registration' || registrationReady));
  const record = readTutorial(key);
  const offer = available && !session && dismissedKey !== key && !record.completed && !record.dismissed && (isRegistration || location.pathname === '/dashboard');

  useEffect(() => {
    const update = () => setRegistrationReady(Boolean(document.querySelector('[data-tutorial="registration-form"][data-ready="true"]')));
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ready'] });
    update();
    return () => observer.disconnect();
  }, [location.pathname]);

  useEffect(() => {
    if (!session) return;
    // Stop on logout, account/role changes, or navigation outside this role's walkthrough.
    const allowedRoutes = tutorials[session.role].steps.map(step => step.route).filter(Boolean);
    const stillAllowed = session.role === 'registration' ? isRegistration && registrationReady : allowedRoutes.includes(location.pathname);
    if (session.key !== key || !stillAllowed) {
      writeTutorial(session.key, { step: session.index, dismissed: true });
      // Auth and route changes invalidate an external Driver.js session.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSession(null);
    }
  }, [key, location.pathname, isRegistration, registrationReady, session]);

  useEffect(() => {
    if (!session) return;
    const { role: tourRole, key: storageKey, index } = session;
    const config = tutorials[tourRole];
    const current = config.steps[index];
    if (!current) return;
    const abort = new AbortController();
    let disposed = false;
    let instance: Driver | null = null;
    let observer: MutationObserver | null = null;
    let cleanKeyboard: (() => void) | undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Synchronize the loading indicator with the external walkthrough lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreparing(true);
    writeTutorial(storageKey, { step: index, dismissed: false });

    const close = (complete = false) => {
      writeTutorial(storageKey, { completed: complete || Boolean(readTutorial(storageKey).completed), dismissed: true, step: complete ? 0 : index });
      setDismissedKey(storageKey);
      setCompletedMessage(complete);
      setSession(null);
      window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-tutorial="launcher"]')?.focus({ preventScroll: true }));
    };
    const next = () => {
      if (!actionReady(current.action)) return;
      if (index === config.steps.length - 1) close(true);
      else setSession({ role: tourRole, key: storageKey, index: index + 1 });
    };
    const previous = () => { if (index > 0) setSession({ role: tourRole, key: storageKey, index: index - 1 }); };

    const show = async () => {
      if (current.route && locationRef.current !== current.route) navigate(current.route);
      const element = await waitForTarget(current.target, abort.signal);
      if (disposed) return;
      setPreparing(false);
      const missing = current.target && !element;
      const description = missing ? current.missing || current.description + ' This feature is not available on this page yet. You can continue or replay after your instructor finishes the setup.' : current.description;
      instance = driver({
        animate: !reducedMotion,
        duration: 240,
        smoothScroll: !reducedMotion,
        overlayColor: '#0f172a',
        overlayOpacity: 0.58,
        overlayClickBehavior: 'none',
        stagePadding: 9,
        stageRadius: 14,
        popoverClass: 'evalsys-tour',
        allowKeyboardControl: false,
        disableActiveInteraction: !current.interactive,
        showProgress: true,
        progressText: 'Step {{current}} of {{total}}',
        nextBtnText: 'Next', prevBtnText: 'Back', doneBtnText: 'Finish', closeBtnLabel: 'Skip tutorial',
        onNextClick: next, onPrevClick: previous, onDoneClick: () => close(true), onCloseClick: () => close(),
        onDestroyed: () => { if (!disposed) close(); },
        onPopoverRender: popover => {
          popover.wrapper.setAttribute('role', 'dialog');
          popover.wrapper.setAttribute('aria-label', config.label + ' tutorial: ' + current.title);
          popover.wrapper.setAttribute('aria-modal', 'true');
          popover.closeButton.textContent = 'Skip';
          const eyebrow = document.createElement('p');
          eyebrow.className = 'evalsys-tour-eyebrow';
          eyebrow.textContent = config.label + ' guide';
          popover.wrapper.prepend(eyebrow);
          const bar = document.createElement('div');
          bar.className = 'evalsys-tour-progress';
          const fill = document.createElement('span');
          fill.style.width = ((index + 1) / config.steps.length * 100) + '%';
          bar.append(fill);
          popover.wrapper.append(bar);
          const hint = document.createElement('p');
          hint.className = 'evalsys-tour-hint';
          hint.setAttribute('aria-live', 'polite');
          popover.description.append(hint);
          const update = () => {
            const ready = actionReady(current.action);
            popover.nextButton.disabled = !ready;
            hint.textContent = ready ? current.interactive ? 'Interact with the highlighted area, then select Next.' : 'Arrow keys: next/back · Esc: skip' : 'Complete the highlighted action to continue, or select Skip.';
          };
          document.addEventListener('input', update);
          document.addEventListener('change', update);
          observer = new MutationObserver(update);
          observer.observe(document.querySelector('main') || document.querySelector('[data-tutorial="registration-form"]') || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-selected-group', 'data-loading'] });
          const onKey = (event: KeyboardEvent) => {
            if (document.querySelector('[data-app-confirm]')) return;
            const input = event.target instanceof HTMLElement && (event.target.matches('input, textarea, select') || event.target.isContentEditable);
            if (event.key === 'Escape') { event.preventDefault(); close(); }
            if (!input && event.key === 'ArrowRight') { event.preventDefault(); next(); }
            if (!input && event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
            if (event.key === 'Tab') {
              const allowed = [...popover.wrapper.querySelectorAll<HTMLElement>('button:not([disabled])'), ...(current.interactive && element ? [...element.querySelectorAll<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]'), ...(element.matches('input,select,textarea,button,a') ? [element] : [])] : [])].filter(item => item.getClientRects().length);
              const at = allowed.indexOf(document.activeElement as HTMLElement);
              const nextAt = event.shiftKey ? (at <= 0 ? allowed.length - 1 : at - 1) : (at + 1) % allowed.length;
              if (allowed[nextAt]) { event.preventDefault(); allowed[nextAt].focus(); }
            }
          };
          document.addEventListener('keydown', onKey, true);
          cleanKeyboard = () => {
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('input', update);
            document.removeEventListener('change', update);
          };
          update();
          window.requestAnimationFrame(() => popover.closeButton.focus({ preventScroll: true }));
        },
      });
      driverRef.current = instance;
      const steps: DriveStep[] = config.steps.map(step => ({ popover: { title: step.title, description: step.description } }));
      steps[index] = { element, disableActiveInteraction: !current.interactive, popover: { title: current.title, description } };
      instance.setSteps(steps);
      instance.drive(index);
    };
    const preventSubmission = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener('submit', preventSubmission, true);
    void show();
    return () => {
      document.removeEventListener('submit', preventSubmission, true);
      disposed = true;
      abort.abort();
      observer?.disconnect();
      cleanKeyboard?.();
      instance?.destroy();
      driverRef.current = null;
    };
  }, [session, navigate]);

  useEffect(() => {
    if (!completedMessage) return;
    const timer = window.setTimeout(() => setCompletedMessage(false), 5000);
    return () => window.clearTimeout(timer);
  }, [completedMessage]);

  const start = (resume = false) => {
    if (!available || !role || session) return;
    setCompletedMessage(false);
    const savedIndex = resume && Number.isInteger(record.step) ? Math.max(0, Math.min(record.step || 0, tutorials[role].steps.length - 1)) : 0;
    const destination = tutorials[role].steps[savedIndex]?.route;
    if (destination && destination !== location.pathname) navigate(destination);
    setSession({ role, key, index: savedIndex });
  };
  return (
    <TutorialContext.Provider value={{ start: () => start(), available, active: Boolean(session) }}>
      {children}
      {offer && (
        <div className="evalsys-tour-offer" role="region" aria-label="Tutorial invitation">
          <span className="evalsys-tour-eyebrow">A quick guided introduction</span>
          <h2>Welcome to {tutorials[role!].label}</h2>
          <p>Explore the real controls at your own pace. You stay in charge of every submission.</p>
          <div className="flex flex-wrap gap-2 mt-4">
            <button type="button" onClick={() => start(Boolean(record.step))} className="evl-btn-primary !text-xs">{record.step ? 'Resume tutorial' : 'Start tutorial'}</button>
            <button type="button" onClick={() => { writeTutorial(key, { dismissed: true }); setDismissedKey(key); }} className="evl-btn-secondary !text-xs">Maybe later</button>
          </div>
        </div>
      )}
      {session && preparing && <div className="evalsys-tour-loading" role="status">Preparing step {session.index + 1}… <button type="button" className="ml-3 underline" onClick={() => { writeTutorial(session.key, { step: session.index, dismissed: true }); setDismissedKey(session.key); setSession(null); }}>Skip tutorial</button></div>}
      {completedMessage && <div className="evalsys-tour-loading" role="status">Tutorial complete. You can replay it from Start tutorial.</div>}
    </TutorialContext.Provider>
  );
}
