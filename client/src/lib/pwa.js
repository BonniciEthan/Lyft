import { IS_LOCAL } from '../edition.js';
import { isTauri } from './storage.js';
import { captureInstallPrompt, isNativeApp } from './platform.js';

/**
 * Offline support for the hosted Lyft Local web app (e.g. GitHub Pages).
 *
 * - Registers the build-generated service worker so the app installs on Android
 *   ("Install app") and opens offline on iPhone and Android home screens. The same
 *   worker shows the 9pm daily reminder push notifications (see lib/reminders.js).
 * - Asks the browser to keep this site's storage, so the diary isn't evicted under
 *   storage pressure (honoured by Chrome/Android; iOS keeps home-screen app data anyway).
 *
 * Only the standalone (local) edition opts in. The server edition and the desktop app
 * stay as they were. Service workers need HTTPS (or localhost) anyway.
 */
export function registerOfflineSupport() {
  if (!IS_LOCAL || typeof window === 'undefined' || isTauri() || isNativeApp()) return;
  captureInstallPrompt();
  const secure = window.isSecureContext && /^https?:$/.test(window.location.protocol);
  if (!secure) return;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => {
        console.warn('Offline support unavailable', err);
      });
    });
  }

  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    /* not supported */
  }
}
