/**
 * Day types for the weekly split. Every training day maps to a routine in
 * `state.workouts`; picking a preset that doesn't exist yet creates an empty routine.
 */

export const PRESET_DAYS = ['Push', 'Pull', 'Legs', 'Chest', 'Back', 'Arms', 'Abs', 'Shoulders'];

export const MIN_SETS = 1;
export const MAX_SETS = 6;
export const MAX_DAY_NAME = 24;

/** CSS class that colours a day badge, safe for any custom name ("Full Body" → badge-full-body). */
export function badgeClass(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `badge-${slug || 'custom'}`;
}

/** Dropdown options: existing routines first, then presets not yet created. */
export function dayOptions(workouts) {
  const existing = Object.keys(workouts);
  const lower = new Set(existing.map((c) => c.toLowerCase()));
  return [...existing, ...PRESET_DAYS.filter((p) => !lower.has(p.toLowerCase()))];
}

/**
 * Turns a typed day name into the routine it should use.
 * Returns { name } (matching an existing routine's spelling when one exists) or { error }.
 */
export function resolveDayName(raw, workouts) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!name) return { error: 'Type a name for this day.' };
  if (name.length > MAX_DAY_NAME) return { error: `Keep it under ${MAX_DAY_NAME + 1} characters.` };
  if (name.toLowerCase() === 'rest') return { name: 'Rest' };
  const match = Object.keys(workouts).find((c) => c.toLowerCase() === name.toLowerCase());
  return { name: match || name };
}

/** Clamp a set count into the range My Split allows. */
export function clampSets(n) {
  const v = Number.isInteger(n) ? n : 3;
  return Math.min(MAX_SETS, Math.max(MIN_SETS, v));
}

const isEmptySet = (s) => s.weight === null && s.reps === null && !s.spotted && !Number.isInteger(s.rir);

/**
 * Makes a logged exercise's sets match the routine's set count: pads with empty sets,
 * and drops trailing empty sets above the target. Sets with data are never removed.
 */
export function fitSets(sets, target) {
  const out = sets.slice();
  while (out.length < target) out.push({ weight: null, reps: null, spotted: false });
  while (out.length > target && isEmptySet(out[out.length - 1])) out.pop();
  return out;
}
