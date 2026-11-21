import { addDays, daysBetween, fromKey, weekdayName } from './dates.js';

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

/* ------------------------------------------------------------------ */
/* Rotations: a weekday that alternates routines every 2 or 3 weeks     */
/* ------------------------------------------------------------------ */

/**
 * `state.rotations[day] = { picks, anchor }` for weekdays that rotate.
 * - picks: 2 or 3 day types (routine names or 'Rest'), one per week of the cycle.
 * - anchor: the Monday of a week that used picks[0].
 * Weekdays without an entry repeat `state.split[day]` every week. `split[day]` is kept
 * equal to picks[0] so older app versions still see a sensible weekly value.
 */
export const FREQUENCIES = [
  { weeks: 1, label: 'Weekly' },
  { weeks: 2, label: 'Every 2 wks' },
  { weeks: 3, label: 'Every 3 wks' },
];
export const MAX_ROTATION = 3;

/** Monday of the week containing `key` (weeks run Monday to Sunday). */
export function mondayOf(key) {
  return addDays(key, -((fromKey(key).getDay() + 6) % 7));
}

const mod = (n, m) => ((n % m) + m) % m;

/** Which pick of `rotation` applies to the week containing `dateKey`. */
export function rotationIndex(rotation, dateKey) {
  const weeks = Math.round(daysBetween(rotation.anchor, mondayOf(dateKey)) / 7);
  return mod(weeks, rotation.picks.length);
}

/** Day type scheduled for a date: the weekly value, or this week's pick of a rotation. */
export function scheduledFor(split, rotations, dateKey) {
  const day = weekdayName(dateKey);
  const rot = rotations?.[day];
  if (rot && Array.isArray(rot.picks) && rot.picks.length > 1) return rot.picks[rotationIndex(rot, dateKey)] || 'Rest';
  return split?.[day] || 'Rest';
}

/** How many weeks a weekday's cycle is (1 = every week). */
export function frequencyOf(rotations, day) {
  return rotations?.[day]?.picks?.length || 1;
}

/**
 * Changes a weekday's frequency (mutates draft state `d`). This week's day type is kept
 * and becomes Week 1 of the new cycle; existing picks follow in order, new ones are Rest.
 */
export function setFrequency(d, day, weeks, todayStr) {
  if (!d.rotations) d.rotations = {};
  const current = scheduledFor(d.split, d.rotations, todayStr);
  const rot = d.rotations[day];
  let picks = [d.split[day] || 'Rest'];
  if (rot) {
    const i = rotationIndex(rot, todayStr);
    picks = [...rot.picks.slice(i), ...rot.picks.slice(0, i)];
  }
  if (weeks <= 1) {
    delete d.rotations[day];
    d.split[day] = current;
    return;
  }
  picks = picks.slice(0, weeks);
  while (picks.length < weeks) picks.push('Rest');
  d.rotations[day] = { picks, anchor: mondayOf(todayStr) };
  d.split[day] = picks[0];
}

/** Sets the day type for one week of a rotation (mutates draft state `d`). */
export function setRotationPick(d, day, index, value) {
  const rot = d.rotations?.[day];
  if (!rot || index < 0 || index >= rot.picks.length) return;
  rot.picks[index] = value;
  if (index === 0) d.split[day] = value;
}

/** Makes `index` the pick for the current week, keeping the order of the cycle. */
export function setRotationThisWeek(d, day, index, todayStr) {
  const rot = d.rotations?.[day];
  if (!rot || index < 0 || index >= rot.picks.length) return;
  rot.anchor = addDays(mondayOf(todayStr), -7 * index);
}

/** Replaces a deleted routine with Rest everywhere in the schedule (mutates `d`). */
export function clearFromSchedule(d, name, weekdays) {
  for (const day of weekdays) {
    if (d.split[day] === name) d.split[day] = 'Rest';
    const rot = d.rotations?.[day];
    if (rot) rot.picks = rot.picks.map((p) => (p === name ? 'Rest' : p));
  }
}

/** Weekdays that use `name` in any week. */
export function daysUsing(split, rotations, name, weekdays) {
  return weekdays.filter((day) => split[day] === name || (rotations?.[day]?.picks || []).includes(name));
}

/* ------------------------------------------------------------------ */
/* Keeping today's log in step with My Split                            */
/* ------------------------------------------------------------------ */

/** An empty logged entry for a routine exercise. */
export function freshEntry(ex) {
  return {
    exerciseId: ex.id,
    name: ex.name,
    sets: Array.from({ length: ex.defaultSets }, () => ({ weight: null, reps: null, spotted: false })),
  };
}

/** routine name → Set of its exercise ids, taken before a My Split edit. */
export function routineIds(workouts) {
  const out = {};
  for (const [cat, list] of Object.entries(workouts || {})) out[cat] = new Set((list || []).map((ex) => ex.id));
  return out;
}

/**
 * After a My Split edit, makes the saved log for `dateKey` match its routine (mutates `d`):
 * - exercises removed from the routine are dropped, with everything logged for them that day;
 * - remaining exercises keep their sets, take the routine's name and set count, and follow
 *   its order; newly added exercises get empty sets;
 * - entries that were never part of the routine (e.g. moved in by a merge) are kept at the end;
 * - if the routine itself was deleted and nothing is left, the day's log goes too.
 * Only that one date is touched, so past history is never changed.
 */
export function syncLogToRoutine(d, before, dateKey) {
  const log = d.logs?.[dateKey];
  if (!log || !Array.isArray(log.exercises)) return;
  const was = before?.[log.category];
  if (!was) return; // not a routine before this edit (imported or already-removed day type)
  const template = d.workouts?.[log.category];
  const nowIds = new Set((template || []).map((ex) => ex.id));
  const kept = log.exercises.filter((e) => !(was.has(e.exerciseId) && !nowIds.has(e.exerciseId)));
  if (!template) {
    if (kept.length) log.exercises = kept;
    else delete d.logs[dateKey];
    return;
  }
  const byId = new Map(kept.map((e) => [e.exerciseId, e]));
  const ordered = template.map((ex) => {
    const e = byId.get(ex.id);
    return e ? { ...e, name: ex.name, sets: fitSets(e.sets || [], ex.defaultSets) } : freshEntry(ex);
  });
  log.exercises = [...ordered, ...kept.filter((e) => !nowIds.has(e.exerciseId))];
}

/** Wraps a My Split mutation so today's log is reconciled in the same state update. */
export function withLogSync(mutate, dateKey) {
  return (d) => {
    const before = routineIds(d.workouts);
    mutate(d);
    syncLogToRoutine(d, before, dateKey);
  };
}
