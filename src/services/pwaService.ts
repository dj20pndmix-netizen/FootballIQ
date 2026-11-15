/**
 * Progressive Web App (PWA) & Mobile Installation Service
 * Manages service worker lifecycle, automatic update checks on Android & desktop,
 * and detects standalone display mode.
 */

let deferredInstallPrompt: any = null;
const installListeners = new Set<(canInstall: boolean) => void>();
const updateListeners = new Set<() => void>();
let registrationInstance: ServiceWorkerRegistration | null = null;

export function registerServiceWorker(): void {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          registrationInstance = reg;
          console.log('[FootballIQ PWA] Service Worker registered:', reg.scope);

          // Check for updates on load
          reg.update().catch(() => {});

          // Detect new workers installing in background
          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[FootballIQ PWA] New update available. Activating new version...');
                  notifyUpdateListeners();
                }
              };
            }
          };
        })
        .catch((err) => {
          console.warn('[FootballIQ PWA] Service Worker registration skipped:', err);
        });

      // Handle controller change (seamless reload on background update)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          console.log('[FootballIQ PWA] New version activated. Reloading for fresh assets...');
          window.location.reload();
        }
      });
    });

    // Check for service worker updates whenever the user re-opens or focuses the app on mobile
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && registrationInstance) {
        registrationInstance.update().catch(() => {});
      }
    });

    window.addEventListener('focus', () => {
      if (registrationInstance) {
        registrationInstance.update().catch(() => {});
      }
    });

    // PWA Install Prompts
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      notifyInstallListeners(true);
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      notifyInstallListeners(false);
      console.log('[FootballIQ PWA] Installed successfully on device.');
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

export function subscribeAppUpdates(callback: () => void): () => void {
  updateListeners.add(callback);
  return () => {
    updateListeners.delete(callback);
  };
}

function notifyUpdateListeners(): void {
  updateListeners.forEach((listener) => listener());
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
    console.warn('[FootballIQ PWA] Install prompt failed:', err);
    return false;
  }
}

export function isAppInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isIosStandalone = (window.navigator as any).standalone === true;
  return isStandalone || isIosStandalone;
}

export const isStandaloneMode = isAppInstalled;

