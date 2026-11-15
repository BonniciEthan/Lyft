/**
 * Nutrition diary: daily food logs, custom foods, saved meal presets and macro targets.
 *
 * Lives on the main app state as `state.nutrition`, so it is persisted to localStorage
 * with everything else and travels with Save / Load to the server.
 *
 *   nutrition = {
 *     days:  { 'YYYY-MM-DD': { breakfast: Entry[], lunch: Entry[], dinner: Entry[], snacks: Entry[] } },
 *     foods: Food[]            // user-created foods (optionally with a barcode)
 *     meals: MealPreset[]      // saved multi-item meals
 *     goal: 'cut' | 'maintain' | 'bulk',
 *     activity: number,        // maintenance multiplier
 *     manual: { calories, protein, carbs, fat }  // per-field overrides (null = automatic)
 *   }
 *   Entry = { id, foodId, name, brand, unit: 'g'|'ml', grams, per100g: {calories, protein, carbs, fat}, barcode? }
 *
 * Entries keep a snapshot of the food's values so history never changes when a custom
 * food is edited or a barcode product is updated upstream.
 *
 * Pure module (no React, no browser globals) so it can be unit tested with node:test.
 */

import { hasBodyweight } from './lifterProfileStore.js';

export const MEALS = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snacks', label: 'Snacks' },
];
export const MEAL_IDS = MEALS.map((m) => m.id);

export const GOALS = {
  cut: { label: 'Cut', kcalDelta: -400, proteinPerKg: 2.2, fatPerKg: 0.8 },
  maintain: { label: 'Maintain', kcalDelta: 0, proteinPerKg: 2.0, fatPerKg: 0.9 },
  bulk: { label: 'Bulk', kcalDelta: 300, proteinPerKg: 2.0, fatPerKg: 0.9 },
};

/** Maintenance kcal per kg of bodyweight before the activity multiplier. */
export const KCAL_PER_KG = { male: 33, female: 30 };

export const ACTIVITY_LEVELS = [
  { value: 0.9, label: 'Light' },
  { value: 1, label: 'Moderate' },
  { value: 1.1, label: 'Active' },
  { value: 1.2, label: 'Very active' },
];

export const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fat'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const nonNeg = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const round1 = (n) => Math.round(n * 10) / 10;

export function createDefaultNutrition() {
  return {
    days: {},
    foods: [],
    meals: [],
    goal: 'maintain',
    activity: 1,
    manual: { calories: null, protein: null, carbs: null, fat: null },
  };
}

export function normalizePer100(raw) {
  const p = isObj(raw) ? raw : {};
  return {
    calories: nonNeg(p.calories) ?? 0,
    protein: nonNeg(p.protein) ?? 0,
    carbs: nonNeg(p.carbs) ?? 0,
    fat: nonNeg(p.fat) ?? 0,
  };
}

function normalizeEntry(e) {
  if (!isObj(e) || typeof e.id !== 'string') return null;
  const grams = nonNeg(e.grams);
  if (!grams) return null;
  const out = {
    id: e.id,
    foodId: str(e.foodId),
    name: str(e.name, 'Food'),
    brand: str(e.brand),
    unit: e.unit === 'ml' ? 'ml' : 'g',
    grams,
    per100g: normalizePer100(e.per100g),
  };
  if (typeof e.barcode === 'string' && e.barcode) out.barcode = e.barcode;
  return out;
}

function normalizeServings(list, unit) {
  const out = (Array.isArray(list) ? list : [])
    .filter((s) => isObj(s) && typeof s.label === 'string' && nonNeg(s.grams))
    .map((s) => ({ label: s.label, grams: s.grams }));
  if (!out.some((s) => s.grams === 100)) out.unshift({ label: `100${unit}`, grams: 100 });
  return out;
}

export function normalizeFood(f) {
  if (!isObj(f) || typeof f.id !== 'string') return null;
  const unit = f.unit === 'ml' ? 'ml' : 'g';
  const out = {
    id: f.id,
    name: str(f.name, 'Custom food').trim() || 'Custom food',
    brand: str(f.brand),
    category: 'Custom',
    unit,
    per100g: normalizePer100(f.per100g),
    servings: normalizeServings(f.servings, unit),
    source: 'custom',
  };
  if (typeof f.barcode === 'string' && f.barcode) out.barcode = f.barcode;
  return out;
}

