import { createSeedState } from '../seed.js';
import { WEEKDAYS } from './dates.js';

import { IS_LOCAL } from '../edition.js';
import { normalizeProfile } from './lifterProfileStore.js';
import { normalizeNutrition } from './nutritionStore.js';

export const STATE_KEY = IS_LOCAL ? 'gym_tracker_local_state_v1' : 'gym_tracker_state_v1';
export const SERVER_URL_KEY = 'gym_tracker_server_url';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

/** Loose structural check used before accepting any state from storage or server. */
export function looksLikeState(s) {
  return isObj(s) && isObj(s.split) && isObj(s.workouts) && isObj(s.logs) && Array.isArray(s.goals);
}

/** Coerce an arbitrary (possibly older / partial) state object into the current schema. */
export function normalizeState(raw) {
  const seed = createSeedState();
  if (!isObj(raw)) return seed;

  const workouts = {};
  const srcWorkouts = isObj(raw.workouts) ? raw.workouts : seed.workouts;
  for (const [cat, list] of Object.entries(srcWorkouts)) {
    if (!Array.isArray(list) || cat === 'Rest') continue;
    workouts[cat] = list
      .filter((ex) => isObj(ex) && typeof ex.id === 'string')
      .map((ex) => ({
        id: ex.id,
        name: typeof ex.name === 'string' ? ex.name : 'Exercise',
        defaultSets: Number.isInteger(ex.defaultSets) && ex.defaultSets > 0 ? ex.defaultSets : 3,
      }));
  }

  const split = {};
  for (const day of WEEKDAYS) {
    const v = isObj(raw.split) ? raw.split[day] : undefined;
    split[day] = typeof v === 'string' && (v === 'Rest' || workouts[v]) ? v : 'Rest';
  }

  const logs = {};
  if (isObj(raw.logs)) {
    for (const [date, log] of Object.entries(raw.logs)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isObj(log) || !Array.isArray(log.exercises)) continue;
      logs[date] = {
        category: typeof log.category === 'string' ? log.category : 'Push',
        exercises: log.exercises
          .filter((e) => isObj(e) && typeof e.exerciseId === 'string')
          .map((e) => ({
            exerciseId: e.exerciseId,
            name: typeof e.name === 'string' ? e.name : 'Exercise',
            sets: (Array.isArray(e.sets) ? e.sets : []).filter(isObj).map((s) => ({
              weight: numOrNull(s.weight),
              reps: numOrNull(s.reps) === null ? null : Math.round(s.reps),
              spotted: s.spotted === true,
            })),
          })),
      };
    }
  }

  const goals = (Array.isArray(raw.goals) ? raw.goals : [])
    .filter((g) => isObj(g) && typeof g.id === 'string')
    .map((g) => ({
      id: g.id,
      exercise: typeof g.exercise === 'string' ? g.exercise : '',
      startPR: num(g.startPR, num(g.currentPR)),
      currentPR: num(g.currentPR),
      targetPR: num(g.targetPR),
      targetDate: typeof g.targetDate === 'string' ? g.targetDate : '',
      notes: typeof g.notes === 'string' ? g.notes : '',
      achieved: g.achieved === true,
    }));

  return {
    lastSynced: typeof raw.lastSynced === 'string' ? raw.lastSynced : null,
    split,
    workouts,
    logs,
    goals,
    profile: normalizeProfile(raw.profile),
    nutrition: normalizeNutrition(raw.nutrition),
  };
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && looksLikeState(parsed.state)) {
      return { state: normalizeState(parsed.state), hasUnsavedChanges: parsed.hasUnsavedChanges === true };
    }
    // Tolerate a bare state object.
    if (looksLikeState(parsed)) return { state: normalizeState(parsed), hasUnsavedChanges: true };
  } catch (err) {
    console.warn('Failed to read local state', err);
  }
  return null;
}

export function saveLocal(state, hasUnsavedChanges) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ state, hasUnsavedChanges }));
  } catch (err) {
    console.warn('Failed to persist local state', err);
  }
}

export function cleanServerUrl(url) {
  return String(url || '')
    .trim()
    .replace(/\/+$/, '');
}

export function getServerUrl() {
  try {
    return cleanServerUrl(localStorage.getItem(SERVER_URL_KEY) || '');
  } catch {
    return '';
  }
}

export function setServerUrl(url) {
  try {
    localStorage.setItem(SERVER_URL_KEY, cleanServerUrl(url));
  } catch (err) {
    console.warn('Failed to store server URL', err);
  }
}

export function isTauri() {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

export function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
