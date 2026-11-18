import test from 'node:test';
import assert from 'node:assert/strict';
import { allExercises, bestWeights, goalProgress, lastSessions, mergeExercises } from '../src/lib/history.js';
import { classifyExercise, computeRanks, searchLibrary, EXERCISE_LIBRARY } from '../src/lib/rankingEngine.js';
import { normalizeState } from '../src/lib/storage.js';
import {
  addWater,
  copyEntries,
  normalizeNutrition,
  normalizePer100,
  recipeToFood,
  sumMicros,
  waterOn,
} from '../src/lib/nutritionStore.js';
import { normalizeProduct } from '../src/lib/openFoodFactsService.js';

const set = (weight, reps, extra = {}) => ({ weight, reps, spotted: false, ...extra });
const makeState = () => ({
  split: {},
  goals: [],
  workouts: {
    Push: [
      { id: 'a', name: 'Flat Barbell Bench', defaultSets: 3 },
      { id: 'b', name: 'Bench', defaultSets: 3 },
    ],
  },
  logs: {
    '2026-11-01': { category: 'Push', exercises: [{ exerciseId: 'b', name: 'Bench', sets: [set(60, 10), set(60, 8)] }] },
    '2026-11-03': {
      category: 'Push',
      exercises: [
        { exerciseId: 'a', name: 'Flat Barbell Bench', sets: [set(70, 5), set(null, null)] },
        { exerciseId: 'b', name: 'Bench', sets: [set(65, 6)] },
      ],
    },
    '2026-11-05': { category: 'Push', exercises: [{ exerciseId: 'a', name: 'Flat Barbell Bench', sets: [set(null, null)] }] },
  },
});

test('lastSessions finds the latest earlier session that has reps', () => {
  const s = makeState();
  const last = lastSessions(s.logs, '2026-11-05');
  assert.equal(last.get('a').date, '2026-11-03');
  assert.deepEqual(last.get('a').sets.map((x) => [x.weight, x.reps]), [[70, 5]]);
  assert.equal(lastSessions(s.logs, '2026-11-03').get('b').date, '2026-11-01');
  assert.equal(lastSessions(s.logs, '2026-11-01').size, 0);
});

test('mergeExercises moves history, joins same-day sets and drops the old routine entry', () => {
  const s = makeState();
  const moved = mergeExercises(s, 'b', 'a');
  assert.equal(moved, 2);
  assert.deepEqual(s.workouts.Push.map((e) => e.id), ['a']);
  assert.equal(s.logs['2026-11-01'].exercises[0].exerciseId, 'a');
  assert.equal(s.logs['2026-11-01'].exercises[0].name, 'Flat Barbell Bench');
  const day = s.logs['2026-11-03'].exercises;
  assert.equal(day.length, 1);
  assert.deepEqual(day[0].sets.map((x) => x.weight), [70, 65]);
  assert.equal(allExercises(s).find((e) => e.id === 'a').sessions, 2);
  assert.equal(mergeExercises(s, 'a', 'a'), 0);
});

test('bestWeights and goalProgress track a goal from the logs', () => {
  const s = makeState();
  const bests = bestWeights(s);
  assert.equal(bests.get('flat barbell bench'), 70);
  const p = goalProgress({ exercise: 'Flat Barbell Bench', startPR: 60, currentPR: 60, targetPR: 80, achieved: false }, bests);
  assert.equal(p.current, 70);
  assert.equal(p.pct, 0.5);
  assert.equal(p.reached, false);
  assert.equal(goalProgress({ exercise: 'Bench', startPR: 50, currentPR: 50, targetPR: 65, achieved: false }, bests).reached, true);
});

test('unrecognised exercises get no muscle unless one is chosen', () => {
  assert.equal(classifyExercise('Zottman Thing').muscle, null);
  assert.equal(classifyExercise('Zottman Thing', 'Pull').muscle, 'back');
  assert.equal(classifyExercise('Zottman Thing', '', 'biceps').muscle, 'biceps');
  assert.equal(classifyExercise('Flat Barbell Bench', '', 'triceps').patternId, 'bench');
  assert.equal(classifyExercise('Flat Barbell Bench', '', 'nonsense').muscle, 'chest');

  const state = {
    workouts: { Misc: [{ id: 'z', name: 'Zottman Thing', defaultSets: 3 }] },
    logs: { '2026-11-01': { category: 'Misc', exercises: [{ exerciseId: 'z', name: 'Zottman Thing', sets: [set(40, 8)] }] } },
  };
  const profile = { bodyweight: 80, sex: 'male', unit: 'kg', bodyweightHistory: [] };
  const auto = computeRanks(state, profile);
  assert.equal(auto.exercises.length, 1);
  assert.equal(auto.overall.rankedMuscles, 0);
  state.workouts.Misc[0].muscle = 'biceps';
  assert.ok(computeRanks(state, profile).muscles.biceps.score > 0);
});

