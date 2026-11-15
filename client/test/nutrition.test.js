import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, FOODS, FOOD_BY_ID } from '../src/lib/foodDatabase.js';
import {
  barcodeVariants,
  computeAutoTargets,
  dayTotals,
  foodUsage,
  isValidGtin,
  macrosFor,
  maintenanceCalories,
  makeEntry,
  normalizeNutrition,
  recentFoods,
  resolveTargets,
  searchFoods,
} from '../src/lib/nutritionStore.js';
import { createRateLimiter, extractKcal, lookupBarcode, normalizeProduct, searchProducts } from '../src/lib/openFoodFactsService.js';
import { normalizeProfile } from '../src/lib/lifterProfileStore.js';
import { normalizeState } from '../src/lib/storage.js';

/* ---------------------------------------------------------------- database */

test('Database: 300+ foods with unique ids and valid schema', () => {
  assert.ok(FOODS.length >= 300, `only ${FOODS.length} foods`);
  assert.equal(new Set(FOODS.map((f) => f.id)).size, FOODS.length);
  for (const f of FOODS) {
    assert.ok(CATEGORIES.includes(f.category), `${f.id} category`);
    assert.ok(['g', 'ml'].includes(f.unit));
    for (const k of ['calories', 'protein', 'carbs', 'fat']) assert.ok(f.per100g[k] >= 0, `${f.id}.${k}`);
    assert.equal(f.servings[0].grams, 100);
    assert.ok(f.servings.every((s) => s.grams > 0 && s.label));
  }
});

test('Database: kcal agree with 4/4/9 macros (fibre tolerance) for every non-alcoholic food', () => {
  for (const f of FOODS.filter((x) => !x.alcohol)) {
    const { calories, protein, carbs, fat } = f.per100g;
    const est = protein * 4 + carbs * 4 + fat * 9;
    assert.ok(Math.abs(calories - est) <= Math.max(25, calories * 0.2), `${f.id}: ${calories} vs ${est.toFixed(0)}`);
  }
});

test('Database: spot-check the spec example', () => {
  const c = FOOD_BY_ID.get('chicken-breast-cooked');
  assert.deepEqual(c.per100g, { calories: 165, protein: 31, carbs: 0, fat: 3.6 });
  assert.ok(c.servings.some((s) => s.grams === 175));
  assert.equal(FOOD_BY_ID.get('milk-semi').unit, 'ml');
});

/* ---------------------------------------------------------------- macro math */

test('macrosFor scales per-100 values linearly', () => {
  const m = macrosFor({ calories: 165, protein: 31, carbs: 0, fat: 3.6 }, 175);
  assert.equal(Math.round(m.calories), 289);
  assert.equal(Math.round(m.protein * 10) / 10, 54.3);
  assert.equal(Math.round(m.fat * 100) / 100, 6.3);
  assert.deepEqual(macrosFor({ calories: 100 }, 0), { calories: 0, protein: 0, carbs: 0, fat: 0 });
});

test('dayTotals sums every meal', () => {
  const oats = makeEntry(FOOD_BY_ID.get('rolled-oats'), 80, 'a');
  const whey = makeEntry(FOOD_BY_ID.get('whey-isolate'), 30, 'b');
  const t = dayTotals({ breakfast: [oats], lunch: [], dinner: [], snacks: [whey] });
  assert.equal(Math.round(t.calories), Math.round(374 * 0.8 + 372 * 0.3));
  assert.equal(Math.round(t.protein * 10) / 10, Math.round((13.5 * 0.8 + 87 * 0.3) * 10) / 10);
});

/* ---------------------------------------------------------------- targets */

test('Maintenance: 33 kcal/kg male, 30 kcal/kg female, scaled by activity', () => {
  assert.equal(maintenanceCalories(80, 'male'), 2640);
  assert.equal(maintenanceCalories(60, 'female'), 1800);
  assert.equal(maintenanceCalories(80, 'male', 1.1), 2904);
  assert.equal(maintenanceCalories(null, 'male'), null);
});

test('Targets: Cut / Maintain / Bulk for an 80 kg male', () => {
  const cut = computeAutoTargets({ bodyweightKg: 80, sex: 'male', goal: 'cut' });
  assert.deepEqual(cut, { calories: 2240, protein: 176, fat: 64, carbs: Math.round((2240 - 176 * 4 - 64 * 9) / 4), maintenance: 2640 });

  const maintain = computeAutoTargets({ bodyweightKg: 80, sex: 'male', goal: 'maintain' });
  assert.equal(maintain.calories, 2640);
  assert.equal(maintain.protein, 160);
  assert.equal(maintain.fat, 72);
  assert.equal(maintain.carbs, Math.round((2640 - 640 - 648) / 4));

  const bulk = computeAutoTargets({ bodyweightKg: 80, sex: 'male', goal: 'bulk' });
  assert.equal(bulk.calories, 2940);
  assert.equal(bulk.carbs, Math.round((2940 - 640 - 648) / 4));
});

