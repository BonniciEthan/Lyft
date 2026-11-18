import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeClass, clampSets, dayOptions, fitSets, resolveDayName } from '../src/lib/splitDays.js';

const empty = () => ({ weight: null, reps: null, spotted: false });

test('badgeClass makes safe class names', () => {
  assert.equal(badgeClass('Push'), 'badge-push');
  assert.equal(badgeClass('Full Body'), 'badge-full-body');
  assert.equal(badgeClass('  !! '), 'badge-custom');
});

test('dayOptions lists existing routines then missing presets', () => {
  const opts = dayOptions({ Push: [], 'Full Body': [], chest: [] });
  assert.deepEqual(opts.slice(0, 3), ['Push', 'Full Body', 'chest']);
  assert.ok(opts.includes('Shoulders'));
  assert.ok(!opts.includes('Chest'), 'case-insensitive match keeps the existing spelling');
  assert.ok(!opts.includes('Rest'));
});

test('resolveDayName validates and reuses existing routines', () => {
  assert.ok(resolveDayName('   ', {}).error);
  assert.ok(resolveDayName('x'.repeat(25), {}).error);
  assert.deepEqual(resolveDayName('rest', {}), { name: 'Rest' });
  assert.deepEqual(resolveDayName('  full   body ', { 'Full Body': [] }), { name: 'Full Body' });
  assert.deepEqual(resolveDayName('Cardio', {}), { name: 'Cardio' });
});

test('clampSets keeps 1 to 6', () => {
  assert.equal(clampSets(0), 1);
  assert.equal(clampSets(9), 6);
  assert.equal(clampSets(undefined), 3);
});

test('fitSets pads and trims only empty trailing sets', () => {
  assert.equal(fitSets([empty()], 3).length, 3);
  assert.equal(fitSets([empty(), empty(), empty(), empty()], 2).length, 2);
  const withData = [empty(), { weight: 50, reps: 8, spotted: false }, empty()];
  assert.equal(fitSets(withData, 1).length, 2, 'stops at a set with data');
});

import { frequencyOf, mondayOf, rotationIndex, scheduledFor, setFrequency, setRotationPick, setRotationThisWeek, clearFromSchedule, daysUsing } from '../src/lib/splitDays.js';
import { normalizeState } from '../src/lib/storage.js';
import { calculateCurrentStreak } from '../src/lib/profileStats.js';

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const draft = () => ({
  split: { Monday: 'Push', Tuesday: 'Pull', Wednesday: 'Legs', Thursday: 'Push', Friday: 'Pull', Saturday: 'Rest', Sunday: 'Rest' },
  rotations: {},
});
// 2026-11-18 is a Wednesday; its week starts Monday 2026-11-16.
const TODAY = '2026-11-18';

test('mondayOf finds the start of the week', () => {
  assert.equal(mondayOf('2026-11-18'), '2026-11-16');
  assert.equal(mondayOf('2026-11-16'), '2026-11-16');
  assert.equal(mondayOf('2026-11-22'), '2026-11-16'); // Sunday
});

test('every 2 weeks alternates Legs and Arms on Wednesday', () => {
  const d = draft();
  setFrequency(d, 'Wednesday', 2, TODAY);
  assert.deepEqual(d.rotations.Wednesday, { picks: ['Legs', 'Rest'], anchor: '2026-11-16' });
  setRotationPick(d, 'Wednesday', 1, 'Arms');
  assert.equal(scheduledFor(d.split, d.rotations, '2026-11-18'), 'Legs');
  assert.equal(scheduledFor(d.split, d.rotations, '2026-11-25'), 'Arms');
  assert.equal(scheduledFor(d.split, d.rotations, '2026-12-02'), 'Legs');
  assert.equal(scheduledFor(d.split, d.rotations, '2026-11-11'), 'Arms'); // the week before
  assert.equal(scheduledFor(d.split, d.rotations, '2026-11-19'), 'Push'); // other days untouched
});

