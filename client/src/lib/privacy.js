/**
 * Privacy helpers: the 13+ age confirmation and "delete all my data".
 *
 * Everything Lyft keeps on a device lives in localStorage under keys that start with
 * `gym_tracker_` (app state, server URL) or `lyft_` (barcode cache, reminder flags,
 * install hint, last backup time, age confirmation).
 */
import { disableReminder, isReminderEnabled } from './reminders.js';

export const AGE_KEY = 'lyft_age_ok_v1';
const OWN_KEY = /^(gym_tracker_|lyft_)/;

export function isAgeConfirmed() {
  try {
    return localStorage.getItem(AGE_KEY) === '1';
  } catch {
    // Storage blocked (private mode etc.): don't lock the user out on every launch.
    return true;
  }
}

export function confirmAge() {
  try {
    localStorage.setItem(AGE_KEY, '1');
  } catch {
    /* storage unavailable: the gate simply shows again next launch */
  }
}

/** Names of every localStorage key Lyft owns on this device. */
export function ownStorageKeys(storage = localStorage) {
  const keys = [];
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i);
    if (k && OWN_KEY.test(k)) keys.push(k);
  }
  return keys;
}

/**
 * Turns off the daily reminder (removes the push subscription from the push server, or
 * cancels the on-device notification) and erases all of Lyft's data on this device.
 * Data on a self-hosted server is not touched.
 */
export async function deleteAllLocalData() {
  if (isReminderEnabled()) await disableReminder();
  for (const k of ownStorageKeys()) localStorage.removeItem(k);
}