test('Targets: macro calories add up to the calorie target (±rounding)', () => {
  for (const goal of ['cut', 'maintain', 'bulk']) {
    for (const [kg, sex] of [[55, 'female'], [72.5, 'female'], [80, 'male'], [104, 'male']]) {
      const t = computeAutoTargets({ bodyweightKg: kg, sex, goal });
      assert.ok(Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.calories) <= 4, `${goal} ${kg}${sex}`);
    }
  }
});

test('Targets: carbs never go negative', () => {
  const t = computeAutoTargets({ bodyweightKg: 40, sex: 'female', goal: 'cut', activity: 0.7 });
  assert.equal(t.carbs, 0);
});

test('resolveTargets follows profile bodyweight and applies manual overrides', () => {
  const n = normalizeNutrition({ goal: 'cut' });
  const p80 = normalizeProfile({ bodyweight: 80, sex: 'male' });
  const p90 = normalizeProfile({ bodyweight: 90, sex: 'male' });
  assert.equal(resolveTargets(n, p80).calories, 2240);
  assert.equal(resolveTargets(n, p90).calories, 90 * 33 - 400); // recalculates on bodyweight change
  assert.equal(resolveTargets(n, p80).source, 'auto');

  const over = normalizeNutrition({ goal: 'cut', manual: { protein: 200 } });
  const r = resolveTargets(over, p80);
  assert.equal(r.protein, 200);
  assert.equal(r.calories, 2240);
  assert.equal(r.source, 'mixed');
});

test('resolveTargets: no bodyweight → null unless all four manual targets exist', () => {
  const none = normalizeProfile({});
  assert.equal(resolveTargets(normalizeNutrition({}), none), null);
  assert.equal(resolveTargets(normalizeNutrition({ manual: { calories: 2000 } }), none), null);
  const full = resolveTargets(normalizeNutrition({ manual: { calories: 2000, protein: 150, carbs: 200, fat: 60 } }), none);
  assert.equal(full.source, 'manual');
  assert.equal(full.carbs, 200);
});

/* ---------------------------------------------------------------- normalisation */

test('normalizeNutrition drops junk and keeps valid entries', () => {
  const n = normalizeNutrition({
    days: {
      '2026-11-15': { breakfast: [{ id: 'e1', foodId: 'banana', name: 'Banana', grams: 118, per100g: { calories: 89 } }, { id: 'bad', grams: 0 }], lunch: 'x' },
      'not-a-date': { breakfast: [] },
      '2026-11-14': { breakfast: [] },
    },
    goal: 'shred',
    activity: 9,
    manual: { calories: '2000', protein: 180.4 },
  });
  assert.deepEqual(Object.keys(n.days), ['2026-11-15']);
  assert.equal(n.days['2026-11-15'].breakfast.length, 1);
  assert.deepEqual(n.days['2026-11-15'].lunch, []);
  assert.equal(n.days['2026-11-15'].breakfast[0].per100g.protein, 0);
  assert.equal(n.goal, 'maintain');
  assert.equal(n.activity, 1);
  assert.deepEqual(n.manual, { calories: null, protein: 180, carbs: null, fat: null });
});

test('normalizeState keeps nutrition and older states get an empty diary', () => {
  const base = { split: {}, workouts: {}, logs: {}, goals: [] };
  assert.deepEqual(normalizeState(base).nutrition.days, {});
  const s = normalizeState({ ...base, nutrition: { goal: 'bulk' } });
  assert.equal(s.nutrition.goal, 'bulk');
});

/* ---------------------------------------------------------------- search & ranking */

test('Search: prefix, multi-word, typo and keyword matches', () => {
  assert.equal(searchFoods(FOODS, 'chicken breast')[0].id.startsWith('chicken-breast'), true);
  assert.ok(searchFoods(FOODS, 'bananna').some((f) => f.id === 'banana'), 'typo tolerant');
  assert.ok(searchFoods(FOODS, 'yoghurt').some((f) => f.id === 'greek-yogurt-0'), 'keyword alias');
  assert.ok(searchFoods(FOODS, 'mince 5%').some((f) => f.id === 'beef-mince-5'));
  assert.ok(searchFoods(FOODS, 'creme fraiche').some((f) => f.id === 'creme-fraiche'), 'accent-insensitive');
  assert.equal(searchFoods(FOODS, 'xyzzyq').length, 0);
});

test('Search: frequently / recently logged foods rank first', () => {
  const nutrition = normalizeNutrition({
    days: {
      '2026-11-13': { breakfast: [{ id: 'a', foodId: 'skyr-flavoured', name: 'Skyr', grams: 150, per100g: {} }] },
      '2026-11-14': { breakfast: [{ id: 'b', foodId: 'skyr-flavoured', name: 'Skyr', grams: 150, per100g: {} }] },
    },
  });
  const usage = foodUsage(nutrition);
  const plain = searchFoods(FOODS, 'skyr');
  const ranked = searchFoods(FOODS, 'skyr', { usage, today: '2026-11-15' });
  assert.equal(plain[0].id, 'skyr-plain');
  assert.equal(ranked[0].id, 'skyr-flavoured');
});