test('every 3 weeks cycles three picks', () => {
  const d = draft();
  setFrequency(d, 'Wednesday', 3, TODAY);
  setRotationPick(d, 'Wednesday', 1, 'Arms');
  setRotationPick(d, 'Wednesday', 2, 'Rest');
  assert.equal(frequencyOf(d.rotations, 'Wednesday'), 3);
  const got = ['2026-11-18', '2026-11-25', '2026-12-02', '2026-12-09'].map((k) => scheduledFor(d.split, d.rotations, k));
  assert.deepEqual(got, ['Legs', 'Arms', 'Rest', 'Legs']);
});

test('choosing which week is this week shifts the cycle', () => {
  const d = draft();
  setFrequency(d, 'Wednesday', 2, TODAY);
  setRotationPick(d, 'Wednesday', 1, 'Arms');
  setRotationThisWeek(d, 'Wednesday', 1, TODAY);
  assert.equal(rotationIndex(d.rotations.Wednesday, TODAY), 1);
  assert.equal(scheduledFor(d.split, d.rotations, '2026-11-18'), 'Arms');
  assert.equal(scheduledFor(d.split, d.rotations, '2026-11-25'), 'Legs');
});

test('changing frequency keeps this week, and weekly keeps this week\'s routine', () => {
  const d = draft();
  setFrequency(d, 'Wednesday', 3, TODAY);
  setRotationPick(d, 'Wednesday', 1, 'Arms');
  setRotationPick(d, 'Wednesday', 2, 'Back');
  setRotationThisWeek(d, 'Wednesday', 1, TODAY); // this week = Arms
  setFrequency(d, 'Wednesday', 2, TODAY);
  assert.deepEqual(d.rotations.Wednesday.picks, ['Arms', 'Back']);
  assert.equal(scheduledFor(d.split, d.rotations, TODAY), 'Arms');
  setFrequency(d, 'Wednesday', 1, TODAY);
  assert.equal(d.rotations.Wednesday, undefined);
  assert.equal(d.split.Wednesday, 'Arms');
});

test('deleting a routine sets it to Rest in rotations too', () => {
  const d = draft();
  setFrequency(d, 'Wednesday', 2, TODAY);
  setRotationPick(d, 'Wednesday', 1, 'Arms');
  assert.deepEqual(daysUsing(d.split, d.rotations, 'Arms', WEEK), ['Wednesday']);
  clearFromSchedule(d, 'Arms', WEEK);
  assert.deepEqual(d.rotations.Wednesday.picks, ['Legs', 'Rest']);
});

test('normalizeState keeps valid rotations and drops broken ones', () => {
  const s = normalizeState({
    split: { Wednesday: 'Legs' },
    workouts: { Legs: [], Arms: [] },
    logs: {},
    goals: [],
    rotations: {
      Wednesday: { picks: ['Legs', 'Arms'], anchor: '2026-11-18' },
      Monday: { picks: ['Legs'], anchor: '2026-11-16' },
      Friday: { picks: ['Legs', 'Gone'], anchor: '2026-11-16' },
    },
  });
  assert.deepEqual(s.rotations.Wednesday, { picks: ['Legs', 'Arms'], anchor: '2026-11-16' });
  assert.equal(s.rotations.Monday, undefined);
  assert.deepEqual(s.rotations.Friday.picks, ['Legs', 'Rest']);
  assert.equal(s.split.Friday, 'Legs');
  assert.deepEqual(normalizeState({ split: {}, workouts: {}, logs: {}, goals: [] }).rotations, {});
});

test('streak counts a Rest week of a rotation as a rest day', () => {
  const split = { Monday: 'Push', Tuesday: 'Pull', Wednesday: 'Legs', Thursday: 'Push', Friday: 'Pull', Saturday: 'Rest', Sunday: 'Rest' };
  const rotations = { Wednesday: { picks: ['Legs', 'Rest'], anchor: '2026-11-09' } }; // 11-18 is the Rest week
  const log = { category: 'Push', exercises: [{ exerciseId: 'x', name: 'Bench', sets: [{ weight: 80, reps: 5, spotted: false }] }] };
  const logs = { '2026-11-16': log, '2026-11-17': log };
  assert.equal(calculateCurrentStreak(logs, split, '2026-11-18', rotations), 3);
  assert.equal(calculateCurrentStreak(logs, split, '2026-11-18'), 2);
});
