import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAttendanceGrid, calculateCurrentStreak, describeDay, isWorkoutLogged, workoutTotals } from '../src/lib/profileStats.js';
import { cleanAvatar, nameInitial, normalizeProfile, setAvatar, setDisplayName } from '../src/lib/lifterProfileStore.js';
import { buildBackup, parseBackup } from '../src/lib/backup.js';
import { normalizeState } from '../src/lib/storage.js';
import { weekdayName } from '../src/lib/dates.js';

// Mon Push, Tue Pull, Wed Legs, Thu Push, Fri Pull, Sat + Sun Rest.
const SPLIT = { Monday: 'Push', Tuesday: 'Pull', Wednesday: 'Legs', Thursday: 'Push', Friday: 'Pull', Saturday: 'Rest', Sunday: 'Rest' };
const day = (category, sets = 3) => ({
  category,
  exercises: [{ exerciseId: 'x', name: 'Bench', sets: Array.from({ length: sets }, () => ({ weight: 80, reps: 5, spotted: false })) }],
});
const empty = (category) => ({ category, exercises: [{ exerciseId: 'x', name: 'Bench', sets: [{ weight: null, reps: null, spotted: false }] }] });

test('calendar sanity: 2026-11-14 is a Saturday', () => {
  assert.equal(weekdayName('2026-11-14'), 'Saturday');
  assert.equal(weekdayName('2026-11-16'), 'Monday');
});

test('isWorkoutLogged ignores placeholder rows with nothing entered', () => {
  assert.equal(isWorkoutLogged({ '2026-11-13': empty('Pull') }, '2026-11-13'), false);
  assert.equal(isWorkoutLogged({ '2026-11-13': day('Pull') }, '2026-11-13'), true);
  assert.equal(isWorkoutLogged({}, '2026-11-13'), false);
});

test('streak: no workouts ever is 0, even on a rest day', () => {
  assert.equal(calculateCurrentStreak({}, SPLIT, '2026-11-15'), 0); // Sunday, Rest
  assert.equal(calculateCurrentStreak({}, SPLIT, '2026-11-16'), 0); // Monday
});

test('streak: workout yesterday + rest day today = 2', () => {
  assert.equal(calculateCurrentStreak({ '2026-11-14': day('Push') }, SPLIT, '2026-11-15'), 2);
});

test('streak: Friday workout, weekend rest, Monday not yet logged keeps the streak', () => {
  const logs = { '2026-11-13': day('Pull') };
  assert.equal(calculateCurrentStreak(logs, SPLIT, '2026-11-16'), 3); // Fri + Sat + Sun
  assert.equal(calculateCurrentStreak({ ...logs, '2026-11-16': day('Push') }, SPLIT, '2026-11-16'), 4);
});

test('streak: a missed training day resets to 0', () => {
  // Fri logged, rest weekend, Monday (Push) missed → on Tuesday it is broken.
  assert.equal(calculateCurrentStreak({ '2026-11-13': day('Pull') }, SPLIT, '2026-11-17'), 0);
});

test('streak: consecutive training days count each day', () => {
  const logs = { '2026-11-09': day('Push'), '2026-11-10': day('Pull'), '2026-11-11': day('Legs'), '2026-11-12': day('Push'), '2026-11-13': day('Pull') };
  // Sun 8th is Rest but before the oldest workout of the run, Sat 7th Rest too, Fri 6th missed.
  assert.equal(calculateCurrentStreak(logs, SPLIT, '2026-11-13'), 5);
  assert.equal(calculateCurrentStreak(logs, SPLIT, '2026-11-15'), 7);
});

test('streak: an all-Rest split cannot stretch one workout past its date', () => {
  const allRest = Object.fromEntries(Object.keys(SPLIT).map((d) => [d, 'Rest']));
  assert.equal(calculateCurrentStreak({ '2026-11-10': day('Push') }, allRest, '2026-11-16'), 7);
});

