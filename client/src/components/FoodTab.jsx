import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, formatDate, relativeLabel, todayKey } from '../lib/dates.js';
import { FOODS } from '../lib/foodDatabase.js';
import {
  GOALS,
  MEALS,
  MEAL_IDS,
  MICROS,
  MICRO_KEYS,
  addWater,
  copyEntries,
  isRecipe,
  recipeToFood,
  sumMicros,
  waterOn,
  dayEntries,
  dayTotals,
  emptyDay,
  entryMacros,
  entryToFood,
  foodUsage,
  getDay,
  makeEntry,
  normalizeFood,
  normalizeNutrition,
  resolveTargets,
  sumMacros,
} from '../lib/nutritionStore.js';
import { cachedProducts, lookupBarcode } from '../lib/openFoodFactsService.js';
import { normalizeProfile, parseWeightInput, setBodyweight, setSex } from '../lib/lifterProfileStore.js';
import { uid } from '../lib/storage.js';
import { Segmented } from './Controls.jsx';
import { BarcodeIcon, BookmarkIcon, CalendarIcon, ChevronLeft, ChevronRight, CopyIcon, EditIcon, PlusIcon, TrashIcon } from './Icons.jsx';
import { BarcodeScannerModal } from './BarcodeScannerModal.jsx';
import { CopyModal, CustomFoodModal, FoodSearchModal, MacroLine, PortionPicker, RecipeModal, SavePresetModal, TargetsModal } from './FoodModals.jsx';

const WATER_GOALS = [1500, 2000, 2500, 3000, 3500, 4000];

const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const fmt = (n) => r0(n).toLocaleString();
const GOAL_OPTIONS = Object.entries(GOALS).map(([value, g]) => ({ value, label: g.label }));
const SEX_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

/* ------------------------------------------------------------------ */
/* Summary                                                              */
/* ------------------------------------------------------------------ */

function CalorieRing({ eaten, target }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const pct = target > 0 ? Math.min(eaten / target, 1) : 0;
  const over = target > 0 && eaten > target;
  return (
    <div className={`kcal-ring ${over ? 'is-over' : ''}`}>
      <svg viewBox="0 0 120 120" aria-hidden>
        <defs>
          <linearGradient id="kcal-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(165, 180, 252)" />
            <stop offset="100%" stopColor="rgb(99, 102, 241)" />
          </linearGradient>
        </defs>
        <circle className="kcal-ring-track" cx="60" cy="60" r={R} />
        <circle
          className="kcal-ring-fill"
          cx="60"
          cy="60"
          r={R}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="kcal-ring-text">
        <strong className="tabular">{fmt(eaten)}</strong>
        <span>of {fmt(target)} kcal</span>
      </div>
    </div>
  );
}

function MacroBar({ label, tone, eaten, target }) {
  const pct = target > 0 ? Math.min(eaten / target, 1) : 0;
  const left = target - eaten;
  const over = left < -0.5;
  return (
    <div className={`macro-bar tone-${tone} ${over ? 'is-over' : ''}`}>
      <div className="macro-bar-top">
        <span className="macro-bar-label">{label}</span>
        <span className="tabular">
          <strong>{r0(eaten)}</strong> / {r0(target)} g
        </span>
      </div>
      <div className="progress-track macro-track">
        <span className="progress-fill macro-fill" style={{ transform: `scaleX(${pct})` }} />
      </div>
      <div className="macro-bar-left tabular">{over ? `${r0(-left)} g over` : `${r0(Math.max(0, left))} g left`}</div>
    </div>
  );
}

