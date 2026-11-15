import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './Modal.jsx';
import { Segmented } from './Controls.jsx';
import { BarcodeIcon, BookmarkIcon, SearchIcon, TrashIcon } from './Icons.jsx';
import {
  ACTIVITY_LEVELS,
  GOALS,
  MACRO_KEYS,
  MEALS,
  computeAutoTargets,
  macrosFor,
  recentFoods,
  searchFoods,
  sumMacros,
} from '../lib/nutritionStore.js';
import { cacheProduct, searchProducts } from '../lib/openFoodFactsService.js';
import { hasBodyweight } from '../lib/lifterProfileStore.js';

const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const fmtKcal = (n) => r0(n).toLocaleString();

/** Inline "P 31 · C 0 · F 3.6" line. */
export function MacroLine({ m, className = '' }) {
  return (
    <span className={`macro-line tabular ${className}`}>
      <span className="m-p">P {r1(m.protein)}</span>
      <span className="m-c">C {r1(m.carbs)}</span>
      <span className="m-f">F {r1(m.fat)}</span>
    </span>
  );
}

function FoodRow({ food, onPick, onDelete, badge }) {
  const unit = food.unit || 'g';
  return (
    <li className="food-row">
      <button type="button" className="food-row-main" onClick={() => onPick(food)}>
        <span className="food-row-name">{food.name}</span>
        <span className="food-row-sub">
          {food.brand ? <span className="food-brand">{food.brand}</span> : null}
          {badge ? <span className="food-badge">{badge}</span> : null}
          <MacroLine m={food.per100g} />
        </span>
      </button>
      <span className="food-row-kcal tabular">
        {r0(food.per100g.calories)}
        <small>kcal/100{unit}</small>
      </span>
      {onDelete && (
        <button type="button" className="icon-btn food-row-del" onClick={() => onDelete(food)} aria-label={`Delete ${food.name}`}>
          <TrashIcon width={18} height={18} />
        </button>
      )}
    </li>
  );
}

const FILTERS = ['All', 'Recent', 'Saved Meals', 'Protein', 'Carbs', 'Dairy', 'Fats', 'Fruits & Veg', 'Drinks & Snacks', 'Custom'];

/* ------------------------------------------------------------------ */
/* Search modal                                                         */
/* ------------------------------------------------------------------ */

