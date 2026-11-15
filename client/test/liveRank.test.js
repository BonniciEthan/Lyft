import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRanks } from '../src/lib/rankingEngine.js';
import { liveRankStatus } from '../src/lib/liveRank.js';
import { normalizeProfile } from '../src/lib/lifterProfileStore.js';

const profile = normalizeProfile({ bodyweight: 80, sex: 'male' });
const set = (weight, reps, spotted = false) => ({ weight, reps, spotted });
const baselineFor = (sets) =>
  computeRanks({ workouts: {}, logs: { '2026-01-01': { category: 'Push', exercises: [{ exerciseId: 'b', name: 'Bench', sets }] } } }, profile).byId.b;

test('Live pill: no profile → nothing', () => {
  assert.equal(liveRankStatus({ name: 'Bench', sets: [] }, undefined, normalizeProfile({}), 'Push'), null);
});

test('Live pill: weight typed, reps empty → "Hit N reps for <next>"', () => {
  const base = baselineFor([set(80, 5)]);
  const s = liveRankStatus({ name: 'Bench', sets: [set(80, null)] }, base, profile, 'Push');
  assert.equal(s.tone, 'target');
  assert.match(s.text, /^Hit \d+ reps for /);
  assert.ok(s.text.endsWith(base.rank.next.label));
});

test('Live pill: reps short of target → "N more reps"', () => {
  const base = baselineFor([set(80, 5)]);
  const s = liveRankStatus({ name: 'Bench', sets: [set(70, 2)] }, base, profile, 'Push');
  assert.match(s.text, /^\d+ more reps? for /);
});

test('Live pill: beating the best → LP gain or RANK UP', () => {
  const base = baselineFor([set(80, 5)]);
  const small = liveRankStatus({ name: 'Bench', sets: [set(80, 6)] }, base, profile, 'Push');
  assert.ok(['pr', 'rankup'].includes(small.tone));
  const big = liveRankStatus({ name: 'Bench', sets: [set(140, 5)] }, base, profile, 'Push');
  assert.equal(big.tone, 'rankup');
  assert.match(big.text, /^RANK UP! → /);
});

test('Live pill: spotted set does not count', () => {
  const base = baselineFor([set(80, 5)]);
  const s = liveRankStatus({ name: 'Bench', sets: [set(200, 5, true)] }, base, profile, 'Push');
  assert.equal(s.tone, 'muted');
});

test('Live pill: idle shows the current rank', () => {
  const base = baselineFor([set(80, 5)]);
  const s = liveRankStatus({ name: 'Bench', sets: [set(null, null)] }, base, profile, 'Push');
  assert.equal(s.tone, 'idle');
  assert.ok(s.text.startsWith(base.rank.label));
});
