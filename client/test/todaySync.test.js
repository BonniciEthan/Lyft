import test from 'node:test';
import assert from 'node:assert/strict';
import { withLogSync } from '../src/lib/splitDays.js';
import { mergeExercises } from '../src/lib/history.js';

const TODAY = '2026-11-21';
const set = (weight, reps) => ({ weight, reps, spotted: false });
const makeState = () => ({
  split: {},
  goals: [],
  workouts: {
    Push: [
      { id: 'a', name: 'Bench', defaultSets: 2 },
      { id: 'b', name: 'OHP', defaultSets: 2 },
    ],
    Chest: [{ id: 'z', name: 'Flat Bench', defaultSets: 3 }],
  },
  logs: {
    '2026-11-14': {
      category: 'Push',
      exercises: [
        { exerciseId: 'a', name: 'Bench', sets: [set(60, 8), set(60, 8)] },
        { exerciseId: 'b', name: 'OHP', sets: [set(40, 8)] },
      ],
    },
    [TODAY]: {
      category: 'Push',
      exercises: [
        { exerciseId: 'a', name: 'Bench', sets: [set(80, 5), set(80, 5)] },
        { exerciseId: 'b', name: 'OHP', sets: [set(50, 6), set(50, 6)] },
      ],
    },
  },
});
const run = (s, fn) => withLogSync(fn, TODAY)(s);

test('A: removing an exercise drops it and its sets from today only', () => {
  const s = makeState();
  run(s, (d) => {
    d.workouts.Push = d.workouts.Push.filter((x) => x.id !== 'a');
  });
  assert.deepEqual(
    s.logs[TODAY].exercises.map((e) => [e.exerciseId, e.sets]),
    [['b', [set(50, 6), set(50, 6)]]]
  );
  // C: history untouched
  assert.equal(s.logs['2026-11-14'].exercises[0].exerciseId, 'a');
  assert.equal(s.logs['2026-11-14'].exercises[0].sets.length, 2);
});

test('B: added exercise appears in My Split order; logged sets preserved', () => {
  const s = makeState();
  run(s, (d) => {
    d.workouts.Push.push({ id: 'c', name: 'Dips', defaultSets: 3 });
  });
  run(s, (d) => {
    const l = d.workouts.Push;
    [l[1], l[2]] = [l[2], l[1]]; // move Dips above OHP
  });
  const ex = s.logs[TODAY].exercises;
  assert.deepEqual(
    ex.map((e) => e.exerciseId),
    ['a', 'c', 'b']
  );
  assert.equal(ex[1].sets.length, 3);
  assert.deepEqual(ex[2].sets, [set(50, 6), set(50, 6)]);
});

test('renames and set counts sync without losing logged sets', () => {
  const s = makeState();
  run(s, (d) => {
    d.workouts.Push[0].name = 'Bench Press';
    d.workouts.Push[0].defaultSets = 3;
    d.workouts.Push[1].defaultSets = 1; // has 2 logged sets: both kept
  });
  const [a, b] = s.logs[TODAY].exercises;
  assert.equal(a.name, 'Bench Press');
  assert.equal(a.sets.length, 3);
  assert.equal(b.sets.length, 2);
});

test('deleting today’s routine removes today’s log, keeps history', () => {
  const s = makeState();
  run(s, (d) => {
    delete d.workouts.Push;
  });
  assert.equal(s.logs[TODAY], undefined);
  assert.ok(s.logs['2026-11-14']);
});

test('merging into an exercise from another routine keeps today’s moved sets', () => {
  const s = makeState();
  run(s, (d) => mergeExercises(d, 'a', 'z'));
  const ids = s.logs[TODAY].exercises.map((e) => e.exerciseId);
  assert.deepEqual(ids, ['b', 'z']);
  assert.deepEqual(s.logs[TODAY].exercises[1].sets, [set(80, 5), set(80, 5)]);
});

test('edits to another routine, or with no log today, change nothing', () => {
  const s = makeState();
  const before = JSON.stringify(s.logs);
  run(s, (d) => {
    d.workouts.Chest = [];
  });
  assert.equal(JSON.stringify(s.logs), before);
  delete s.logs[TODAY];
  run(s, (d) => {
    d.workouts.Push.pop();
  });
  assert.equal(s.logs[TODAY], undefined);
});