export function FoodSearchModal({
  open,
  onClose,
  meal,
  catalog,
  catalogById,
  usage,
  today,
  savedMeals,
  customFoods,
  initialQuery = '',
  onQueryChange,
  onPick,
  onLogPreset,
  onDeletePreset,
  onDeleteCustom,
  onCreateCustom,
  onScan,
}) {
  const [tab, setTab] = useState('search');
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState('All');
  const [online, setOnline] = useState({ status: 'idle', query: '', results: [], error: '' });
  const autoQueried = useRef('');
  const abortRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTab('search');
    setQuery(initialQuery);
    setOnline({ status: 'idle', query: '', results: [], error: '' });
    autoQueried.current = '';
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const mealLabel = MEALS.find((m) => m.id === meal)?.label || 'Meal';

  const local = useMemo(() => {
    if (!open) return [];
    if (filter === 'Recent') {
      const list = recentFoods(usage, catalogById);
      return query.trim() ? searchFoods(list, query, { usage, today }) : list;
    }
    if (filter === 'Saved Meals') return [];
    const pool =
      filter === 'All' ? catalog : filter === 'Custom' ? customFoods : catalog.filter((f) => f.category === filter);
    if (!query.trim()) {
      // No query: most-used foods first, then the rest alphabetically within the filter.
      if (filter === 'All') return recentFoods(usage, catalogById, 40);
      return searchFoods(pool, '', { usage, today, limit: 400 });
    }
    return searchFoods(pool, query, { usage, today });
  }, [open, filter, query, catalog, catalogById, customFoods, usage, today]);

  const runOnline = async (q) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setOnline({ status: 'loading', query: q, results: [], error: '' });
    try {
      const results = await searchProducts(q, { signal: ctrl.signal });
      if (!ctrl.signal.aborted) setOnline({ status: 'done', query: q, results, error: '' });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg =
        err?.code === 'rate-limit'
          ? err.message
          : err?.code === 'offline'
            ? 'You seem to be offline. Local foods still work.'
            : 'Online search is unavailable right now. Try again shortly, or scan the barcode.';
      setOnline({ status: 'error', query: q, results: [], error: msg });
    }
  };

  // Debounced automatic online search when local matches are thin.
  const q = query.trim();
  const wantsAuto = open && tab === 'search' && filter === 'All' && q.length >= 3 && local.length < 5;
  useEffect(() => {
    if (!wantsAuto || autoQueried.current === q) return undefined;
    const t = setTimeout(() => {
      autoQueried.current = q;
      runOnline(q);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsAuto, q]);

  const setQ = (v) => {
    setQuery(v);
    onQueryChange?.(v);
  };

  const pickOnline = (food) => {
    cacheProduct(food);
    onPick(food);
  };

  const showOnline = filter === 'All' && q.length >= 2;
  const onlineStale = online.query !== q;

  return (
    <Modal open={open} onClose={onClose} title={`Add to ${mealLabel}`} size="sheet modal-food">
      <Segmented
        small
        label="Add food mode"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'search', label: 'Search' },
          { value: 'custom', label: '+ Create Custom Food' },
        ]}
      />

      {tab === 'custom' ? (
        <CustomFoodForm
          onSave={(food) => {
            onCreateCustom(food);
          }}
        />
      ) : (
        <>
          <div className="food-search-bar">
            <label className="search-field">
              <SearchIcon width={18} height={18} />
              <input
                ref={inputRef}
                className="glass-input"
                type="search"
                enterKeyHint="search"
                placeholder="Search foods, e.g. chicken, skyr, oats"
                value={query}
                aria-label="Search foods"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && q.length >= 2 && filter === 'All') runOnline(q);
                }}
              />
            </label>
            <button type="button" className="icon-btn glass-btn" onClick={onScan} aria-label="Scan barcode">
              <BarcodeIcon width={20} height={20} />
            </button>
          </div>

          <div className="chip-row food-filters" role="tablist" aria-label="Food categories">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                className={`chip chip-sm ${filter === f ? 'is-active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f}
                {f === 'Saved Meals' && savedMeals.length ? <span className="chip-count">{savedMeals.length}</span> : null}
              </button>
            ))}
          </div>

          {filter === 'Saved Meals' ? (
            savedMeals.length ? (
              <ul className="food-list">
                {savedMeals.map((m) => {
                  const t = sumMacros(m.items);
                  return (
                    <li key={m.id} className="food-row">
                      <button type="button" className="food-row-main" onClick={() => onLogPreset(m)}>
                        <span className="food-row-name">
                          <BookmarkIcon width={14} height={14} className="inline-icon" /> {m.name}
                        </span>
                        <span className="food-row-sub">
                          <span className="food-badge">{m.items.length} items</span>
                          <MacroLine m={t} />
                        </span>
                      </button>
                      <span className="food-row-kcal tabular">
                        {fmtKcal(t.calories)}
                        <small>kcal</small>
                      </span>
                      <button type="button" className="icon-btn food-row-del" onClick={() => onDeletePreset(m)} aria-label={`Delete ${m.name}`}>
                        <TrashIcon width={18} height={18} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="food-empty muted">No saved meals yet. Log a meal, then tap “Save as preset” on its card.</p>
            )
          ) : (
            <>
              {!q && filter === 'All' && local.length > 0 && <div className="sheet-sub">Frequent &amp; recent</div>}
              {local.length > 0 ? (
                <ul className="food-list">
                  {local.map((f) => (
                    <FoodRow
                      key={f.id}
                      food={f}
                      onPick={onPick}
                      badge={f.source === 'custom' ? 'Custom' : f.source === 'off' ? 'Packaged' : null}
                      onDelete={filter === 'Custom' ? onDeleteCustom : null}
                    />
                  ))}
                </ul>
              ) : (
                <p className="food-empty muted">
                  {filter === 'Custom'
                    ? 'No custom foods yet. Use “+ Create Custom Food” above.'
                    : filter === 'Recent' || (!q && filter === 'All')
                      ? 'Foods you log will show up here. Start typing to search 390+ foods.'
                      : 'No matching foods in the built-in database.'}
                </p>
              )}

              {showOnline && (
                <div className="online-section">
                  <div className="online-head">
                    <span className="sheet-sub">Packaged foods · Open Food Facts</span>
                    {(online.status === 'idle' || onlineStale || online.status === 'error') && online.status !== 'loading' && (
                      <button type="button" className="link-btn" onClick={() => runOnline(q)}>
                        Search more online
                      </button>
                    )}
                  </div>
                  {online.status === 'loading' && (
                    <p className="food-empty muted online-loading">
                      <span className="spinner" aria-hidden /> Searching Open Food Facts…
                    </p>
                  )}
                  {online.status === 'error' && !onlineStale && <p className="food-empty field-error">{online.error}</p>}
                  {online.status === 'done' && !onlineStale && (
                    online.results.length ? (
                      <ul className="food-list">
                        {online.results.map((f) => (
                          <FoodRow key={f.id} food={f} onPick={pickOnline} badge="Packaged" />
                        ))}
                      </ul>
                    ) : (
                      <p className="food-empty muted">No packaged products found. Try scanning the barcode instead.</p>
                    )
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Custom food form                                                     */
/* ------------------------------------------------------------------ */

const numText = (v) => /^\d*([.,]\d{0,2})?$/.test(v);
const toNum = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function CustomFoodForm({ prefill = {}, onSave, submitLabel = 'Save & Log' }) {
  const [name, setName] = useState(prefill.name || '');
  const [brand, setBrand] = useState(prefill.brand || '');
  const [unit, setUnit] = useState(prefill.unit || 'g');
  const [energyUnit, setEnergyUnit] = useState('kcal');
  const [vals, setVals] = useState({ energy: '', protein: '', carbs: '', fat: '' });
  const [serving, setServing] = useState({ label: '', grams: '' });
  const [barcode, setBarcode] = useState(prefill.barcode || '');
  const [error, setError] = useState('');

  const setVal = (k) => (e) => numText(e.target.value) && setVals((v) => ({ ...v, [k]: e.target.value }));
  const energy = toNum(vals.energy);
  const kcal = energy === null ? null : energyUnit === 'kJ' ? Math.round(energy / 4.184) : Math.round(energy);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the food a name.');
    if (kcal === null) return setError(`Enter the energy per 100${unit} from the label.`);
    const per100g = { calories: kcal, protein: toNum(vals.protein) ?? 0, carbs: toNum(vals.carbs) ?? 0, fat: toNum(vals.fat) ?? 0 };
    const servings = [{ label: `100${unit}`, grams: 100 }];
    const sg = toNum(serving.grams);
    if (sg && sg !== 100) servings.push({ label: serving.label.trim() ? `${serving.label.trim()} (${sg}${unit})` : `1 serving (${sg}${unit})`, grams: sg });
    onSave({ name: name.trim(), brand: brand.trim(), unit, per100g, servings, ...(barcode ? { barcode } : {}) });
  };

  return (
    <form className="custom-food" onSubmit={submit} noValidate>
      {prefill.barcode && (
        <p className="custom-note">
          Barcode <strong className="tabular">{prefill.barcode}</strong> isn’t in Open Food Facts yet. Enter the label values once and
          it will be recognised every time you scan it.
        </p>
      )}
      <div className="form-grid">
        <label className="field full">
          <span className="field-label">Name</span>
          <input className="glass-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Protein Granola" autoFocus={!prefill.name} />
        </label>
        <label className="field">
          <span className="field-label">Brand</span>
          <input className="glass-input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Optional" />
        </label>
        <div className="field">
          <span className="field-label">Measured in</span>
          <Segmented small label="Unit" value={unit} onChange={setUnit} options={[{ value: 'g', label: 'g' }, { value: 'ml', label: 'ml' }]} />
        </div>
      </div>

      <div className="sheet-sub">Per 100{unit} (from the label)</div>
      <div className="form-grid macro-inputs">
        <label className="field">
          <span className="field-label">Energy</span>
          <span className="unit-input">
            <input className="glass-input tabular" inputMode="decimal" value={vals.energy} onChange={setVal('energy')} placeholder="0" />
            <button type="button" className="unit-toggle" onClick={() => setEnergyUnit((u) => (u === 'kcal' ? 'kJ' : 'kcal'))} aria-label="Switch energy unit">
              {energyUnit}
            </button>
          </span>
          {energyUnit === 'kJ' && kcal !== null && <span className="field-hint">= {kcal} kcal</span>}
        </label>
        {['protein', 'carbs', 'fat'].map((k) => (
          <label key={k} className="field">
            <span className="field-label">{k === 'carbs' ? 'Carbs' : k[0].toUpperCase() + k.slice(1)}</span>
            <span className="unit-input">
              <input className="glass-input tabular" inputMode="decimal" value={vals[k]} onChange={setVal(k)} placeholder="0" />
              <span className="bw-unit">g</span>
            </span>
          </label>
        ))}
      </div>

      <div className="sheet-sub">Serving (optional)</div>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Label</span>
          <input className="glass-input" value={serving.label} onChange={(e) => setServing((s) => ({ ...s, label: e.target.value }))} placeholder="1 bar" />
        </label>
        <label className="field">
          <span className="field-label">Size</span>
          <span className="unit-input">
            <input
              className="glass-input tabular"
              inputMode="decimal"
              value={serving.grams}
              onChange={(e) => numText(e.target.value) && setServing((s) => ({ ...s, grams: e.target.value }))}
              placeholder="60"
            />
            <span className="bw-unit">{unit}</span>
          </span>
        </label>
        <label className="field full">
          <span className="field-label">Barcode</span>
          <input
            className="glass-input tabular"
            inputMode="numeric"
            value={barcode}
            onChange={(e) => /^\d{0,14}$/.test(e.target.value) && setBarcode(e.target.value)}
            placeholder="Optional, links future scans to this food"
          />
        </label>
      </div>

      {error && <p className="field-error custom-error">{error}</p>}
      <button type="submit" className="btn btn-primary custom-submit">
        {submitLabel}
      </button>
    </form>
  );
}

export function CustomFoodModal({ open, onClose, prefill, onSave }) {
  return (
    <Modal open={open} onClose={onClose} title={prefill?.barcode ? 'Add New Barcode Food' : 'Create Custom Food'} size="sheet modal-food">
      {open && <CustomFoodForm prefill={prefill || {}} onSave={onSave} />}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Portion picker                                                       */
/* ------------------------------------------------------------------ */

export function PortionPicker({ open, food, entry, meal, onMealChange, onClose, onBack, onSubmit, onDelete }) {
  const unit = food?.unit || 'g';
  const servings = food?.servings?.length ? food.servings : [{ label: `100${unit}`, grams: 100 }];
  const initial = entry?.grams ?? servings.find((s) => s.grams !== 100)?.grams ?? 100;
  const [amount, setAmount] = useState(String(initial));
  const [count, setCount] = useState(1);
  const [servingIdx, setServingIdx] = useState(-1);

  useEffect(() => {
    if (!open || !food) return;
    const idx = entry ? servings.findIndex((s) => s.grams === entry.grams) : servings.findIndex((s) => s.grams === initial);
    setServingIdx(idx);
    setCount(1);
    setAmount(String(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, food, entry]);

  if (!food) return null;
  const grams = toNum(amount) ?? 0;
  const m = macrosFor(food.per100g, grams);
  const selected = servings[servingIdx] || null;

  const pickServing = (i) => {
    setServingIdx(i);
    setCount(1);
    setAmount(String(servings[i].grams));
  };
  const stepCount = (d) => {
    if (!selected) return;
    const next = Math.max(0.5, Math.min(20, count + d));
    setCount(next);
    setAmount(String(r1(selected.grams * next)));
  };

  const valid = grams > 0 && grams <= 10000;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry ? 'Edit Portion' : 'Portion'}
      size="sheet modal-food"
      footer={
        <>
          {entry ? (
            <button type="button" className="btn btn-ghost danger-text" onClick={onDelete}>
              Remove
            </button>
          ) : onBack ? (
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              Back
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => onSubmit(r1(grams))}>
            {entry ? 'Update' : 'Log Food'}
          </button>
        </>
      }
    >
      <div className="portion-head">
        <h3>{food.name}</h3>
        <p className="muted">
          {food.brand ? `${food.brand} · ` : ''}
          {r0(food.per100g.calories)} kcal per 100{unit}
          {food.barcode ? <span className="tabular"> · {food.barcode}</span> : null}
        </p>
      </div>

      <div className="portion-macros">
        <div className="metric portion-kcal">
          <span className="metric-label">Calories</span>
          <strong className="tabular">{fmtKcal(m.calories)}</strong>
        </div>
        <div className="metric">
          <span className="metric-label">Protein</span>
          <strong className="tabular m-p">{r1(m.protein)}g</strong>
        </div>
        <div className="metric">
          <span className="metric-label">Carbs</span>
          <strong className="tabular m-c">{r1(m.carbs)}g</strong>
        </div>
        <div className="metric">
          <span className="metric-label">Fat</span>
          <strong className="tabular m-f">{r1(m.fat)}g</strong>
        </div>
      </div>

      <div className="sheet-sub">Serving</div>
      <div className="serving-chips">
        {servings.map((s, i) => (
          <button key={`${s.label}-${i}`} type="button" className={`chip chip-sm ${servingIdx === i ? 'is-active' : ''}`} onClick={() => pickServing(i)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="portion-amount">
        <label className="field">
          <span className="field-label">Amount</span>
          <span className="unit-input">
            <input
              className="glass-input tabular portion-input"
              inputMode="decimal"
              enterKeyHint="done"
              value={amount}
              aria-label={`Amount in ${unit}`}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                if (!numText(e.target.value)) return;
                setAmount(e.target.value);
                setServingIdx(servings.findIndex((s) => s.grams === toNum(e.target.value)));
                setCount(1);
              }}
              onKeyDown={(e) => e.key === 'Enter' && valid && onSubmit(r1(grams))}
            />
            <span className="bw-unit">{unit}</span>
          </span>
        </label>
        {selected && selected.grams !== 100 && (
          <div className="field">
            <span className="field-label">Servings</span>
            <div className="stepper stepper-compact portion-count">
              <button type="button" className="step-btn" onClick={() => stepCount(-0.5)} disabled={count <= 0.5} aria-label="Fewer servings">
                <span aria-hidden>−</span>
              </button>
              <span className="num-display tabular">{count}</span>
              <button type="button" className="step-btn" onClick={() => stepCount(0.5)} aria-label="More servings">
                <span aria-hidden>+</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {onMealChange && (
        <label className="field portion-meal">
          <span className="field-label">Meal</span>
          <span className="glass-select-wrap">
            <select className="glass-select" value={meal} onChange={(e) => onMealChange(e.target.value)}>
              {MEALS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </span>
        </label>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Targets                                                              */
/* ------------------------------------------------------------------ */

const TARGET_LABELS = { calories: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };

export function TargetsModal({ open, onClose, nutrition, profile, onSave }) {
  const [goal, setGoal] = useState(nutrition.goal);
  const [activity, setActivity] = useState(nutrition.activity);
  const [manual, setManual] = useState({});

  useEffect(() => {
    if (!open) return;
    setGoal(nutrition.goal);
    setActivity(nutrition.activity);
    setManual(Object.fromEntries(MACRO_KEYS.map((k) => [k, nutrition.manual[k] === null ? '' : String(nutrition.manual[k])])));
  }, [open, nutrition]);

  const auto = hasBodyweight(profile) ? computeAutoTargets({ bodyweightKg: profile.bodyweight, sex: profile.sex, goal, activity }) : null;
  const needsAll = !auto;
  const filled = MACRO_KEYS.filter((k) => toNum(manual[k]) !== null);
  const canSave = !needsAll || filled.length === MACRO_KEYS.length;

  const save = () => {
    const out = {};
    for (const k of MACRO_KEYS) {
      const v = toNum(manual[k]);
      out[k] = v === null ? null : Math.round(v);
    }
    onSave({ goal, activity, manual: out });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Daily Targets"
      size="sheet"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => setManual({ calories: '', protein: '', carbs: '', fat: '' })}>
            Reset to automatic
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!canSave}>
            Save
          </button>
        </>
      }
    >
      <div className="targets-form">
        <div className="field">
          <span className="field-label">Goal</span>
          <Segmented label="Goal" value={goal} onChange={setGoal} options={Object.entries(GOALS).map(([value, g]) => ({ value, label: g.label }))} />
        </div>
        <label className="field">
          <span className="field-label">Activity</span>
          <span className="glass-select-wrap">
            <select className="glass-select" value={activity} onChange={(e) => setActivity(Number(e.target.value))}>
              {ACTIVITY_LEVELS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label} (×{a.value})
                </option>
              ))}
            </select>
          </span>
        </label>

        {auto ? (
          <p className="field-hint targets-hint">
            Maintenance ≈ <strong className="tabular">{fmtKcal(auto.maintenance)} kcal</strong> from {r1(profile.bodyweight)} kg ×{' '}
            {profile.sex === 'female' ? 30 : 33} kcal/kg × {activity}. Leave a field empty to keep it automatic.
          </p>
        ) : (
          <p className="field-hint targets-hint">Add your bodyweight in the Food or Rank tab for automatic targets, or enter all four numbers below.</p>
        )}

        <div className="sheet-sub">Edit targets manually</div>
        <div className="form-grid">
          {MACRO_KEYS.map((k) => (
            <label key={k} className="field">
              <span className="field-label">{TARGET_LABELS[k]}</span>
              <span className="unit-input">
                <input
                  className="glass-input tabular"
                  inputMode="numeric"
                  value={manual[k] ?? ''}
                  placeholder={auto ? String(auto[k]) : '–'}
                  onChange={(e) => /^\d{0,5}$/.test(e.target.value) && setManual((m) => ({ ...m, [k]: e.target.value }))}
                />
                <span className="bw-unit">{k === 'calories' ? 'kcal' : 'g'}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Save meal preset                                                     */
/* ------------------------------------------------------------------ */

export function SavePresetModal({ open, onClose, defaultName, items, onSave }) {
  const [name, setName] = useState(defaultName);
  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);
  const t = sumMacros(items || []);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save Meal as Preset"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={() => onSave(name.trim())}>
            Save Preset
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">Preset name</span>
        <input className="glass-input" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name.trim())} />
      </label>
      <p className="field-hint">
        {items?.length || 0} items · {fmtKcal(t.calories)} kcal · <MacroLine m={t} />
      </p>
    </Modal>
  );
}