test('RIR raises the estimate and survives normalising', () => {
  const profile = { bodyweight: 80, sex: 'male', unit: 'kg', bodyweightHistory: [] };
  const mk = (extra) => ({
    split: {},
    goals: [],
    workouts: { Push: [{ id: 'a', name: 'Flat Barbell Bench', defaultSets: 3, muscle: 'chest' }] },
    logs: { '2026-11-01': { category: 'Push', exercises: [{ exerciseId: 'a', name: 'Flat Barbell Bench', sets: [set(80, 5, extra)] }] } },
  });
  const plain = computeRanks(normalizeState(mk({})), profile).exercises[0].score;
  const withRir = normalizeState(mk({ rir: 2 }));
  assert.equal(withRir.logs['2026-11-01'].exercises[0].sets[0].rir, 2);
  assert.equal(withRir.workouts.Push[0].muscle, 'chest');
  assert.ok(computeRanks(withRir, profile).exercises[0].score > plain);
  assert.equal('rir' in normalizeState(mk({ rir: 99 })).logs['2026-11-01'].exercises[0].sets[0], false);
});

test('exercise library is searchable by name and muscle', () => {
  assert.ok(EXERCISE_LIBRARY.length > 50);
  assert.ok(searchLibrary('bench').some((e) => e.name === 'Barbell Bench Press'));
  assert.ok(searchLibrary('', 'calves').every((e) => e.muscle === 'calves'));
  assert.equal(searchLibrary('zzzz').length, 0);
});

const entry = (id, grams, per100g) => ({ id, foodId: id, name: id, brand: '', unit: 'g', grams, per100g });

test('micronutrients are optional and totals count what is known', () => {
  assert.deepEqual(normalizePer100({ calories: 100, protein: 1, carbs: 2, fat: 3 }), { calories: 100, protein: 1, carbs: 2, fat: 3 });
  assert.equal(normalizePer100({ calories: 100, fibre: 4, sodium: 200 }).fibre, 4);
  const m = sumMicros([
    entry('a', 200, { calories: 100, protein: 0, carbs: 0, fat: 0, fibre: 5, sugar: 10, sodium: 300 }),
    entry('b', 100, { calories: 100, protein: 0, carbs: 0, fat: 0 }),
  ]);
  assert.equal(m.fibre, 10);
  assert.equal(m.sodium, 600);
  assert.equal(m.known.fibre, 1);
  assert.equal(m.count, 2);
});

test('Open Food Facts fibre, sugar and salt are read', () => {
  const food = normalizeProduct({ code: '5000000000005', product_name: 'X', nutriments: { 'energy-kcal_100g': 400, fiber_100g: 6.2, sugars_100g: 20, salt_100g: 1.25 } });
  assert.equal(food.per100g.fibre, 6.2);
  assert.equal(food.per100g.sugar, 20);
  assert.equal(food.per100g.sodium, 500);
  assert.equal('fibre' in normalizeProduct({ code: '5000000000005', nutriments: { 'energy-kcal_100g': 400 } }).per100g, false);
});

test('a recipe logs as one food with a per-serving portion', () => {
  const recipe = {
    id: 'r1',
    name: 'Chilli',
    servings: 4,
    items: [entry('mince', 500, { calories: 200, protein: 20, carbs: 0, fat: 13, fibre: 0 }), entry('beans', 300, { calories: 100, protein: 7, carbs: 13, fat: 1 })],
  };
  const food = recipeToFood(recipe);
  assert.equal(food.servings[0].grams, 200);
  assert.equal(food.per100g.calories, 162.5);
  assert.equal('fibre' in food.per100g, false); // beans have no fibre value
  const n = normalizeNutrition({ meals: [recipe, { id: 'p', name: 'Preset', items: recipe.items }] });
  assert.equal(n.meals[0].servings, 4);
  assert.equal('servings' in n.meals[1], false);
});

test('copyEntries copies a meal or a day and keeps what is there', () => {
  let i = 0;
  const newId = () => `n${++i}`;
  const n = normalizeNutrition({
    days: {
      '2026-11-10': { breakfast: [entry('oats', 80, { calories: 370, protein: 13, carbs: 60, fat: 7 })], lunch: [entry('rice', 200, { calories: 130, protein: 3, carbs: 28, fat: 0 })] },
      '2026-11-11': { lunch: [entry('soup', 300, { calories: 40, protein: 2, carbs: 5, fat: 1 })] },
    },
  });
  assert.equal(copyEntries(n, { fromDate: '2026-11-10', toDate: '2026-11-11', newId }), 2);
  assert.equal(n.days['2026-11-11'].lunch.length, 2);
  assert.equal(n.days['2026-11-11'].breakfast[0].id, 'n1');
  assert.equal(copyEntries(n, { fromDate: '2026-11-10', toDate: '2026-11-12', fromMeal: 'breakfast', toMeal: 'snacks', newId }), 1);
  assert.equal(n.days['2026-11-12'].snacks[0].name, 'oats');
  assert.equal(copyEntries(n, { fromDate: '2026-01-01', toDate: '2026-11-12', newId }), 0);
});

test('water is tracked per day and survives normalising', () => {
  const n = normalizeNutrition({});
  assert.equal(n.waterGoal, 2500);
  addWater(n, '2026-11-10', 500);
  addWater(n, '2026-11-10', 250);
  assert.equal(waterOn(n, '2026-11-10'), 750);
  addWater(n, '2026-11-10', -1000);
  assert.equal(waterOn(n, '2026-11-10'), 0);
  assert.equal('2026-11-10' in n.water, false);
  assert.equal(normalizeNutrition({ water: { '2026-11-10': 900, bad: 5 }, waterGoal: 3000 }).water['2026-11-10'], 900);
});
