import { IS_LOCAL } from '../edition.js';
import { isTauri } from './storage.js';
import { isIOS, isNativeApp, isStandalone } from './platform.js';
import { REMINDER_HOUR, REMINDER_MINUTE, nextReminderTime } from './maltaTime.js';

/**
 * Daily "log today's data" reminder at 21:00 Malta time, on every version of Lyft:
 *
 * - Android app (Capacitor): a repeating local notification scheduled on the phone.
 *   Works with the app closed and with no internet; no server involved.
 * - Desktop app (Tauri): a system notification at 21:00 while Lyft is open
 *   (running or minimised). Desktop apps can't wake themselves up once quit.
 * - Web app (GitHub Pages) on Android, desktop browsers and iPhone/iPad *added to the
 *   Home Screen*: Web Push. The browser subscription is sent to the small Lyft push
 *   server (push-worker/), which pings every subscriber at 21:00 Malta time. The ping
 *   carries no data; the service worker shows the reminder text itself. Nothing from
 *   the diary ever leaves the device.
 * - iPhone Safari in a normal tab: Apple only allows notifications for Home Screen web
 *   apps, so the app asks the user to add it first.
 */

export const REMINDER_TITLE = 'Lyft';
export const REMINDER_BODY = "Time to log today. Add your workout and food before bed.";

const ENABLED_KEY = 'lyft_reminder_enabled_v1';
const ASKED_KEY = 'lyft_reminder_asked_v1';
const PUSH_REFRESH_KEY = 'lyft_reminder_push_refreshed_v1';
const NATIVE_ID = 2100;
const NATIVE_CHANNEL = 'daily-reminder';

const PUSH_URL = String(import.meta.env?.VITE_PUSH_URL || '').replace(/\/+$/, '');
const PUSH_PUBLIC_KEY = String(import.meta.env?.VITE_PUSH_PUBLIC_KEY || '');

const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

export const REMINDER_TIME_LABEL = `${String(REMINDER_HOUR).padStart(2, '0')}:${String(REMINDER_MINUTE).padStart(2, '0')}`;

/**
 * How reminders work here:
 * 'native' | 'desktop' | 'push'   supported
 * 'needs-install'                 iPhone/iPad Safari tab: add to Home Screen first
 * 'unconfigured'                  web build without a push server configured
 * 'unsupported'                   browser has no push support
 */
export function reminderSupport() {
  if (typeof window === 'undefined') return 'unsupported';
  if (isNativeApp()) return 'native';
  if (isTauri()) return 'desktop';
  if (!IS_LOCAL) return 'unsupported'; // server edition registers no service worker
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!window.isSecureContext) return 'unsupported';
  if (!PUSH_URL || !PUSH_PUBLIC_KEY) return 'unconfigured';
  return 'push';
}

export function isReminderEnabled() {
  return read(ENABLED_KEY) === '1';
}

/** Whether the one-time "turn on reminders?" question was already answered. */
export function wasReminderAsked() {
  return read(ASKED_KEY) === '1';
}

export function markReminderAsked() {
  write(ASKED_KEY, '1');
}

/** Turn the reminder on. Must run from a tap (iOS rejects permission prompts otherwise). */
export async function enableReminder() {
  const kind = reminderSupport();
  markReminderAsked();
  if (kind === 'native') await enableNative();
  else if (kind === 'desktop') await enableDesktop();
  else if (kind === 'push') await enablePush();
  else throw new Error('Reminders are not available here');
  write(ENABLED_KEY, '1');
}

export async function disableReminder() {
  const kind = reminderSupport();
  write(ENABLED_KEY, '0');
  try {
    if (kind === 'native') await disableNative();
    else if (kind === 'desktop') stopDesktopTimer();
    else if (kind === 'push') await disablePush();
  } catch (err) {
    console.warn('Could not fully turn off reminder', err);
  }
}

/**
 * Called once at startup. Keeps an enabled reminder healthy: reschedules the Android
 * notification (Malta and phone time can drift apart over DST), starts the desktop timer,
 * and re-registers the web push subscription in case the browser rotated it.
 */
export async function resumeReminder() {
  if (!isReminderEnabled()) return;
  const kind = reminderSupport();
  try {
    if (kind === 'native') await scheduleNative();
    else if (kind === 'desktop') startDesktopTimer();
    else if (kind === 'push') await refreshPush();
  } catch (err) {
    console.warn('Could not resume reminder', err);
  }
}

/* ---------------- Android app ---------------- */

async function nativePlugin() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return LocalNotifications;
}

async function enableNative() {
  const LN = await nativePlugin();
  let perm = await LN.checkPermissions();
  if (perm.display !== 'granted') perm = await LN.requestPermissions();
  if (perm.display !== 'granted') throw new Error('Notifications are blocked. Allow them for Lyft in Android settings.');
  await scheduleNative();
}