function SetupCard({ profile, onBodyweight, onSex, onManual }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const kg = parseWeightInput(draft, profile.unit);
    if (kg) onBodyweight(kg);
  };
  return (
    <div className="glass-panel card food-setup">
      <h2>Set your daily targets</h2>
      <p>Lyft works out calories and macros from your bodyweight and sex. They update automatically when your bodyweight changes.</p>
      <div className="food-setup-fields">
        <Segmented label="Sex" value={profile.sex} onChange={onSex} options={SEX_OPTIONS} />
        <form
          className="food-setup-row"
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
        >
          <label className="bw-input">
            <input
              className="glass-input tabular"
              inputMode="decimal"
              enterKeyHint="done"
              placeholder={profile.unit === 'lbs' ? '175' : '80'}
              value={draft}
              aria-label={`Bodyweight in ${profile.unit}`}
              onChange={(e) => /^\d*([.,]\d{0,2})?$/.test(e.target.value) && setDraft(e.target.value)}
            />
            <span className="bw-unit">{profile.unit}</span>
          </label>
          <button type="submit" className="btn btn-primary" disabled={!parseWeightInput(draft, profile.unit)}>
            Calculate
          </button>
        </form>
      </div>
      <button type="button" className="link-btn" onClick={onManual}>
        Or enter targets manually
      </button>
    </div>
  );
}

/** Fibre / sugar / sodium totals for the day, flagged when some foods have no data. */
function MicroTotals({ micro }) {
  if (!micro.count) return null;
  const gaps = MICRO_KEYS.filter((k) => micro.known[k] > 0 && micro.known[k] < micro.count).map((k) => MICROS[k].label.toLowerCase());
  return (
    <div className="micro-totals">
      {MICRO_KEYS.map((k) => (
        <div key={k} className="micro-total">
          <span className="metric-label">{MICROS[k].label}</span>
          <strong className="tabular">
            {micro.known[k] ? `${k === 'sodium' ? fmt(micro[k]) : r1(micro[k])} ${MICROS[k].unit}` : '–'}
          </strong>
        </div>
      ))}
      {gaps.length > 0 && (
        <span className="micro-note">
          Not every food lists {gaps.join(' or ')}, so {gaps.length === 1 ? 'that total is' : 'those totals are'} a minimum.
        </span>
      )}
    </div>
  );
}

