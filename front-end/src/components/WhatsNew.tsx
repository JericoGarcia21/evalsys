import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { latestReleaseForRole, type ReleaseNote } from '../data/whatsNew';

export const openWhatsNewEvent = 'evalsys:whats-new-open';

const storageKey = (userId: string) => `evalsys_whats_new_seen_${userId}`;

// Automated UI tests opt out so the one-time modal cannot block their interactions.
const autoOpenDisabled = import.meta.env.VITE_DISABLE_WHATS_NEW === 'true';

const readSeenVersion = (userId: string) => {
  try {
    return localStorage.getItem(storageKey(userId)) || '';
  } catch {
    return '';
  }
};

const markSeen = (userId: string, version: string) => {
  try {
    localStorage.setItem(storageKey(userId), version);
  } catch {
    // Storage can be unavailable in restricted browser sessions.
  }
};

export default function WhatsNew() {
  const { user } = useAuth();
  const userId = user?.id || user?._id || '';
  const release = latestReleaseForRole(user?.role) as ReleaseNote | null;

  const [open, setOpen] = useState(false);
  const [activeRelease, setActiveRelease] = useState<ReleaseNote | null>(null);
  const dismissRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // Show once per user per release version.
  useEffect(() => {
    if (autoOpenDisabled) return;
    if (!userId || !release) return;
    if (readSeenVersion(userId) === release.version) return;
    const timer = window.setTimeout(() => {
      setActiveRelease(release);
      setOpen(true);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [userId, release]);

  // Allow reopening from the sidebar ("What's new" link).
  useEffect(() => {
    const handleOpen = () => {
      if (!release) return;
      setActiveRelease(release);
      setOpen(true);
    };
    window.addEventListener(openWhatsNewEvent, handleOpen);
    return () => window.removeEventListener(openWhatsNewEvent, handleOpen);
  }, [release]);

  const close = useCallback(() => {
    setOpen(false);
    if (userId && activeRelease) markSeen(userId, activeRelease.version);
  }, [userId, activeRelease]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    dismissRef.current?.focus();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open]);

  if (!open || !activeRelease) return null;

  return (
      <dialog
        ref={dialogRef}
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-3xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden rounded-2xl bg-surface text-text p-0 border border-muted/30 shadow-2xl backdrop:bg-dark/70 backdrop:backdrop-blur-sm"
        onCancel={event => { event.preventDefault(); close(); }}
        onKeyDown={event => {
          if (event.key !== 'Tab') return;
          const targets = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]');
          const first = targets[0];
          const last = targets[targets.length - 1];
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        }}
        onClick={event => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
        }}
      >
        <div className="shrink-0 border-b border-muted/30 bg-primary/5 px-5 py-5 sm:px-9 sm:py-7">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold uppercase tracking-widest text-primary">
              EvalSys · What's new
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Close what's new"
              className="flex items-center justify-center w-11 h-11 rounded-lg text-2xl leading-none text-text/70 hover:bg-primary/10 hover:text-text"
            >
              ×
            </button>
          </div>
          <h3 id="whats-new-title" className="mt-3 text-2xl sm:text-3xl font-bold leading-tight text-text">
            {activeRelease.title}
          </h3>
          {activeRelease.summary && <p className="mt-3 text-base sm:text-lg leading-relaxed text-text/80">{activeRelease.summary}</p>}
          <p className="mt-4 text-sm font-semibold text-text/65">
            Version {activeRelease.version} · {activeRelease.date}
          </p>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-9 sm:py-7" tabIndex={0} aria-label="Release highlights">
          <p className="text-xs font-bold uppercase tracking-widest text-text/60 mb-5">What this update brings you</p>
          <ul className="space-y-5 sm:space-y-6">
            {activeRelease.items.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                </span>
                <span className="text-base leading-relaxed text-text/85">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-between gap-4 border-t border-muted/30 bg-bg px-5 py-5 sm:px-9">
          <div className="flex-1 min-w-[180px]">
            <p className="text-sm font-semibold text-text">Better evaluations, one update at a time.</p>
            <p className="text-xs text-text/65 mt-1">Shown once per update. Revisit anytime from What's new.</p>
          </div>
          <button ref={dismissRef} type="button" onClick={close} className="evl-btn-primary !px-6 !py-3 !text-sm">
            Got it
          </button>
        </div>
      </dialog>
  );
}