test('recentFoods returns snapshots for foods not in the catalog', () => {
  const nutrition = normalizeNutrition({
    days: { '2026-11-14': { snacks: [{ id: 'x', foodId: 'off-123', name: 'Bar', grams: 60, per100g: { calories: 400 } }] } },
  });
  const r = recentFoods(foodUsage(nutrition), FOOD_BY_ID);
  assert.equal(r[0].name, 'Bar');
  assert.equal(r[0].per100g.calories, 400);
});

/* ---------------------------------------------------------------- barcodes */

test('GTIN check digits and UPC/EAN variants', () => {
  assert.equal(isValidGtin('3017620422003'), true);
  assert.equal(isValidGtin('3017620422004'), false);
  assert.equal(isValidGtin('96385074'), true);
  assert.equal(isValidGtin('036000291452'), true);
  assert.deepEqual(barcodeVariants('036000291452'), ['036000291452', '0036000291452']);
});

/* ---------------------------------------------------------------- Open Food Facts */

test('OFF: kcal from energy-kcal_100g, else converted from kJ', () => {
  assert.equal(extractKcal({ 'energy-kcal_100g': 539, 'energy-kj_100g': 2252 }), 539);
  assert.equal(extractKcal({ 'energy-kj_100g': 2252 }), Math.round(2252 / 4.184));
  assert.equal(extractKcal({ energy_100g: 1000 }), 239); // bare energy is kJ, never kcal
  assert.equal(extractKcal({}), null);
});

test('OFF: normalizeProduct maps macros, defaults missing ones to 0 and adds a serving', () => {
  const f = normalizeProduct({
    code: '5000000000000',
    product_name: '',
    product_name_en: 'Protein Bar',
    brands: 'Acme, Other',
    serving_size: '60 g',
    serving_quantity: 60,
    nutriments: { 'energy-kj_100g': 1500, proteins_100g: 33.33 },
  });
  assert.equal(f.name, 'Protein Bar');
  assert.equal(f.brand, 'Acme');
  assert.equal(f.per100g.calories, 359);
  assert.equal(f.per100g.protein, 33.3);
  assert.equal(f.per100g.carbs, 0);
  assert.deepEqual(f.servings.map((s) => s.grams), [100, 60]);
  assert.equal(f.unit, 'g');
  assert.equal(normalizeProduct({ code: '1', nutriments: {} }), null);
  assert.equal(normalizeProduct({ code: '1', serving_size: '250 ml', nutriments: { 'energy-kcal_100g': 40 } }).unit, 'ml');
});

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
const jsonRes = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

test('OFF lookup: status 0 → not-found; status 1 → found and cached for the next scan', async () => {
  const storage = memStorage();
  let calls = 0;
  const missing = await lookupBarcode('4006381333931', {
    storage,
    fetchImpl: async () => {
      calls++;
      return jsonRes({ status: 0, status_verbose: 'product not found' });
    },
  });
  assert.equal(missing.status, 'not-found');

  const product = { code: '3017620422003', product_name: 'Nutella', brands: 'Ferrero', nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 } };
  const fetchImpl = async () => {
    calls++;
    return jsonRes({ status: 1, product });
  };
  const first = await lookupBarcode('3017620422003', { storage, fetchImpl });
  assert.equal(first.status, 'found');
  assert.equal(first.cached, false);
  assert.equal(first.food.per100g.calories, 539);
  const before = calls;
  const second = await lookupBarcode('3017620422003', { storage, fetchImpl });
  assert.equal(second.cached, true);
  assert.equal(calls, before, 'served from cache without a request');
});

test('OFF lookup: HTTP 404 with status 0 is a normal not-found, not an error', async () => {
  const res = await lookupBarcode('5999999999990', { storage: memStorage(), fetchImpl: async () => jsonRes({ status: 0 }, false, 404) });
  assert.equal(res.status, 'not-found');
  assert.equal(res.barcode, '5999999999990');
});

test('OFF lookup: network failure rejects with an offline error', async () => {
  await assert.rejects(
    lookupBarcode('3017620422003', { storage: memStorage(), fetchImpl: async () => { throw new TypeError('fetch failed'); } }),
    (e) => e.code === 'offline'
  );
});

test('OFF search: respects the 10 requests/minute limiter', async () => {
  let t = 0;
  const limiter = createRateLimiter(10, 60000, () => t);
  const fetchImpl = async () => jsonRes({ products: [{ code: '1', product_name: 'A', nutriments: { 'energy-kcal_100g': 10 } }] });
  for (let i = 0; i < 10; i++) assert.equal((await searchProducts('skyr', { fetchImpl, limiter })).length, 1);
  await assert.rejects(searchProducts('skyr', { fetchImpl, limiter }), (e) => e.code === 'rate-limit');
  t = 60001;
  assert.equal((await searchProducts('skyr', { fetchImpl, limiter })).length, 1);
});