async function scheduleNative() {
  const LN = await nativePlugin();
  const perm = await LN.checkPermissions();
  if (perm.display !== 'granted') return;
  try {
    await LN.createChannel({
      id: NATIVE_CHANNEL,
      name: 'Daily reminder',
      description: `Reminder at ${REMINDER_TIME_LABEL} to log the day`,
      importance: 4,
      visibility: 1,
    });
  } catch {
    /* channels are Android 8+ only */
  }
  // 21:00 in Malta, expressed in the phone's own clock (identical when the phone is in Malta).
  const at = nextReminderTime();
  await LN.cancel({ notifications: [{ id: NATIVE_ID }] }).catch(() => {});
  await LN.schedule({
    notifications: [
      {
        id: NATIVE_ID,
        title: REMINDER_TITLE,
        body: REMINDER_BODY,
        channelId: NATIVE_CHANNEL,
        schedule: { on: { hour: at.getHours(), minute: at.getMinutes() }, allowWhileIdle: true },
      },
    ],
  });
}

async function disableNative() {
  const LN = await nativePlugin();
  await LN.cancel({ notifications: [{ id: NATIVE_ID }] });
}

/* ---------------- Desktop app ---------------- */

let desktopTimer = null;
let desktopNext = 0;

async function desktopPlugin() {
  return import('@tauri-apps/plugin-notification');
}

async function enableDesktop() {
  const { isPermissionGranted, requestPermission } = await desktopPlugin();
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === 'granted';
  if (!granted) throw new Error('Notifications are blocked for Lyft in your system settings.');
  startDesktopTimer();
}

function startDesktopTimer() {
  stopDesktopTimer();
  desktopNext = nextReminderTime().getTime();
  // Checked every 30 s rather than one long timeout, so sleep/resume can't make it drift.
  desktopTimer = setInterval(async () => {
    const now = Date.now();
    if (now < desktopNext) return;
    const late = now - desktopNext > 60 * 60 * 1000; // woke up hours later: skip, don't spam
    desktopNext = nextReminderTime(new Date(now)).getTime();
    if (late) return;
    try {
      const { sendNotification } = await desktopPlugin();
      sendNotification({ title: REMINDER_TITLE, body: REMINDER_BODY });
    } catch (err) {
      console.warn('Reminder notification failed', err);
    }
  }, 30 * 1000);
}

function stopDesktopTimer() {
  if (desktopTimer) clearInterval(desktopTimer);
  desktopTimer = null;
}

/* ---------------- Web push ---------------- */

function keyBytes(base64url) {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function pushRegistration() {
  const reg = (await navigator.serviceWorker.getRegistration('./')) || (await navigator.serviceWorker.register('./sw.js', { scope: './' }));
  await navigator.serviceWorker.ready;
  return reg;
}

async function sendSubscription(sub) {
  const res = await fetch(`${PUSH_URL}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) throw new Error(`Reminder server error (${res.status})`);
  write(PUSH_REFRESH_KEY, String(Date.now()));
}

async function subscribe(reg) {
  return (
    (await reg.pushManager.getSubscription()) ||
    reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH_PUBLIC_KEY) })
  );
}

async function enablePush() {
  if (Notification.permission === 'denied') {
    throw new Error(
      isIOS() ? 'Notifications are off for Lyft. Turn them on in Settings › Notifications › Lyft.' : 'Notifications are blocked for this site in your browser settings.'
    );
  }
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were not allowed.');
  const reg = await pushRegistration();
  const sub = await subscribe(reg);
  try {
    await sendSubscription(sub);
  } catch (err) {
    throw new Error(err instanceof TypeError ? "Couldn't reach the reminder server. Check your connection and try again." : err.message);
  }
}

async function refreshPush() {
  if (Notification.permission !== 'granted') return;
  const reg = await pushRegistration();
  const existing = await reg.pushManager.getSubscription();
  const last = Number(read(PUSH_REFRESH_KEY)) || 0;
  // Re-send at most weekly, or straight away if the browser dropped the subscription.
  if (existing && Date.now() - last < 7 * 24 * 60 * 60 * 1000) return;
  await sendSubscription(existing || (await subscribe(reg)));
}

async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('./');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch(`${PUSH_URL}/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe();
}

/** Sends one reminder right away (native: in 5 seconds) so the user can check it works. */
export async function sendTestReminder() {
  const kind = reminderSupport();
  if (kind === 'native') {
    const LN = await nativePlugin();
    await LN.schedule({
      notifications: [{ id: NATIVE_ID + 1, title: REMINDER_TITLE, body: REMINDER_BODY, channelId: NATIVE_CHANNEL, schedule: { at: new Date(Date.now() + 5000) } }],
    });
  } else if (kind === 'desktop') {
    const { sendNotification } = await desktopPlugin();
    sendNotification({ title: REMINDER_TITLE, body: REMINDER_BODY });
  } else if (kind === 'push') {
    const reg = await navigator.serviceWorker.getRegistration('./');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) throw new Error('Reminder is not set up on this device. Turn it off and on again.');
    const res = await fetch(`${PUSH_URL}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    if (!res.ok) throw new Error(`Test failed (${res.status})`);
  }
}