function WaterCard({ ml, goal, onAdd, onGoal }) {
  const pct = goal > 0 ? Math.min(ml / goal, 1) : 0;
  return (
    <div className="glass-panel card water-card">
      <div className="water-top">
        <span className="water-title">Water</span>
        <span className="tabular">
          <strong>{fmt(ml)}</strong> / {fmt(goal)} ml
        </span>
      </div>
      <div className="progress-track water-track">
        <span className="progress-fill water-fill" style={{ transform: `scaleX(${pct})` }} />
      </div>
      <div className="water-actions">
        <button type="button" className="chip chip-sm" onClick={() => onAdd(-250)} disabled={!ml} aria-label="Remove 250 ml of water">
          −250
        </button>
        <button type="button" className="chip chip-sm" onClick={() => onAdd(250)} aria-label="Add 250 ml of water">
          +250 ml
        </button>
        <button type="button" className="chip chip-sm" onClick={() => onAdd(500)} aria-label="Add 500 ml of water">
          +500 ml
        </button>
        <label className="muscle-pick water-goal">
          <span>Goal</span>
          <select className="muscle-select" value={goal} onChange={(e) => onGoal(Number(e.target.value))} aria-label="Daily water goal">
            {[...new Set([...WATER_GOALS, goal])].sort((a, b) => a - b).map((g) => (
              <option key={g} value={g}>
                {g / 1000} L
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function SummaryCard({ totals, targets, goal, onGoal, onEdit, micro }) {
  const left = targets.calories - totals.calories;
  return (
    <div className="glass-panel card food-summary">
      <div className="food-summary-top">
        <Segmented small label="Goal" value={goal} onChange={onGoal} options={GOAL_OPTIONS} />
        <button type="button" className="icon-btn glass-btn" onClick={onEdit} aria-label="Edit targets">
          <EditIcon width={18} height={18} />
        </button>
      </div>
      <div className="food-summary-main">
        <CalorieRing eaten={totals.calories} target={targets.calories} />
        <div className="kcal-remaining">
          <span className="metric-label">{left < 0 ? 'Over target' : 'Remaining'}</span>
          <strong className={`tabular ${left < 0 ? 'danger-text' : ''}`}>{fmt(Math.abs(left))}</strong>
          <span className="kcal-remaining-unit">kcal</span>
          {targets.source !== 'auto' && <span className="food-badge targets-badge">{targets.source === 'manual' ? 'Manual targets' : 'Custom overrides'}</span>}
        </div>
      </div>
      <div className="macro-bars">
        <MacroBar label="Protein" tone="protein" eaten={totals.protein} target={targets.protein} />
        <MacroBar label="Carbs" tone="carbs" eaten={totals.carbs} target={targets.carbs} />
        <MacroBar label="Fat" tone="fat" eaten={totals.fat} target={targets.fat} />
      </div>
      <MicroTotals micro={micro} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Meal card                                                            */
/* ------------------------------------------------------------------ */

function MealCard({ meal, entries, onAdd, onScan, onEdit, onDelete, onSavePreset, onCopy }) {
  const t = sumMacros(entries);
  return (
    <section className="glass-panel meal-card" aria-label={meal.label}>
      <div className="meal-head">
        <div className="meal-title">
          <h3>{meal.label}</h3>
          <span className="meal-sub">
            <strong className="tabular">{fmt(t.calories)} kcal</strong>
            {entries.length > 0 && <MacroLine m={t} />}
          </span>
        </div>
        <div className="meal-actions">
          <button type="button" className="pill-btn meal-btn" onClick={onAdd}>
            <PlusIcon width={16} height={16} /> Add Food
          </button>
          <button type="button" className="pill-btn meal-btn" onClick={onScan} aria-label={`Scan barcode for ${meal.label}`}>
            <BarcodeIcon width={16} height={16} /> Scan
          </button>
        </div>
      </div>
      {entries.length > 0 && (
        <ul className="entry-list">
          {entries.map((e) => {
            const m = entryMacros(e);
            return (
              <li key={e.id} className="entry-row">
                <button type="button" className="entry-main" onClick={() => onEdit(e)} aria-label={`Edit ${e.name}, ${r1(e.grams)}${e.unit}`}>
                  <span className="entry-name">{e.name}</span>
                  <span className="entry-sub">
                    <span className="entry-qty tabular">
                      {r1(e.grams)}
                      {e.unit}
                    </span>
                    <MacroLine m={m} />
                  </span>
                </button>
                <span className="entry-kcal tabular">{fmt(m.calories)}</span>
                <button type="button" className="icon-btn entry-del" onClick={() => onDelete(e)} aria-label={`Delete ${e.name}`}>
                  <TrashIcon width={17} height={17} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {entries.length > 0 && (
        <div className="meal-foot">
          <button type="button" className="link-btn" onClick={onCopy}>
            <CopyIcon width={14} height={14} className="inline-icon" /> Copy to…
          </button>
          {entries.length > 1 && (
            <button type="button" className="link-btn" onClick={onSavePreset}>
              <BookmarkIcon width={14} height={14} className="inline-icon" /> Save as preset
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Food tab                                                             */
/* ------------------------------------------------------------------ */

export function FoodTab({ state, update, askConfirm, toast }) {
  const today = todayKey();
  const [date, setDate] = useState(today);
  const [direction, setDirection] = useState(0);
  const [sheet, setSheet] = useState(null);
  // Non-null while a recipe is being built: foods picked then go into it, not the diary.
  const [recipeDraft, setRecipeDraft] = useState(null);
  const closeSheet = () => setSheet(recipeDraft ? { type: 'recipe' } : null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cacheVersion, setCacheVersion] = useState(0);
  const dateInput = useRef(null);
  const touch = useRef(null);

  const nutrition = useMemo(() => normalizeNutrition(state.nutrition), [state.nutrition]);
  const profile = useMemo(() => normalizeProfile(state.profile), [state.profile]);
  const targets = resolveTargets(nutrition, profile);
  const day = getDay(nutrition, date);
  const totals = dayTotals(day);
  const usage = useMemo(() => foodUsage(nutrition), [nutrition]);

  const catalog = useMemo(() => {
    const cached = sheet ? cachedProducts() : [];
    const custom = nutrition.foods;
    const customBarcodes = new Set(custom.map((f) => f.barcode).filter(Boolean));
    const recipes = nutrition.meals.filter(isRecipe).map(recipeToFood).filter(Boolean);
    return [...recipes, ...custom, ...cached.filter((f) => !customBarcodes.has(f.barcode)), ...FOODS];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nutrition.foods, nutrition.meals, cacheVersion, Boolean(sheet)]);
  const catalogById = useMemo(() => new Map(catalog.map((f) => [f.id, f])), [catalog]);

  const updateNutrition = useCallback(
    (mutate, opts) =>
      update((draft) => {
        draft.nutrition = normalizeNutrition(draft.nutrition);
        mutate(draft.nutrition);
      }, opts),
    [update]
  );

  /* ---------------- dates */

  const go = useCallback((delta) => {
    setDirection(delta);
    setDate((d) => addDays(d, delta));
  }, []);

  const jumpTo = (key) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || key === date) return;
    setDirection(key > date ? 1 : -1);
    setDate(key);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = document.activeElement;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      if (document.querySelector('.modal-backdrop')) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const onTouchStart = (e) => {
    if (e.touches.length !== 1 || e.target.closest('input, textarea, select, .segmented')) {
      touch.current = null;
      return;
    }
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  };
  const onTouchEnd = (e) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - start.time < 900) go(dx > 0 ? -1 : 1);
  };

  const openDatePicker = () => {
    const el = dateInput.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === 'function') el.showPicker();
      else el.focus();
    } catch {
      el.focus();
    }
  };

  /* ---------------- logging */

  const mealLabel = (id) => MEALS.find((m) => m.id === id)?.label || 'Meal';

  const logFood = (food, grams, meal) => {
    if (recipeDraft) {
      setRecipeDraft((d) => ({ ...d, items: [...d.items, makeEntry(food, grams, uid('mi'))] }));
      setSheet({ type: 'recipe' });
      return;
    }
    updateNutrition((n) => {
      const d = (n.days[date] ||= emptyDay());
      d[meal].push(makeEntry(food, grams, uid('fe')));
    });
    toast(`Added ${food.name} to ${mealLabel(meal)}`);
    closeSheet();
  };

  const updateEntry = (entry, grams, meal, fromMeal) => {
    updateNutrition((n) => {
      const d = (n.days[date] ||= emptyDay());
      const list = d[fromMeal];
      const i = list.findIndex((x) => x.id === entry.id);
      if (i < 0) return;
      const [item] = list.splice(i, 1);
      item.grams = grams;
      if (meal === fromMeal) list.splice(i, 0, item);
      else d[meal].push(item);
    });
    closeSheet();
  };

  const deleteEntry = (entry, meal) => {
    updateNutrition(
      (n) => {
        const d = n.days[date];
        if (!d) return;
        d[meal] = d[meal].filter((x) => x.id !== entry.id);
        if (!dayEntries(d).length) delete n.days[date];
      },
      { undo: `Removed ${entry.name}` }
    );
  };

  const copyTo = (toDate, fromMeal, toMeal) => {
    const count = fromMeal ? day[fromMeal].length : dayEntries(day).length;
    closeSheet();
    if (!count || toDate === date && (!fromMeal || toMeal === fromMeal)) {
      toast(count ? 'Pick a different day or meal to copy to' : 'Nothing to copy', 'error');
      return;
    }
    updateNutrition((n) => copyEntries(n, { fromDate: date, toDate, fromMeal, toMeal, newId: () => uid('fe') }), {
      undo: `Copied ${count} item${count === 1 ? '' : 's'} to ${formatDate(toDate)}`,
    });
  };

  const saveRecipe = () => {
    const draft = recipeDraft;
    const recipe = { id: draft.id || uid('meal'), name: draft.name.trim(), servings: draft.servings, items: draft.items };
    updateNutrition((n) => {
      const i = n.meals.findIndex((m) => m.id === recipe.id);
      if (i >= 0) n.meals[i] = recipe;
      else n.meals.push(recipe);
    });
    setRecipeDraft(null);
    setSheet(null);
    toast(`Saved recipe “${recipe.name}”`);
  };

  const startRecipe = (meal = null) => {
    setRecipeDraft(meal ? { id: meal.id, name: meal.name, servings: meal.servings || 1, items: meal.items } : { id: null, name: '', servings: 4, items: [] });
    setSheet({ type: 'recipe' });
  };

  const copyPreviousDay = async () => {
    const prevKey = addDays(date, -1);
    const prev = nutrition.days[prevKey];
    const count = prev ? dayEntries(prev).length : 0;
    if (!count) {
      toast(`Nothing logged on ${formatDate(prevKey)}`, 'error');
      return;
    }
    if (dayEntries(day).length) {
      const ok = await askConfirm({
        title: 'Copy previous day?',
        message: `Add ${count} item${count === 1 ? '' : 's'} from ${formatDate(prevKey)} to ${formatDate(date)}? Existing entries are kept.`,
        confirmLabel: 'Copy',
      });
      if (!ok) return;
    }
    updateNutrition((n) => {
      const d = (n.days[date] ||= emptyDay());
      for (const m of MEAL_IDS) for (const e of n.days[prevKey]?.[m] || []) d[m].push({ ...e, id: uid('fe') });
    });
    toast(`Copied ${count} item${count === 1 ? '' : 's'} from ${formatDate(prevKey)}`);
  };

  const savePreset = (name, items) => {
    updateNutrition((n) => {
      n.meals.push({ id: uid('meal'), name, items: items.map((e) => ({ ...e, id: uid('mi') })) });
    });
    toast(`Saved preset “${name}”`);
    closeSheet();
  };

  const logPreset = (preset, meal) => {
    if (recipeDraft) {
      setRecipeDraft((d) => ({ ...d, items: [...d.items, ...preset.items.map((e) => ({ ...e, id: uid('mi') }))] }));
      setSheet({ type: 'recipe' });
      return;
    }
    updateNutrition((n) => {
      const d = (n.days[date] ||= emptyDay());
      for (const e of preset.items) d[meal].push({ ...e, id: uid('fe') });
    });
    toast(`Added “${preset.name}” to ${mealLabel(meal)}`);
    closeSheet();
  };

  const deletePreset = async (preset) => {
    const ok = await askConfirm({ title: 'Delete preset?', message: `Delete the saved meal “${preset.name}”?`, confirmLabel: 'Delete', destructive: true });
    if (ok) updateNutrition((n) => (n.meals = n.meals.filter((m) => m.id !== preset.id)), { undo: `Deleted “${preset.name}”` });
  };

  const deleteCustom = async (food) => {
    const ok = await askConfirm({
      title: 'Delete custom food?',
      message: `Delete “${food.name}”? Days you already logged it on keep their values.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) updateNutrition((n) => (n.foods = n.foods.filter((f) => f.id !== food.id)));
  };

  const createCustom = (data, meal) => {
    const food = normalizeFood({ ...data, id: uid('custom') });
    updateNutrition((n) => {
      if (food.barcode) n.foods = n.foods.filter((f) => f.barcode !== food.barcode);
      n.foods.push(food);
    });
    toast(`Saved ${food.name}`);
    setSheet({ type: 'portion', meal, food });
  };

  /* ---------------- barcode */

  const handleBarcode = async (code, meal) => {
    const own = nutrition.foods.find((f) => f.barcode && (f.barcode === code || f.barcode === `0${code}` || `0${f.barcode}` === code));
    if (own) {
      setSheet({ type: 'portion', meal, food: own });
      return;
    }
    try {
      const res = await lookupBarcode(code);
      setCacheVersion((v) => v + 1);
      if (res.status === 'found') {
        setSheet({ type: 'portion', meal, food: res.food });
      } else {
        toast('Not in Open Food Facts yet. Add it once and it will scan next time.');
        setSheet({ type: 'custom', meal, prefill: { barcode: res.barcode, ...(res.partial || {}) } });
      }
    } catch (err) {
      toast(err?.code === 'offline' ? 'Offline: enter this product manually.' : err?.message || 'Lookup failed', 'error');
      setSheet({ type: 'custom', meal, prefill: { barcode: code } });
    }
  };

  /* ---------------- render */

  const setGoal = (goal) => updateNutrition((n) => (n.goal = goal));

  const defaultMeal = () => {
    const h = new Date().getHours();
    return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snacks';
  };

  const presetMeal = sheet?.type === 'savePreset' ? sheet.meal : null;
  const portionFood = sheet?.type === 'portion' ? sheet.food : null;

  return (
    <section className="tab-food" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="calendar-bar glass-panel">
        <button type="button" className="icon-btn cal-arrow" onClick={() => go(-1)} aria-label="Previous day">
          <ChevronLeft />
        </button>
        <button type="button" className="cal-center cal-picker" onClick={openDatePicker} aria-label="Pick a date">
          <div className="cal-title">
            <span className="cal-relative">{relativeLabel(date, today)}</span>
            <CalendarIcon width={15} height={15} className="cal-picker-icon" />
          </div>
          <div className="cal-date tabular">{formatDate(date)}</div>
          <input
            ref={dateInput}
            type="date"
            className="cal-date-input"
            value={date}
            tabIndex={-1}
            aria-hidden
            onChange={(e) => jumpTo(e.target.value)}
          />
        </button>
        <button type="button" className="icon-btn cal-arrow" onClick={() => go(1)} aria-label="Next day">
          <ChevronRight />
        </button>
      </div>

      <div className="cal-sub">
        {date !== today && (
          <button type="button" className="today-pill glass-panel" onClick={() => jumpTo(today)}>
            Today
          </button>
        )}
      </div>

      <div key={date} className={`day-content slide-${direction > 0 ? 'left' : direction < 0 ? 'right' : 'none'}`}>
        {targets ? (
          <SummaryCard
            totals={totals}
            targets={targets}
            goal={nutrition.goal}
            onGoal={setGoal}
            onEdit={() => setSheet({ type: 'targets' })}
            micro={sumMicros(dayEntries(day))}
          />
        ) : (
          <SetupCard
            profile={profile}
            onSex={(sex) => update((d) => (d.profile = setSex(d.profile, sex)))}
            onBodyweight={(kg) => {
              update((d) => (d.profile = setBodyweight(d.profile, kg, todayKey())));
              toast('Bodyweight saved, targets calculated');
            }}
            onManual={() => setSheet({ type: 'targets' })}
          />
        )}

        <WaterCard
          ml={waterOn(nutrition, date)}
          goal={nutrition.waterGoal}
          onAdd={(ml) => updateNutrition((n) => addWater(n, date, ml))}
          onGoal={(g) => updateNutrition((n) => (n.waterGoal = g))}
        />

        <div className="food-quick">
          <button type="button" className="chip chip-sm" onClick={copyPreviousDay}>
            <CopyIcon width={15} height={15} /> Copy previous day
          </button>
          {dayEntries(day).length > 0 && (
            <button type="button" className="chip chip-sm" onClick={() => setSheet({ type: 'copy', meal: null })}>
              <CopyIcon width={15} height={15} /> Copy day to…
            </button>
          )}
          <button type="button" className="chip chip-sm" onClick={() => startRecipe()}>
            <PlusIcon width={15} height={15} /> New recipe
          </button>
          <button type="button" className="chip chip-sm" onClick={() => setSheet({ type: 'scan', meal: defaultMeal()})}>
            <BarcodeIcon width={15} height={15} /> Scan
          </button>
        </div>

        <div className="meal-list">
          {MEALS.map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              entries={day[meal.id]}
              onAdd={() => setSheet({ type: 'search', meal: meal.id })}
              onScan={() => setSheet({ type: 'scan', meal: meal.id })}
              onEdit={(entry) => setSheet({ type: 'portion', meal: meal.id, fromMeal: meal.id, entry, food: catalogById.get(entry.foodId) ? { ...catalogById.get(entry.foodId), per100g: entry.per100g, unit: entry.unit } : entryToFood(entry) })}
              onDelete={(entry) => deleteEntry(entry, meal.id)}
              onSavePreset={() => setSheet({ type: 'savePreset', meal: meal.id })}
              onCopy={() => setSheet({ type: 'copy', meal: meal.id })}
            />
          ))}
        </div>
      </div>

      <FoodSearchModal
        open={sheet?.type === 'search'}
        onClose={() => closeSheet()}
        meal={sheet?.meal}
        catalog={catalog}
        catalogById={catalogById}
        usage={usage}
        today={today}
        savedMeals={nutrition.meals}
        customFoods={nutrition.foods}
        initialQuery={searchQuery}
        onQueryChange={setSearchQuery}
        onPick={(food) => setSheet({ type: 'portion', meal: sheet.meal, food, from: 'search' })}
        onLogPreset={(preset) => logPreset(preset, sheet.meal)}
        onDeletePreset={deletePreset}
        onDeleteCustom={deleteCustom}
        onCreateCustom={(data) => createCustom(data, sheet.meal)}
        onScan={() => setSheet({ type: 'scan', meal: sheet.meal })}
        title={recipeDraft ? 'Add ingredient' : undefined}
        onPickRecipe={(m) => setSheet({ type: 'portion', meal: sheet.meal, food: recipeToFood(m), from: 'search' })}
        onNewRecipe={recipeDraft ? null : () => startRecipe()}
        onEditRecipe={recipeDraft ? null : startRecipe}
      />

      <RecipeModal
        open={sheet?.type === 'recipe'}
        draft={recipeDraft}
        onChange={setRecipeDraft}
        onAddIngredient={() => setSheet({ type: 'search', meal: defaultMeal() })}
        onClose={() => {
          setRecipeDraft(null);
          setSheet(null);
        }}
        onSave={saveRecipe}
      />

      <CopyModal
        open={sheet?.type === 'copy'}
        onClose={closeSheet}
        fromMeal={sheet?.type === 'copy' ? sheet.meal : null}
        count={sheet?.type === 'copy' ? (sheet.meal ? day[sheet.meal].length : dayEntries(day).length) : 0}
        defaultDate={date === today ? addDays(today, 1) : today}
        onCopy={(toDate, toMeal) => copyTo(toDate, sheet.meal, toMeal)}
      />

      <PortionPicker
        key={portionFood ? `${portionFood.id}-${sheet?.entry?.id || ''}` : 'none'}
        open={sheet?.type === 'portion'}
        food={portionFood}
        entry={sheet?.entry}
        meal={sheet?.meal}
        onMealChange={recipeDraft ? null : (meal) => setSheet((s) => ({ ...s, meal }))}
        submitLabel={recipeDraft ? 'Add to Recipe' : undefined}
        onClose={() => closeSheet()}
        onBack={sheet?.from === 'search' ? () => setSheet({ type: 'search', meal: sheet.meal }) : null}
        onSubmit={(grams) => (sheet.entry ? updateEntry(sheet.entry, grams, sheet.meal, sheet.fromMeal) : logFood(sheet.food, grams, sheet.meal))}
        onDelete={() => {
          deleteEntry(sheet.entry, sheet.fromMeal);
          closeSheet();
        }}
      />

      <BarcodeScannerModal open={sheet?.type === 'scan'} onClose={() => closeSheet()} onDetected={(code) => handleBarcode(code, sheet.meal)} />

      <CustomFoodModal
        open={sheet?.type === 'custom'}
        prefill={sheet?.prefill}
        onClose={() => closeSheet()}
        onSave={(data) => createCustom(data, sheet.meal)}
      />

      <TargetsModal
        open={sheet?.type === 'targets'}
        onClose={() => closeSheet()}
        nutrition={nutrition}
        profile={profile}
        onSave={({ goal, activity, manual }) => {
          updateNutrition((n) => {
            n.goal = goal;
            n.activity = activity;
            n.manual = manual;
          });
          closeSheet();
          toast('Targets updated');
        }}
      />

      <SavePresetModal
        open={sheet?.type === 'savePreset'}
        onClose={() => closeSheet()}
        defaultName={presetMeal ? `${mealLabel(presetMeal)} · ${formatDate(date)}` : ''}
        items={presetMeal ? day[presetMeal] : []}
        onSave={(name) => savePreset(name, day[presetMeal])}
      />
    </section>
  );
}
