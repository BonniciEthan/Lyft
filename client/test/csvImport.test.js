import test from 'node:test';
import assert from 'node:assert/strict';
import { CsvImportError, detectColumns, mergeImportedSessions, parseCSV, parseDateKey, parseLiftCsv, parseWeight } from '../src/lib/csvImport.js';
import { normalizeState } from '../src/lib/storage.js';

test('parseCSV: BOM, CRLF, quotes, escaped quotes, blank lines, whitespace', () => {
  const text = '﻿Date,Exercise,Notes\r\n2025-01-02, "Bench Press, Barbell" ,"said ""hi"""\r\n\r\n2025-01-03,Squat,"line1\nline2"\n\n';
  assert.deepEqual(parseCSV(text), [
    ['Date', 'Exercise', 'Notes'],
    ['2025-01-02', 'Bench Press, Barbell', 'said "hi"'],
    ['2025-01-03', 'Squat', 'line1\nline2'],
  ]);
});

test('parseCSV: semicolon-delimited and trailing empty field', () => {
  assert.deepEqual(parseCSV('a;b;c\n1;2;\n'), [
    ['a', 'b', 'c'],
    ['1', '2', ''],
  ]);
});

test('detectColumns: aliases, case and units in headers; extras ignored', () => {
  const { cols, weightUnit } = detectColumns(['Workout Date', 'Routine', 'Exercise Name', 'Set Order', 'Weight (lbs)', 'Repetitions', 'RPE', 'Notes']);
  assert.deepEqual(cols, { exercise: 2, date: 0, workout: 1, set: 3, weight: 4, reps: 5 });
  assert.equal(weightUnit, 'lbs');
});

test('parseDateKey / parseWeight', () => {
  assert.equal(parseDateKey('2025-03-04 18:30:00'), '2025-03-04');
  assert.equal(parseDateKey('04/03/2025', true), '2025-03-04');
  assert.equal(parseDateKey('03/04/2025', false), '2025-03-04');
  assert.equal(parseDateKey('Mar 4, 2025'), '2025-03-04');
  assert.equal(parseDateKey('2025-02-30'), null);
  assert.equal(parseDateKey('nope'), null);
  assert.deepEqual(parseWeight('225 lbs'), { value: 225, unit: 'lbs' });
  assert.deepEqual(parseWeight('102,5'), { value: 102.5, unit: null });
  assert.deepEqual(parseWeight(''), { value: null, unit: null });
});

const LIFT_UP = [
  'Date,Workout Name,Exercise Name,Set Order,Weight,Weight Unit,Reps,RPE,RIR,Rest Time,Distance,Bodyweight,Notes,Set Type',
  '2025-03-05 18:00,Push,Bench Press,2,82.5,kg,6,8,2,120,,80,"felt good, strong",Normal',
  '2025-03-05 18:00,Push,Bench Press,1,80,kg,8,7,3,120,,80,,Normal',
  '2025-03-05 18:00,Push,Bench Press,0,40,kg,10,,,60,,80,,Warmup',
  '2025-03-05 18:00,Push,"Dumbbell Press, Incline",1,60,lbs,10,,,,,,,Normal',
  '2025-03-05 18:00,Push,Treadmill,1,,,,,,,2.5,,,Normal',
  '2025-03-01 10:00,Legs,Squat,1,100,kg,5,,,,,,,Normal',
  '2025-03-01 10:00,Legs,Squat,2,100,kg,5,,,,,,,Normal',
  '',
].join('\r\n');

test('parseLiftCsv: keeps only weight sets, chronological, set order, units → kg', () => {
  const res = parseLiftCsv(LIFT_UP);
  assert.deepEqual(
    res.sessions.map((s) => s.date),
    ['2025-03-01', '2025-03-05']
  );
  const push = res.sessions[1];
  assert.equal(push.workoutName, 'Push');
  assert.deepEqual(
    push.exercises.map((e) => e.name),
    ['Bench Press', 'Dumbbell Press, Incline']
  );
  assert.deepEqual(push.exercises[0].sets, [
    { weight: 80, reps: 8, spotted: false, rir: 3 },
    { weight: 82.5, reps: 6, spotted: false, rir: 2 },
  ]);
  assert.equal(push.exercises[1].sets[0].weight, 27.2155);
  assert.equal(res.setCount, 5);
  assert.deepEqual(res.skipped, { warmup: 1, noReps: 1, badDate: 0, noExercise: 0 });
  // No unsupported fields leak into sets.
  for (const s of res.sessions) for (const e of s.exercises) for (const set of e.sets) {
    assert.deepEqual(Object.keys(set).sort().filter((k) => k !== 'rir'), ['reps', 'spotted', 'weight']);
  }
});

test('parseLiftCsv: clean errors for bad files', () => {
  assert.throws(() => parseLiftCsv(''), CsvImportError);
  assert.throws(() => parseLiftCsv('{"state":{}}'), /JSON/);
  assert.throws(() => parseLiftCsv('foo,bar\n1,2\n'), /missing the Date, Exercise, Weight or Reps columns/);
  assert.throws(() => parseLiftCsv('Date,Exercise,Reps\n2025-01-01,Run,\n'), /No weight sets/);
  assert.throws(() => parseLiftCsv('\u0000\u0001PK'), CsvImportError);
});

test('mergeImportedSessions: links by name, keeps existing history, idempotent', () => {
  const state = normalizeState({
    split: {},
    goals: [],
    workouts: { Push: [{ id: 'bp', name: 'bench press', defaultSets: 3 }] },
    logs: {
      '2025-03-05': { category: 'Push', exercises: [{ exerciseId: 'bp', name: 'bench press', sets: [{ weight: 70, reps: 5, spotted: false }] }] },
    },
  });
  const { sessions } = parseLiftCsv(LIFT_UP);
  const r1 = mergeImportedSessions(state, sessions);
  assert.equal(r1.workouts, 2);
  assert.equal(r1.duplicateSets, 2); // bench already logged on 03-05: left alone
  assert.equal(state.logs['2025-03-05'].exercises[0].sets[0].weight, 70);
  assert.equal(state.logs['2025-03-05'].exercises.length, 2);
  assert.equal(state.logs['2025-03-01'].category, 'Legs');
  assert.equal(state.logs['2025-03-01'].exercises[0].sets.length, 2);
  // Survives normalizeState (what persistence runs on load).
  assert.deepEqual(normalizeState(state).logs, state.logs);
  const r2 = mergeImportedSessions(state, sessions);
  assert.equal(r2.sets, 0);
});
