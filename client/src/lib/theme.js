/**
 * Appearance preference: 'system' | 'dark' | 'light'.
 *
 * Stored per device in localStorage (never in the synced state), under the `lyft_` prefix so
 * "Delete all my data" removes it with everything else.
 */
export const THEME_KEY = 'lyft_theme_v1';
export const THEME_OPTIONS = ['system', 'dark', 'light'];

const THEME_COLOR = { dark: '#0B0D0C', light: '#ECEAE3' };

const safeStorage = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export function getTheme(storage = safeStorage()) {
  try {
    const v = storage?.getItem(THEME_KEY);
    return THEME_OPTIONS.includes(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Resolves a preference to the theme actually shown. */
export function resolveTheme(pref, prefersLight = false) {
  if (pref === 'dark' || pref === 'light') return pref;
  return prefersLight ? 'light' : 'dark';
}

const lightQuery = () =>
  typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

function paint(resolved) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved]);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', resolved);
}

let unlisten = null;

/** Applies the stored (or given) preference and follows the OS while it is 'system'. */
export function applyTheme(pref = getTheme()) {
  unlisten?.();
  unlisten = null;
  const mq = lightQuery();
  paint(resolveTheme(pref, !!mq?.matches));
  if (pref === 'system' && mq?.addEventListener) {
    const onChange = (e) => paint(resolveTheme('system', e.matches));
    mq.addEventListener('change', onChange);
    unlisten = () => mq.removeEventListener('change', onChange);
  }
}

export function setTheme(pref, storage = safeStorage()) {
  const value = THEME_OPTIONS.includes(pref) ? pref : 'system';
  try {
    if (value === 'system') storage?.removeItem(THEME_KEY);
    else storage?.setItem(THEME_KEY, value);
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
  applyTheme(value);
  return value;
}
