import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BackupError, backupFileName, buildBackup, isEmptySummary, parseBackup, summarizeState } from '../src/lib/backup.js';
import { normalizeState } from '../src/lib/storage.js';
import { mergeCache, readCache } from '../src/lib/openFoodFactsService.js';

const base = { split: {}, workouts: { Push: [{ id: 'p1', name: 'Bench', defaultSets: 3 }] }, logs: {}, goals: [] };
const full = normalizeState({
  ...base,
  logs: { '2026-11-14': { category: 'Push', exercises: [{ exerciseId: 'p1', name: 'Bench', sets: [{ weight: 80, reps: 5, spotted: false }] }] } },
  profile: { bodyweight: 80, sex: 'male', unit: 'kg', bodyweightHistory: [{ date: '2026-11-14', weightKg: 80 }] },
  nutrition: {
    days: { '2026-11-15': { breakfast: [{ id: 'e1', foodId: 'rolled-oats', name: 'Rolled Oats', grams: 80, per100g: { calories: 374, protein: 13.5, carbs: 58.7, fat: 8 } }] } },
    foods: [{ id: 'c1', name: 'My Bar', per100g: { calories: 400 } }],
    meals: [{ id: 'm1', name: 'Oats', items: [{ id: 'i1', foodId: 'rolled-oats', name: 'Rolled Oats', grams: 80, per100g: { calories: 374 } }] }],
    goal: 'cut',
  },
});

test('Backup round-trip keeps workouts, food diary, custom foods, presets, profile and targets', () => {
  const file = JSON.stringify(buildBackup(full, { appVersion: '1.2.0', edition: 'local', barcodeCache: { '3017620422003': { name: 'Nutella', per100g: { calories: 539 } } } }));
  const r = parseBackup(file);
  assert.deepEqual(r.state.logs, full.logs);
  assert.deepEqual(r.state.nutrition, full.nutrition);
  assert.deepEqual(r.state.profile, full.profile);
  assert.equal(r.appVersion, '1.2.0');
  assert.ok(r.exportedAt);
  assert.deepEqual(Object.keys(r.barcodeCache), ['3017620422003']);
  assert.deepEqual(r.summary, { workoutDays: 1, exercises: 1, foodDays: 1, foodEntries: 1, customFoods: 1, savedMeals: 1, bodyweightEntries: 1 });
});

test('Backup import accepts a bare state object (e.g. a server export)', () => {
  const r = parseBackup(JSON.stringify(full));
  assert.equal(r.summary.foodEntries, 1);
  assert.equal(r.exportedAt, null);
});

test('Backup import rejects junk with friendly errors', () => {
  assert.throws(() => parseBackup(''), BackupError);
  assert.throws(() => parseBackup('not json'), /isn't valid JSON/);
  assert.throws(() => parseBackup('{"hello":1}'), /isn't a Lyft backup/);
  assert.throws(() => parseBackup(JSON.stringify({ format: 'lyft-backup', version: 99, state: full })), /newer version/);
});

test('Backup import drops malformed barcode cache entries', () => {
  const r = parseBackup(JSON.stringify(buildBackup(full, { barcodeCache: { abc: {}, '123456': { name: 'x' }, '1234567': { name: 'ok', per100g: {} } } })));
  assert.deepEqual(Object.keys(r.barcodeCache), ['1234567']);
});

test('Empty-state detection and file name', () => {
  assert.equal(isEmptySummary(summarizeState(normalizeState(base))), true);
  assert.equal(isEmptySummary(summarizeState(full)), false);
  assert.equal(backupFileName(new Date(2026, 10, 15, 9)), 'lyft-backup-2026-11-15.json');
});

test('mergeCache adds imported barcode products to the local cache', () => {
  const m = new Map();
  const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  assert.equal(mergeCache({ '3017620422003': { name: 'Nutella', per100g: { calories: 539 } } }, storage), 1);
  assert.equal(readCache(storage)['3017620422003'].name, 'Nutella');
});
