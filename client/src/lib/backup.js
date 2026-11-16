/**
 * Backup files: everything Lyft stores on a device, in one JSON file.
 *
 *   {
 *     format: 'lyft-backup', version: 1,
 *     app: { name: 'Lyft', version: '1.3.0', edition: 'local' | 'server' },
 *     exportedAt: ISO string,
 *     state: { split, workouts, logs, goals, profile, nutrition, ... },
 *     barcodeCache: { [barcode]: food }   // scanned Open Food Facts products
 *   }
 *
 * Import accepts this format, or a bare state object (e.g. a server export), and always
 * runs it through normalizeState so older or partial files load safely.
 *
 * Pure module (no React, no browser globals) so it can be unit tested with node:test.
 */

import { looksLikeState, normalizeState } from './storage.js';
import { dayEntries } from './nutritionStore.js';
import { toKey } from './dates.js';

export const BACKUP_FORMAT = 'lyft-backup';
export const BACKUP_VERSION = 1;
const MAX_BYTES = 20 * 1024 * 1024;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export class BackupError extends Error {}

export function buildBackup(state, { appVersion = null, edition = null, barcodeCache = {}, now = new Date() } = {}) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: { name: 'Lyft', version: appVersion, edition },
    exportedAt: now.toISOString(),
    state,
    barcodeCache: isObj(barcodeCache) ? barcodeCache : {},
  };
}

export const backupFileName = (now = new Date()) => `lyft-backup-${toKey(now)}.json`;

/** Counts shown before export and in the import confirmation. */
export function summarizeState(state) {
  const logs = isObj(state?.logs) ? state.logs : {};
  const days = isObj(state?.nutrition?.days) ? state.nutrition.days : {};
  const workoutDays = Object.values(logs).filter((l) => (l.exercises || []).some((e) => (e.sets || []).some((s) => s.weight !== null || s.reps !== null))).length;
  return {
    workoutDays,
    exercises: Object.values(isObj(state?.workouts) ? state.workouts : {}).reduce((n, list) => n + (Array.isArray(list) ? list.length : 0), 0),
    foodDays: Object.keys(days).length,
    foodEntries: Object.values(days).reduce((n, d) => n + dayEntries(d).length, 0),
    customFoods: (state?.nutrition?.foods || []).length,
    savedMeals: (state?.nutrition?.meals || []).length,
    bodyweightEntries: (state?.profile?.bodyweightHistory || []).length,
  };
}

/** True when there's nothing worth backing up / nothing to lose on import. */
export function isEmptySummary(s) {
  return !s.workoutDays && !s.foodDays && !s.customFoods && !s.savedMeals && !s.bodyweightEntries;
}

function cleanBarcodeCache(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [code, food] of Object.entries(raw)) {
    if (!/^\d{6,14}$/.test(code) || !isObj(food) || !isObj(food.per100g) || typeof food.name !== 'string') continue;
    out[code] = food;
  }
  return out;
}

/**
 * Parse a backup file's text. Throws BackupError with a user-facing message when the file
 * isn't a usable Lyft backup.
 */
export function parseBackup(text) {
  if (typeof text !== 'string' || !text.trim()) throw new BackupError('That file is empty.');
  if (text.length > MAX_BYTES) throw new BackupError('That file is too large to be a Lyft backup.');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("That file isn't a Lyft backup (it isn't valid JSON).");
  }
  const isWrapped = isObj(data) && data.format === BACKUP_FORMAT;
  if (isWrapped && typeof data.version === 'number' && data.version > BACKUP_VERSION) {
    throw new BackupError('This backup was made by a newer version of Lyft. Update the app, then import it again.');
  }
  const raw = isWrapped ? data.state : isObj(data) && looksLikeState(data.state) ? data.state : data;
  if (!looksLikeState(raw)) throw new BackupError("That file isn't a Lyft backup.");

  const state = normalizeState(raw);
  return {
    state,
    exportedAt: isWrapped && typeof data.exportedAt === 'string' ? data.exportedAt : null,
    appVersion: isWrapped && typeof data.app?.version === 'string' ? data.app.version : null,
    barcodeCache: cleanBarcodeCache(isWrapped ? data.barcodeCache : null),
    summary: summarizeState(state),
  };
}
