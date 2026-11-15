/**
 * Getting a backup file out of the app and back in, on every platform Lyft runs on.
 *
 * Save:
 *  - Android app (Capacitor): write to the app cache, then open the Android share sheet
 *    (Save to Drive / Files / email…). The WebView can't download blobs itself.
 *  - iPhone & Android browsers / home-screen apps: the Web Share sheet with the file
 *    ("Save to Files", AirDrop, Mail…) when supported.
 *  - Everywhere else (desktop browsers): a normal file download.
 *
 * Open: a plain <input type="file">, which works in all of the above.
 */

const isNative = () => {
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
};

/** Returns 'shared' | 'downloaded' | 'cancelled'. Throws on real failures. */
export async function saveBackupFile(fileName, text) {
  if (isNative()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const { uri } = await Filesystem.writeFile({ path: fileName, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title: 'Lyft backup', files: [uri], dialogTitle: 'Save Lyft backup' });
    } catch (err) {
      if (/cancel/i.test(String(err?.message || err))) return 'cancelled';
      throw err;
    }
    return 'shared';
  }

  const file = new File([text], fileName, { type: 'application/json' });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Lyft backup' });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // Any other share failure: fall back to a download below.
    }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}

export const readFileText = (file) =>
  typeof file.text === 'function'
    ? file.text()
    : new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => reject(r.error);
        r.readAsText(file);
      });

/* Per-device reminder of when the last backup was made. */
const LAST_KEY = 'lyft_last_backup_at';

export function getLastBackupAt() {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function setLastBackupAt(iso = new Date().toISOString()) {
  try {
    localStorage.setItem(LAST_KEY, iso);
  } catch {
    /* storage blocked: the reminder is optional */
  }
}
