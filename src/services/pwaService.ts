/**
 * Progressive Web App (PWA) & Mobile Installation Service
 * Manages service worker lifecycle, installation prompts on Android/desktop,
 * and detects standalone display mode.
 */

let deferredInstallPrompt: any = null;
const installListeners = new Set<(canInstall: boolean) => void>();

export function registerServiceWorker(): void {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('FootballIQ PWA Service Worker registered:', reg.scope);
        })
        .catch((err) => {
          console.warn('Service Worker registration skipped:', err);
        });
    });

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      notifyInstallListeners(true);
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      notifyInstallListeners(false);
      console.log('FootballIQ installed successfully on device.');
    });
  }
}

export function subscribeInstallPrompt(callback: (canInstall: boolean) => void): () => void {
  installListeners.add(callback);
  callback(Boolean(deferredInstallPrompt));
  return () => {
    installListeners.delete(callback);
  };
}

function notifyInstallListeners(canInstall: boolean): void {
  installListeners.forEach((listener) => listener(canInstall));
}

export async function promptPwaInstall(): Promise<boolean> {
  if (!deferredInstallPrompt) {
    return false;
  }
  try {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    notifyInstallListeners(false);
    return outcome === 'accepted';
  } catch (err) {
    console.warn('PWA install prompt failed:', err);
    return false;
  }
}

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
}
