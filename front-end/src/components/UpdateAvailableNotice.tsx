import { useEffect, useState } from 'react';
import { applyServiceWorkerUpdate } from '../registerServiceWorker';

export default function UpdateAvailableNotice() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updating, setUpdating] = useState(false);
  const [backendUpdated, setBackendUpdated] = useState(false);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<ServiceWorkerRegistration>;
      setRegistration(customEvent.detail);
    };

    const handleBackendUpdate = () => setBackendUpdated(true);
    window.addEventListener('evalsys:backend-updated', handleBackendUpdate);
    window.addEventListener('evalsys:update-available', handleUpdate);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((current) => {
        if (current?.waiting) setRegistration(current);
      }).catch(() => undefined);
    }
    return () => {
      window.removeEventListener('evalsys:update-available', handleUpdate);
      window.removeEventListener('evalsys:backend-updated', handleBackendUpdate);
    };
  }, []);

  if (!registration && !backendUpdated) return null;

  return (
    <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[80] w-[min(360px,calc(100vw-2rem))] rounded-xl border border-primary/20 bg-surface shadow-2xl shadow-dark/15 p-4">
      <p className="text-sm font-black text-text">A new update is available</p>
      <p className="text-xs text-text/70 mt-1 leading-relaxed">
        Please click Update now to get the latest version of EvalSys. Save your work first; the app will reload.
      </p>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={updating}
          onClick={() => { setRegistration(null); setBackendUpdated(false); }}
          className="evl-btn-secondary !py-2 !px-3 !text-xs"
        >
          Later
        </button>
        <button
          type="button"
          disabled={updating}
          onClick={() => {
            setUpdating(true);
            applyServiceWorkerUpdate(registration);
          }}
          className="evl-btn-primary !py-2 !px-3 !text-xs"
        >
          {updating ? 'Updating...' : 'Update now'}
        </button>
      </div>
    </div>
  );
}
