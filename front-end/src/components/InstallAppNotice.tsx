import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const dismissedKey = 'evalsys_install_prompt_dismissed';

const isStandalone = () => (
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true
);

export default function InstallAppNotice() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandalone() || window.localStorage.getItem(dismissedKey) === 'true') return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      window.localStorage.setItem(dismissedKey, 'true');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (!installPrompt) return null;

  const installApp = async () => {
    setInstalling(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        window.localStorage.setItem(dismissedKey, 'true');
      }
      setInstallPrompt(null);
    } finally {
      setInstalling(false);
    }
  };

  const dismiss = () => {
    window.localStorage.setItem(dismissedKey, 'true');
    setInstallPrompt(null);
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] w-[min(440px,calc(100vw-2rem))] rounded-2xl border border-primary/30 bg-surface shadow-2xl shadow-dark/25 p-6 sm:p-7">
      <p className="text-lg font-black text-text">Install EvalSys</p>
      <p className="text-sm text-text/70 mt-2 leading-relaxed">
        EvalSys is an installable web app (PWA). Add it to this device and open it from your home screen or desktop. Signing in and grading require an internet connection.
      </p>
      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={dismiss}
          disabled={installing}
          className="evl-btn-secondary !py-2.5 !px-4 !text-sm disabled:opacity-40"
        >
          Not Now
        </button>
        <button
          type="button"
          onClick={installApp}
          disabled={installing}
          className="evl-btn-primary !py-2.5 !px-5 !text-sm disabled:opacity-40"
        >
          {installing ? 'Opening...' : 'Install'}
        </button>
      </div>
    </div>
  );
}
