/**
 * Open Food Facts (https://world.openfoodfacts.org): free, open data, no key or account.
 *
 * - Barcode lookup: /api/v2/product/{code}.json
 * - Text search:    /cgi/search.pl (rate limited by OFF to 10 requests / minute)
 *
 * Every product fetched by barcode is cached in localStorage by barcode, so repeat scans
 * resolve instantly and work offline. Network and storage are injectable for tests.
 */

import { barcodeVariants, cleanBarcode } from './nutritionStore.js';

export const OFF_BASE = 'https://world.openfoodfacts.org';
export const OFF_FIELDS = 'code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments';
export const CACHE_KEY = 'lyft_off_barcode_cache_v1';
const CACHE_LIMIT = 500;

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * kcal per 100 g/ml. Uses energy-kcal_100g; if only kJ exists it converts (kJ / 4.184) so
 * kilojoules are never misread as kilocalories. OFF's bare `energy_100g` is always kJ.
 */
export function extractKcal(nutriments) {
  const n = nutriments || {};
  const kcal = num(n['energy-kcal_100g']);
  if (kcal !== null) return Math.round(kcal);
  const kj = num(n['energy-kj_100g']) ?? num(n.energy_100g);
  if (kj !== null) return Math.round(kj / 4.184);
  return null;
}

function detectUnit(product) {
  const s = `${product.serving_size || ''}`.toLowerCase();
  return /\d\s*(ml|cl|l)\b/.test(s) && !/\d\s*g\b/.test(s) ? 'ml' : 'g';
}

/**
 * Normalise a raw OFF product into the app's food shape.
 * Returns null when the product has no usable energy value.
 */
export function normalizeProduct(product, fallbackCode = '') {
  if (!product || typeof product !== 'object') return null;
  const n = product.nutriments || {};
  const calories = extractKcal(n);
  if (calories === null) return null;
  const code = cleanBarcode(product.code || fallbackCode);
  const unit = detectUnit(product);
  const name = String(product.product_name || product.product_name_en || '').trim() || 'Unnamed product';
  const brand = String(product.brands || '').split(',')[0].trim();
  const servings = [{ label: `100${unit}`, grams: 100 }];
  const sq = num(product.serving_quantity);
  if (sq && sq !== 100 && sq < 5000) {
    const label = String(product.serving_size || '').trim();
    servings.push({ label: label ? `1 serving (${label})` : `1 serving (${round1(sq)}${unit})`, grams: round1(sq) });
  }
  return {
    id: `off-${code}`,
    barcode: code,
    name,
    brand,
    category: 'Packaged',
    unit,
    per100g: {
      calories,
      protein: round1(num(n.proteins_100g) ?? 0),
      carbs: round1(num(n.carbohydrates_100g) ?? 0),
      fat: round1(num(n.fat_100g) ?? 0),
    },
    servings,
    source: 'off',
  };
}

/* ------------------------------------------------------------------ */
/* Barcode cache                                                        */
/* ------------------------------------------------------------------ */

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readCache(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function cacheProduct(food, storage = defaultStorage()) {
  if (!food?.barcode || !storage) return;
  try {
    const cache = readCache(storage);
    cache[food.barcode] = { ...food, cachedAt: Date.now() };
    const keys = Object.keys(cache);
    if (keys.length > CACHE_LIMIT) {
      keys
        .sort((a, b) => (cache[a].cachedAt || 0) - (cache[b].cachedAt || 0))
        .slice(0, keys.length - CACHE_LIMIT)
        .forEach((k) => delete cache[k]);
    }
    storage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or blocked: caching is best-effort */
  }
}

export function getCachedProduct(code, storage = defaultStorage()) {
  const cache = readCache(storage);
  for (const v of barcodeVariants(code)) if (cache[v]) return cache[v];
  return null;
}

/** Merge products into the barcode cache (used when importing a backup). */
export function mergeCache(entries, storage = defaultStorage()) {
  if (!storage || !entries || typeof entries !== 'object') return 0;
  try {
    const cache = readCache(storage);
    let added = 0;
    for (const [code, food] of Object.entries(entries)) {
      if (!cache[code]) added++;
      cache[code] = { ...food, cachedAt: food.cachedAt || Date.now() };
    }
    storage.setItem(CACHE_KEY, JSON.stringify(cache));
    return added;
  } catch {
    return 0;
  }
}

export function cachedProducts(storage = defaultStorage()) {
  return Object.values(readCache(storage));
}

/* ------------------------------------------------------------------ */
/* Rate limiting (search only)                                          */
/* ------------------------------------------------------------------ */

export function createRateLimiter(max = 10, windowMs = 60000, now = () => Date.now()) {
  let stamps = [];
  return {
    /** Returns true and records the call if under the limit. */
    tryAcquire() {
      const t = now();
      stamps = stamps.filter((s) => t - s < windowMs);
      if (stamps.length >= max) return false;
      stamps.push(t);
      return true;
    },
    /** ms until the next call is allowed (0 if allowed now). */
    retryIn() {
      const t = now();
      stamps = stamps.filter((s) => t - s < windowMs);
      return stamps.length < max ? 0 : windowMs - (t - stamps[0]);
    },
  };
}

const searchLimiter = createRateLimiter(10, 60000);

export class OffError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code; // 'offline' | 'rate-limit' | 'http' | 'invalid'
  }
}

