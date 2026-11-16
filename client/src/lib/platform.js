import { isTauri } from './storage.js';

/** Where the app is running, for the install sheet and the daily reminder. */

export function isNativeApp() {
  try {
    return typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

export function isAndroid() {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
}

/** iOS browser that is not Safari itself (Chrome, Firefox, Edge on iPhone all use the Share sheet too). */
export function iosBrowser() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/CriOS/i.test(ua)) return 'chrome';
  if (/FxiOS/i.test(ua)) return 'firefox';
  if (/EdgiOS/i.test(ua)) return 'edge';
  // Instagram, Facebook, TikTok etc. in-app browsers cannot add to the Home Screen.
  if (/FBAN|FBAV|Instagram|Line\/|TikTok|Snapchat|GSA\//i.test(ua)) return 'in-app';
  return 'safari';
}

/** Opened from the Home Screen / installed app icon rather than a browser tab. */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.navigator.standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: fullscreen)').matches ||
      window.matchMedia?.('(display-mode: minimal-ui)').matches
    );
  } catch {
    return false;
  }
}

/** A browser tab (not the desktop app, not the Android app). */
export function isWebBrowser() {
  return typeof window !== 'undefined' && !isTauri() && !isNativeApp();
}

/* -------- Android "Install app" prompt ---------------------------------------------- */
// Chrome fires `beforeinstallprompt` once, often before React mounts, so it is caught here
// at startup (see registerOfflineSupport) and handed to whoever asks later.

let deferredInstall = null;
const installListeners = new Set();

export function captureInstallPrompt() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    installListeners.forEach((fn) => fn(true));
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    installListeners.forEach((fn) => fn(false));
  });
}

export function canPromptInstall() {
  return Boolean(deferredInstall);
}

export function onInstallPromptChange(fn) {
  installListeners.add(fn);
  return () => installListeners.delete(fn);
}

/** Shows Chrome's own install dialog. Resolves true when the user accepted. */
export async function promptInstall() {
  const e = deferredInstall;
  if (!e) return false;
  deferredInstall = null;
  installListeners.forEach((fn) => fn(false));
  try {
    await e.prompt();
    const choice = await e.userChoice;
    return choice?.outcome === 'accepted';
  } catch {
    return false;
  }
}