/** Coerce anything into a valid nutrition object. */
export function normalizeNutrition(raw) {
  const n = createDefaultNutrition();
  if (!isObj(raw)) return n;

  if (isObj(raw.days)) {
    for (const [date, day] of Object.entries(raw.days)) {
      if (!DATE_RE.test(date) || !isObj(day)) continue;
      const clean = {};
      let any = false;
      for (const meal of MEAL_IDS) {
        clean[meal] = (Array.isArray(day[meal]) ? day[meal] : []).map(normalizeEntry).filter(Boolean);
        if (clean[meal].length) any = true;
      }
      if (any) n.days[date] = clean;
    }
  }
  n.foods = (Array.isArray(raw.foods) ? raw.foods : []).map(normalizeFood).filter(Boolean);
  n.meals = (Array.isArray(raw.meals) ? raw.meals : [])
    .filter((m) => isObj(m) && typeof m.id === 'string')
    .map((m) => ({
      id: m.id,
      name: str(m.name, 'Meal').trim() || 'Meal',
      items: (Array.isArray(m.items) ? m.items : []).map(normalizeEntry).filter(Boolean),
    }))
    .filter((m) => m.items.length);

  if (GOALS[raw.goal]) n.goal = raw.goal;
  if (typeof raw.activity === 'number' && raw.activity >= 0.7 && raw.activity <= 1.6) n.activity = raw.activity;
  if (isObj(raw.manual)) {
    for (const k of MACRO_KEYS) {
      const v = nonNeg(raw.manual[k]);
      n.manual[k] = v === null ? null : Math.round(v);
    }
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Macro math                                                           */
/* ------------------------------------------------------------------ */

/** Macros for `grams` of a food given its per-100 values. */
export function macrosFor(per100g, grams) {
  const p = normalizePer100(per100g);
  const f = (nonNeg(grams) ?? 0) / 100;
  return {
    calories: p.calories * f,
    protein: p.protein * f,
    carbs: p.carbs * f,
    fat: p.fat * f,
  };
}

export const entryMacros = (entry) => macrosFor(entry.per100g, entry.grams);

export function sumMacros(entries) {
  const t = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const e of entries || []) {
    const m = entryMacros(e);
    for (const k of MACRO_KEYS) t[k] += m[k];
  }
  return t;
}

export function emptyDay() {
  return Object.fromEntries(MEAL_IDS.map((m) => [m, []]));
}

export function getDay(nutrition, date) {
  return nutrition?.days?.[date] || emptyDay();
}

export function dayEntries(day) {
  return MEAL_IDS.flatMap((m) => day?.[m] || []);
}

export function dayTotals(day) {
  return sumMacros(dayEntries(day));
}

/* ------------------------------------------------------------------ */
/* Targets                                                              */
/* ------------------------------------------------------------------ */

/** Maintenance kcal from bodyweight (kg), sex and activity multiplier. */
export function maintenanceCalories(bodyweightKg, sex, activity = 1) {
  if (!(bodyweightKg > 0)) return null;
  const perKg = KCAL_PER_KG[sex] ?? KCAL_PER_KG.male;
  return Math.round(bodyweightKg * perKg * activity);
}

/**
 * Automatic targets for a goal. Protein and fat come from bodyweight, carbs fill the
 * remaining calories (never negative).
 */
export function computeAutoTargets({ bodyweightKg, sex, goal = 'maintain', activity = 1 }) {
  const maintenance = maintenanceCalories(bodyweightKg, sex, activity);
  if (maintenance === null) return null;
  const g = GOALS[goal] || GOALS.maintain;
  const calories = maintenance + g.kcalDelta;
  const protein = Math.round(bodyweightKg * g.proteinPerKg);
  const fat = Math.round(bodyweightKg * g.fatPerKg);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, carbs, fat, maintenance };
}

/**
 * Final targets for display: automatic targets from the lifter profile, with any manual
 * overrides applied on top. Returns null when neither a bodyweight nor a full set of
 * manual numbers is available.
 */
export function resolveTargets(nutrition, profile) {
  const n = nutrition || createDefaultNutrition();
  const manual = n.manual || {};
  const auto = hasBodyweight(profile)
    ? computeAutoTargets({ bodyweightKg: profile.bodyweight, sex: profile.sex, goal: n.goal, activity: n.activity })
    : null;
  const overridden = MACRO_KEYS.filter((k) => manual[k] !== null && manual[k] !== undefined);
  if (!auto && overridden.length < MACRO_KEYS.length) return null;
  const out = { source: overridden.length ? (auto ? 'mixed' : 'manual') : 'auto', maintenance: auto?.maintenance ?? null };
  for (const k of MACRO_KEYS) out[k] = overridden.includes(k) ? manual[k] : auto[k];
  out.overridden = overridden;
  return out;
}

/* ------------------------------------------------------------------ */
/* Entries                                                              */
/* ------------------------------------------------------------------ */

/** Build a diary entry (snapshot) from a food and amount. */
export function makeEntry(food, grams, id) {
  const entry = {
    id,
    foodId: food.id,
    name: food.name,
    brand: food.brand || '',
    unit: food.unit === 'ml' ? 'ml' : 'g',
    grams: Math.round(grams * 10) / 10,
    per100g: normalizePer100(food.per100g),
  };
  if (food.barcode) entry.barcode = food.barcode;
  return entry;
}