async function getJson(url, { fetchImpl = globalThis.fetch, signal, timeoutMs = 12000 } = {}) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  const onAbort = () => ctrl?.abort();
  signal?.addEventListener?.('abort', onAbort);
  try {
    const res = await fetchImpl(url, { signal: ctrl?.signal, headers: { Accept: 'application/json' } });
    // Unknown barcodes come back as HTTP 404 with a JSON body of { status: 0 }.
    if (res.status === 404) {
      const body = await res.json().catch(() => null);
      if (body && typeof body === 'object') return body;
    }
    if (!res.ok) throw new OffError(`Open Food Facts returned ${res.status}`, res.status === 429 ? 'rate-limit' : 'http');
    return await res.json();
  } catch (err) {
    if (err instanceof OffError) throw err;
    if (signal?.aborted) throw err;
    throw new OffError('Could not reach Open Food Facts', 'offline');
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }
}

/**
 * Look up a barcode: local cache first, then Open Food Facts.
 * Resolves to { status: 'found', food, cached } or { status: 'not-found', barcode }.
 * Rejects with OffError('offline' | 'http') when the network fails.
 */
export async function lookupBarcode(code, { fetchImpl, storage = defaultStorage(), signal } = {}) {
  const barcode = cleanBarcode(code);
  if (barcode.length < 6 || barcode.length > 14) throw new OffError('Not a valid barcode number', 'invalid');

  const hit = getCachedProduct(barcode, storage);
  if (hit) return { status: 'found', food: hit, cached: true };

  let rawFound = null;
  for (const variant of barcodeVariants(barcode)) {
    const data = await getJson(`${OFF_BASE}/api/v2/product/${variant}.json?fields=${OFF_FIELDS}`, { fetchImpl, signal });
    // OFF returns HTTP 200 with status 0 for unknown barcodes.
    if (data && data.status === 1 && data.product) {
      rawFound = { product: data.product, variant };
      break;
    }
  }
  if (!rawFound) return { status: 'not-found', barcode };

  const food = normalizeProduct(rawFound.product, rawFound.variant);
  if (!food) {
    const p = rawFound.product;
    return { status: 'not-found', barcode, partial: { name: p.product_name || p.product_name_en || '', brand: String(p.brands || '').split(',')[0].trim() } };
  }
  food.barcode = barcode;
  food.id = `off-${barcode}`;
  cacheProduct(food, storage);
  return { status: 'found', food, cached: false };
}

/** Free-text product search on Open Food Facts. Resolves to a list of foods. */
export async function searchProducts(query, { fetchImpl, signal, limiter = searchLimiter, pageSize = 15 } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  if (!limiter.tryAcquire()) {
    const s = Math.ceil(limiter.retryIn() / 1000);
    throw new OffError(`Online search limit reached, try again in ${s}s`, 'rate-limit');
  }
  const url =
    `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
    `&search_simple=1&action=process&json=1&page_size=${pageSize}&fields=${OFF_FIELDS}`;
  const data = await getJson(url, { fetchImpl, signal, timeoutMs: 15000 });
  const seen = new Set();
  return (Array.isArray(data?.products) ? data.products : [])
    .map((p) => normalizeProduct(p))
    .filter((f) => f && f.barcode && !seen.has(f.barcode) && seen.add(f.barcode));
}
