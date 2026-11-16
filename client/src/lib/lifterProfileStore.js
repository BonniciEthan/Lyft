/**
 * Lifter profile: bodyweight, sex, display unit, display name and avatar photo.
 *
 * The profile lives on the main app state as `state.profile`, so it is persisted to
 * localStorage with everything else and travels with Save / Load to the server.
 * All internal values are kilograms; `unit` only affects input and display.
 *
 * Pure module (no React, no browser globals) so it can be unit tested with node:test.
 */

export const LB_TO_KG = 0.45359237;
export const SEXES = ['male', 'female'];
export const UNITS = ['kg', 'lbs'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const posNum = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const round2 = (n) => Math.round(n * 100) / 100;

export const DEFAULT_DISPLAY_NAME = 'Lifter';
export const DISPLAY_NAME_MAX = 32;
/** Compressed 256×256 avatars are ~10–25 KB; anything far larger isn't one of ours. */
export const AVATAR_MAX_CHARS = 400 * 1024;
const AVATAR_RE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;

/** Trimmed, length-capped display name, or null if it's empty. */
export function cleanDisplayName(v) {
  if (typeof v !== 'string') return null;
  const name = v.replace(/\s+/g, ' ').trim().slice(0, DISPLAY_NAME_MAX).trim();
  return name || null;
}

export function cleanAvatar(v) {
  return typeof v === 'string' && v.length <= AVATAR_MAX_CHARS && AVATAR_RE.test(v) ? v : null;
}

export function createDefaultProfile() {
  return { bodyweight: null, sex: 'male', unit: 'kg', bodyweightHistory: [], displayName: DEFAULT_DISPLAY_NAME, avatarDataUrl: null };
}

/** Coerce anything into a valid profile. `bodyweight` is always the latest kg value. */
export function normalizeProfile(raw) {
  const p = createDefaultProfile();
  if (!isObj(raw)) return p;
  if (SEXES.includes(raw.sex)) p.sex = raw.sex;
  if (UNITS.includes(raw.unit)) p.unit = raw.unit;
  p.displayName = cleanDisplayName(raw.displayName) ?? DEFAULT_DISPLAY_NAME;
  p.avatarDataUrl = cleanAvatar(raw.avatarDataUrl);

  const byDate = new Map();
  for (const h of Array.isArray(raw.bodyweightHistory) ? raw.bodyweightHistory : []) {
    if (isObj(h) && DATE_RE.test(h.date) && posNum(h.weightKg)) byDate.set(h.date, round2(h.weightKg));
  }
  p.bodyweightHistory = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, weightKg]) => ({ date, weightKg }));

  p.bodyweight = posNum(raw.bodyweight) ? round2(raw.bodyweight) : p.bodyweightHistory.at(-1)?.weightKg ?? null;
  return p;
}

export function hasBodyweight(profile) {
  return Boolean(profile && posNum(profile.bodyweight));
}

/* ------------------------------------------------------------------ */
/* Units                                                                */
/* ------------------------------------------------------------------ */

export const toKg = (value, unit) => (unit === 'lbs' ? value * LB_TO_KG : value);
export const fromKg = (kg, unit) => (unit === 'lbs' ? kg / LB_TO_KG : kg);

/** Round a display value: lbs to the nearest 0.5, kg to the nearest 0.25. */
export function roundForUnit(value, unit) {
  const step = unit === 'lbs' ? 0.5 : 0.25;
  return Math.round(value / step) * step;
}

/** Smallest standard plate jump: 1.25 kg or 2.5 lbs. */
export const plateStep = (unit) => (unit === 'lbs' ? 2.5 : 1.25);

/** Round a kg value UP to the next plate increment in the display unit. Returns display units. */
export function ceilToPlate(kg, unit) {
  const step = plateStep(unit);
  const v = fromKg(kg, unit);
  return Math.ceil(v / step - 1e-9) * step;
}

const trimNum = (n) => String(Math.round(n * 100) / 100);

/** "82.5 kg" / "181.5 lbs". */
export function formatWeight(kg, unit, { suffix = true } = {}) {
  if (kg === null || kg === undefined || !Number.isFinite(kg)) return '–';
  const v = trimNum(roundForUnit(fromKg(kg, unit), unit));
  return suffix ? `${v} ${unit}` : v;
}

/* ------------------------------------------------------------------ */
/* Bodyweight history                                                   */
/* ------------------------------------------------------------------ */

/**
 * Bodyweight to use for a workout on `date`: the latest entry on or before that date,
 * else the earliest entry after it, else current bodyweight.
 */
export function bodyweightOn(profile, date) {
  const hist = profile?.bodyweightHistory || [];
  let pick = null;
  for (const h of hist) {
    if (h.date <= date) pick = h.weightKg;
    else break;
  }
  if (pick === null && hist.length) pick = hist[0].weightKg;
  return pick ?? posNum(profile?.bodyweight) ?? null;
}

/* ------------------------------------------------------------------ */
/* Mutations (return a new profile)                                     */
/* ------------------------------------------------------------------ */

/** Log a bodyweight (in kg) for `date`, replacing any entry for that date. */
export function setBodyweight(profile, weightKg, date) {
  const p = normalizeProfile(profile);
  const w = posNum(weightKg);
  if (!w || !DATE_RE.test(date)) return p;
  const kg = round2(w);
  p.bodyweightHistory = p.bodyweightHistory.filter((h) => h.date !== date);
  p.bodyweightHistory.push({ date, weightKg: kg });
  const next = normalizeProfile(p);
  // Current bodyweight follows the most recent dated entry.
  next.bodyweight = next.bodyweightHistory.at(-1).weightKg;
  return next;
}

export function setSex(profile, sex) {
  const p = normalizeProfile(profile);
  if (SEXES.includes(sex)) p.sex = sex;
  return p;
}

export function setUnit(profile, unit) {
  const p = normalizeProfile(profile);
  if (UNITS.includes(unit)) p.unit = unit;
  return p;
}

/** Rename; an empty or blank name keeps the current one. */
export function setDisplayName(profile, name) {
  const p = normalizeProfile(profile);
  p.displayName = cleanDisplayName(name) ?? p.displayName;
  return p;
}

/** Set (a compressed data URL) or clear (null) the profile photo. */
export function setAvatar(profile, dataUrl) {
  const p = normalizeProfile(profile);
  p.avatarDataUrl = dataUrl === null ? null : cleanAvatar(dataUrl) ?? p.avatarDataUrl;
  return p;
}

/** "L" from "lifter"; first letter of the first word. */
export function nameInitial(name) {
  const ch = [...String(name || DEFAULT_DISPLAY_NAME).trim()][0] || 'L';
  return ch.toUpperCase();
}

/** Parse a user-typed weight in `unit` into kg (null if invalid). */
export function parseWeightInput(text, unit) {
  const n = parseFloat(String(text ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 1000) return null;
  return round2(toKg(n, unit));
}