test('workoutTotals counts days with logged sets and logged sets only', () => {
  const logs = { '2026-11-10': day('Push', 4), '2026-11-11': day('Legs', 2), '2026-11-12': empty('Push') };
  assert.deepEqual(workoutTotals(logs), { workouts: 2, sets: 6 });
  assert.deepEqual(workoutTotals({}), { workouts: 0, sets: 0 });
});

test('attendance grid: 53 Sunday-first weeks ending on the Saturday of this week', () => {
  const g = buildAttendanceGrid({ '2026-11-13': day('Pull', 14), '2026-11-12': empty('Push') }, '2026-11-16');
  assert.equal(g.weeks.length, 53);
  assert.ok(g.weeks.every((w) => w.length === 7));
  assert.equal(weekdayName(g.start), 'Sunday');
  assert.equal(g.end, '2026-11-21');
  assert.equal(g.weeks[52][0].date, '2026-11-15');
  assert.equal(g.weeks[52][1].date, '2026-11-16');
  assert.equal(g.weeks[52][2].future, true);
  assert.equal(g.activeDays, 1);
  const fri = g.weeks[51][5];
  assert.equal(fri.date, '2026-11-13');
  assert.deepEqual([fri.active, fri.sets, fri.category], [true, 14, 'Pull']);
  assert.equal(describeDay(fri, SPLIT), 'Pull • 14 sets');
  assert.equal(describeDay(g.weeks[51][4], SPLIT), 'No workout logged'); // Thu, placeholder only
  assert.equal(describeDay(g.weeks[51][6], SPLIT), 'Scheduled Rest');
});

test('attendance grid: month labels are 3-letter, increasing, and not crowded on the left', () => {
  const g = buildAttendanceGrid({}, '2026-11-16');
  assert.ok(g.months.every((m) => /^[A-Z][a-z]{2}$/.test(m.label)));
  for (let i = 1; i < g.months.length; i++) assert.ok(g.months[i].col - g.months[i - 1].col >= 3);
  assert.equal(g.months.at(-1).label, 'Nov');
  assert.equal(g.activeDays, 0);
});

const AVATAR = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';

test('profile: old data without displayName / avatar loads with defaults', () => {
  const p = normalizeProfile({ bodyweight: 80, sex: 'male', unit: 'kg', bodyweightHistory: [] });
  assert.equal(p.displayName, 'Lifter');
  assert.equal(p.avatarDataUrl, null);
  assert.equal(normalizeProfile(undefined).displayName, 'Lifter');
  assert.equal(normalizeState({ split: {}, workouts: {}, logs: {}, goals: [] }).profile.avatarDataUrl, null);
});

test('profile: names are trimmed, capped at 32 and never blank', () => {
  assert.equal(setDisplayName({}, '  Ethan  ').displayName, 'Ethan');
  assert.equal(setDisplayName({ displayName: 'Ethan' }, '   ').displayName, 'Ethan');
  assert.equal(setDisplayName({}, '').displayName, 'Lifter');
  assert.equal(setDisplayName({}, 'x'.repeat(50)).displayName.length, 32);
  assert.equal(nameInitial('lifter'), 'L');
  assert.equal(nameInitial(''), 'L');
});

test('profile: avatar must be an image data URL', () => {
  assert.equal(setAvatar({}, AVATAR).avatarDataUrl, AVATAR);
  assert.equal(setAvatar({ avatarDataUrl: AVATAR }, null).avatarDataUrl, null);
  assert.equal(cleanAvatar('javascript:alert(1)'), null);
  assert.equal(cleanAvatar('data:text/html;base64,PGI+'), null);
  assert.equal(cleanAvatar(42), null);
});

test('backup round-trip keeps display name and photo', () => {
  const state = normalizeState({ split: {}, workouts: {}, logs: {}, goals: [], profile: { displayName: 'Ethan', avatarDataUrl: AVATAR } });
  const r = parseBackup(JSON.stringify(buildBackup(state, { appVersion: '1.3.0' })));
  assert.equal(r.state.profile.displayName, 'Ethan');
  assert.equal(r.state.profile.avatarDataUrl, AVATAR);
});