/** Turn an entry back into a food-like object (for re-logging / editing). */
export function entryToFood(entry) {
  return {
    id: entry.foodId || entry.id,
    name: entry.name,
    brand: entry.brand,
    unit: entry.unit,
    per100g: entry.per100g,
    servings: [{ label: `100${entry.unit}`, grams: 100 }],
    ...(entry.barcode ? { barcode: entry.barcode } : {}),
    source: 'history',
  };
}

/* ------------------------------------------------------------------ */
/* Usage-based ranking                                                  */
/* ------------------------------------------------------------------ */

/**
 * How often and how recently each food was logged. Returns Map foodId → { count, last, entry }.
 * `entry` is the most recent snapshot so foods from other sources can be shown as "Recent".
 */
export function foodUsage(nutrition) {
  const usage = new Map();
  for (const date of Object.keys(nutrition?.days || {}).sort()) {
    for (const e of dayEntries(nutrition.days[date])) {
      const key = e.foodId || e.id;
      const u = usage.get(key) || { count: 0, last: '', entry: e };
      u.count += 1;
      if (date >= u.last) {
        u.last = date;
        u.entry = e;
      }
      usage.set(key, u);
    }
  }
  return usage;
}

/** Usage boost for ranking: frequent and recent foods float up. */
export function usageScore(u, today) {
  if (!u) return 0;
  const daysAgo = today && u.last ? Math.max(0, (Date.parse(today) - Date.parse(u.last)) / 86400000) : 30;
  const recency = Math.max(0, 1 - daysAgo / 60);
  return Math.min(u.count, 20) * 2 + recency * 15;
}

/* ------------------------------------------------------------------ */
/* Search                                                               */
/* ------------------------------------------------------------------ */

export function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

/** Levenshtein distance, early-exit when above `max`. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function tokenScore(q, words) {
  let best = 0;
  for (const w of words) {
    if (w === q) return 10;
    if (w.startsWith(q)) best = Math.max(best, 8);
    else if (q.length >= 3 && w.includes(q)) best = Math.max(best, 5);
    else if (q.length >= 4) {
      const max = q.length >= 7 ? 2 : 1;
      const d = editDistance(q, w.slice(0, Math.max(q.length, Math.min(w.length, q.length + 1))), max);
      if (d <= max) best = Math.max(best, 4 - d);
    }
  }
  return best;
}

/**
 * Score a food against a query. 0 = no match. Every query word must match something
 * (name, brand or keywords), allowing prefixes, substrings and small typos.
 */
export function matchScore(food, query) {
  const q = normalizeText(query);
  if (!q) return 1;
  const name = normalizeText(food.name);
  const words = `${name} ${normalizeText(food.brand)} ${normalizeText(food.keywords)}`.split(' ').filter(Boolean);
  let total = 0;
  for (const token of q.split(' ')) {
    const s = tokenScore(token, words);
    if (!s) return 0;
    total += s;
  }
  if (name.startsWith(q)) total += 12;
  else if (name.includes(q)) total += 6;
  // The base food ("Chicken Breast (Cooked)") beats variants ("Chicken Breast Slices").
  if (normalizeText(String(food.name).split('(')[0]) === q) total += 4;
  // Prefer shorter, more generic names on ties ("Banana" before "Banana Chips").
  return total - name.length / 100;
}

/**
 * Search a list of foods. Results are ranked by match quality plus a usage boost so
 * frequently / recently logged foods float to the top.
 */
export function searchFoods(foods, query, { usage, today, limit = 60 } = {}) {
  const scored = [];
  for (const f of foods) {
    const m = matchScore(f, query);
    if (m <= 0) continue;
    scored.push({ food: f, score: m + usageScore(usage?.get(f.id), today) });
  }
  scored.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name));
  return scored.slice(0, limit).map((s) => s.food);
}

/** Recently logged foods, most recent first (snapshot-backed so any source works). */
export function recentFoods(usage, catalog, limit = 30) {
  return [...usage.entries()]
    .sort(([, a], [, b]) => (a.last < b.last ? 1 : a.last > b.last ? -1 : b.count - a.count))
    .slice(0, limit)
    .map(([id, u]) => catalog.get(id) || entryToFood(u.entry));
}

/* ------------------------------------------------------------------ */
/* Barcodes                                                             */
/* ------------------------------------------------------------------ */

export const cleanBarcode = (code) => String(code ?? '').replace(/\D/g, '');

/** Validate the GS1 check digit (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function isValidGtin(code) {
  const c = cleanBarcode(code);
  if (![8, 12, 13, 14].includes(c.length)) return false;
  const digits = c.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
}

/** Variants of a code to try when looking it up (UPC-A ↔ EAN-13 with leading zero). */
export function barcodeVariants(code) {
  const c = cleanBarcode(code);
  const out = [c];
  if (c.length === 12) out.push(`0${c}`);
  if (c.length === 13 && c.startsWith('0')) out.push(c.slice(1));
  return out;
}

export const formatGrams = (g, unit = 'g') => `${round1(g)}${unit}`;
