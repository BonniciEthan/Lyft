/**
 * Workout history helpers: last-session lookup, per-exercise bests, and merging two
 * exercises into one across every logged day.
 *
 * Pure module (no React, no browser globals) so it can be unit tested with node:test.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDone = (s) => s && Number.isFinite(s.reps) && s.reps > 0;
const isBlank = (s) => !s || (s.weight === null && s.reps === null);

/**
 * The most recent session before `beforeDate` in which each exercise was actually done.
 * Returns Map exerciseId → { date, sets } (only sets with reps logged).
 */
export function lastSessions(logs, beforeDate) {
  const out = new Map();
  const dates = Object.keys(logs || {})
    .filter((d) => DATE_RE.test(d) && d < beforeDate)
    .sort()
    .reverse();
  for (const date of dates) {
    for (const entry of logs[date]?.exercises || []) {
      if (out.has(entry.exerciseId)) continue;
      const sets = (entry.sets || []).filter(isDone);
      if (sets.length) out.set(entry.exerciseId, { date, sets });
    }
  }
  return out;
}

/**
 * Every exercise the app knows about: routine exercises first, then ones that only
 * survive in the logs (deleted from their routine). [{ id, name, category, inRoutine, sessions }]
 */
export function allExercises(state) {
  const map = new Map();
  for (const [category, list] of Object.entries(state?.workouts || {})) {
    for (const ex of list || []) map.set(ex.id, { id: ex.id, name: ex.name, category, inRoutine: true, sessions: 0 });
  }
  for (const log of Object.values(state?.logs || {})) {
    for (const entry of log?.exercises || []) {
      if (!(entry.sets || []).some(isDone)) continue;
      const rec = map.get(entry.exerciseId) || { id: entry.exerciseId, name: entry.name, category: log.category, inRoutine: false, sessions: 0 };
      rec.sessions += 1;
      map.set(entry.exerciseId, rec);
    }
  }
  return [...map.values()];
}

/**
 * Fold all history of `fromId` into `intoId` (mutates `state`), and remove `fromId` from
 * the routines. On days that logged both, the sets are joined. Returns sessions moved.
 */
export function mergeExercises(state, fromId, intoId) {
  if (!state || !fromId || !intoId || fromId === intoId) return 0;
  const all = allExercises(state);
  const into = all.find((e) => e.id === intoId);
  if (!into) return 0;
  let moved = 0;
  for (const log of Object.values(state.logs || {})) {
    const list = log?.exercises;
    if (!Array.isArray(list)) continue;
    const from = list.find((e) => e.exerciseId === fromId);
    if (!from) continue;
    const target = list.find((e) => e.exerciseId === intoId);
    if (target) {
      const kept = (target.sets || []).filter((s) => !isBlank(s));
      const extra = (from.sets || []).filter((s) => !isBlank(s));
      target.sets = kept.length + extra.length ? [...kept, ...extra] : target.sets;
      log.exercises = list.filter((e) => e !== from);
    } else {
      from.exerciseId = intoId;
      from.name = into.name;
    }
    moved += 1;
  }
  for (const category of Object.keys(state.workouts || {})) {
    state.workouts[category] = state.workouts[category].filter((ex) => ex.id !== fromId);
  }
  return moved;
}

const nameKey = (s) => String(s || '').trim().toLowerCase();

/**
 * Heaviest unspotted weight (kg) ever logged for each exercise, keyed by lower-cased
 * current name, so goals that name an exercise can track it automatically.
 */
export function bestWeights(state) {
  const current = new Map();
  for (const list of Object.values(state?.workouts || {})) for (const ex of list || []) current.set(ex.id, ex.name);
  const best = new Map();
  for (const log of Object.values(state?.logs || {})) {
    for (const entry of log?.exercises || []) {
      const key = nameKey(current.get(entry.exerciseId) || entry.name);
      for (const s of entry.sets || []) {
        if (!isDone(s) || s.spotted || !(s.weight > 0)) continue;
        if (s.weight > (best.get(key) || 0)) best.set(key, s.weight);
      }
    }
  }
  return best;
}

/** Goal progress with the live PR from the logs. Weights in kg. */
export function goalProgress(goal, bests) {
  const logged = bests?.get(nameKey(goal.exercise)) || 0;
  const current = Math.max(goal.currentPR || 0, logged);
  const start = Math.min(goal.startPR || 0, current);
  const span = goal.targetPR - start;
  const pct = span > 0 ? Math.max(0, Math.min(1, (current - start) / span)) : current >= goal.targetPR ? 1 : 0;
  const reached = goal.targetPR > 0 && current >= goal.targetPR;
  return { current, start, pct, reached, done: reached || goal.achieved === true };
}
