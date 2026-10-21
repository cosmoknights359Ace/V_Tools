import React, { useEffect, useState } from 'react';
import { Download, WifiOff, Check, Smartphone, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  if (isInstalled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap shrink-0">
        <Check className="w-3.5 h-3.5 text-emerald-500" />
        Installed Offline App
      </span>
    );
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold theme-card border border-[var(--border-strong)] rounded-lg hover:bg-[var(--bg-surface-hover)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        Install Offline App
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold theme-card border border-[var(--border-strong)] rounded-lg hover:bg-[var(--bg-surface-hover)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Smartphone className="w-3.5 h-3.5" />
        {isIOS ? 'Install on iOS' : 'Install Desktop PWA'}
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl theme-card p-6 border shadow-lg">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
                Install DocForge for 100% Offline Use
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
              {isIOS ? (
                <>
                  <p>To install DocForge on iPhone or iPad for offline conversion:</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-[var(--text-secondary)]">
                    <li>Tap the <strong>Share</strong> icon in the Safari toolbar.</li>
                    <li>Scroll down and select <strong>Add to Home Screen</strong>.</li>
                    <li>Launch DocForge anytime without an internet connection.</li>
                  </ol>
                </>
              ) : (
                <>
                  <p>
                    DocForge caches all PDF conversion engines locally via its Service Worker so it works with zero internet connectivity.
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-[var(--text-secondary)]">
                    <li>Open this app in its own browser tab (outside the preview frame) if prompted.</li>
                    <li>Click the <strong>Install DocForge</strong> icon in your browser address bar (Chrome, Edge, or Brave).</li>
                    <li>Or go to the <strong>Desktop Scripts</strong> tab to download the native Windows Python + MS Office COM offline suite (<code className="font-mono text-xs">doctopdf.py</code> &amp; <code className="font-mono text-xs">docgui.py</code>).</li>
                  </ol>
                </>
              )}
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs font-medium text-white shadow-md">
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span>Offline Mode Active · All conversions run locally on your device</span>
    </div>
  );
};
