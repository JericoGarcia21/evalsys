import { useEffect, useState } from 'react';
import type { NotifyPayload, NotifyType } from '../utils/notify';

const styles: Record<NotifyType, { icon: string; iconClass: string; buttonClass: string }> = {
  info: {
    icon: 'i',
    iconClass: 'bg-primary/10 text-primary',
    buttonClass: 'bg-primary hover:bg-primary/90',
  },
  success: {
    icon: '✓',
    iconClass: 'bg-success/10 text-success',
    buttonClass: 'bg-success hover:bg-success/90',
  },
  error: {
    icon: '!',
    iconClass: 'bg-danger/10 text-danger',
    buttonClass: 'bg-danger hover:bg-danger/90',
  },
};

export default function AppAlert() {
  const [alert, setAlert] = useState<NotifyPayload | null>(null);

  useEffect(() => {
    const handleNotify = (event: Event) => {
      const detail = (event as CustomEvent<NotifyPayload>).detail;
      if (detail?.message) {
        setAlert({
          title: detail.title || 'Notice',
          type: detail.type || 'info',
          message: detail.message,
        });
      }
    };

    window.addEventListener('evalsys:notify', handleNotify);
    return () => window.removeEventListener('evalsys:notify', handleNotify);
  }, []);

  useEffect(() => {
    if (!alert) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAlert(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [alert]);

  if (!alert) return null;

  const type = alert.type || 'info';
  const style = styles[type];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-dark/60 backdrop-blur-sm p-4">
      <div className="evl-card w-full max-w-sm overflow-hidden bg-surface shadow-xl">
        <div className="px-6 pt-6 pb-4 text-center">
          <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-xl font-black ${style.iconClass}`}>
            {style.icon}
          </div>
          <h3 className="text-lg font-semibold tracking-tight text-text">{alert.title}</h3>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text/60">
            {alert.message}
          </p>
        </div>
        <div className="border-t border-muted/30 bg-bg/60 px-6 py-4">
          <button
            type="button"
            onClick={() => setAlert(null)}
            className={`w-full rounded-lg px-4 py-2.5 text-xs font-semibold text-white transition-colors ${style.buttonClass}`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
