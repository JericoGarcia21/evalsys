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
    dismissRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, close]);

  if (!open || !activeRelease) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-dark/60 backdrop-blur-sm p-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-surface shadow-2xl animate-in fade-in zoom-in duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-muted/30 bg-bg px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
              What's new
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Close what's new"
              className="text-lg leading-none text-text/50 hover:text-text"
            >
              ×
            </button>
          </div>
          <h3 id="whats-new-title" className="mt-3 text-base font-bold text-text">
            {activeRelease.title}
          </h3>
          <p className="text-[11px] font-semibold text-text/50">
            Version {activeRelease.version} · {activeRelease.date}
          </p>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          <ul className="space-y-3">
            {activeRelease.items.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                </span>
                <span className="text-xs leading-relaxed text-text/75">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-muted/30 px-6 py-4">
          <p className="text-[10px] text-text/45">You'll only see this once for this version.</p>
          <button ref={dismissRef} type="button" onClick={close} className="evl-btn-primary !py-2 !text-xs">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
