import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { classifyExercise, exerciseOptions, MUSCLE_NAME, rankOf, simulateSet } from '../lib/rankingEngine.js';
import { formatWeight, fromKg, plateStep, toKg } from '../lib/lifterProfileStore.js';
import { RankCrest } from './TierCrest.jsx';
import { Stepper } from './Controls.jsx';
import { SearchIcon } from './Icons.jsx';
import { LpBar } from './RankBits.jsx';
import { tierInk } from '../lib/rankFormat.js';

/** Hypothetical-set sandbox. Never writes to state. */
export const RankCalculator = forwardRef(function RankCalculator({ state, profile, ranks, preset }, ref) {
  const unit = profile.unit;
  const options = useMemo(() => exerciseOptions(state), [state]);
  const [pick, setPick] = useState(() => options[0] || null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState(null); // display units
  const [reps, setReps] = useState(5);
  const box = useRef(null);

  // Pre-load from a tapped exercise.
  useEffect(() => {
    if (!preset) return;
    setPick({ name: preset.name, category: preset.category });
    setWeight(Math.round(fromKg(preset.best.weightKg, unit) * 4) / 4);
    setReps(preset.best.reps);
    setQuery('');
  }, [preset, unit]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = (q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options).slice(0, 8);

  const cls = pick ? classifyExercise(pick.name, pick.category) : null;
  const current = pick ? ranks.exercises.find((e) => e.name.toLowerCase() === pick.name.toLowerCase()) : null;
  const sim = pick && reps ? simulateSet(pick.name, pick.category, weight ? toKg(weight, unit) : 0, reps, profile) : null;
  const rank = sim ? sim.rank : rankOf(0);
  // Re-score the saved best at today's bodyweight so the comparison is like-for-like.
  const currentNow = current ? simulateSet(current.name, current.category, current.best.weightKg, current.best.reps, profile) : null;
  const delta = sim && currentNow ? Math.round(sim.score) - Math.round(currentNow.score) : null;

  const choose = (o) => {
    setPick(o);
    setQuery('');
    setOpen(false);
    const ex = ranks.exercises.find((e) => e.name.toLowerCase() === o.name.toLowerCase());
    if (ex) {
      setWeight(Math.round(fromKg(ex.best.weightKg, unit) * 4) / 4);
      setReps(ex.best.reps);
    }
  };

  return (
    <div className="calc" ref={ref}>
      <div className="calc-search" ref={box}>
        <label className="calc-input-wrap">
          <SearchIcon width={18} height={18} />
          <input
            className="calc-input"
            value={open ? query : pick?.name || ''}
            placeholder="Search exercises"
            aria-label="Exercise"
            onFocus={() => {
              setOpen(true);
              setQuery('');
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered[0]) choose(filtered[0]);
              if (e.key === 'Escape') setOpen(false);
            }}
          />
        </label>
        {open && (
          <ul className="calc-list glass-panel" role="listbox">
            {filtered.length === 0 && <li className="calc-empty">No match. Try another name.</li>}
            {filtered.map((o) => (
              <li key={o.name}>
                <button type="button" role="option" aria-selected={pick?.name === o.name} onClick={() => choose(o)}>
                  <span>{o.name}</span>
                  <span className="calc-tag">{MUSCLE_NAME[classifyExercise(o.name, o.category).muscle] || 'No muscle set'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="calc-inputs">
        <div className="metric">
          <span className="metric-label">{cls?.bw ? `Added (${unit})` : `Weight (${unit})`}</span>
          <Stepper value={weight} decimal step={plateStep(unit) * 2} label="Weight" onChange={setWeight} />
        </div>
        <div className="metric">
          <span className="metric-label">Reps</span>
          <Stepper value={reps} step={1} label="Reps" onChange={(v) => setReps(v === null ? null : Math.min(v, 100))} />
        </div>
      </div>

      <div className="calc-result">
        <RankCrest rank={rank} size={64} />
        <div className="calc-result-body">
          <div className="calc-result-head">
            <span className="rank-label" style={{ color: tierInk(rank.tier) }}>
              {rank.label}
            </span>
            <span className="rank-score tabular">{rank.ranked ? rank.score : '–'}</span>
          </div>
          <LpBar rank={rank} />
          <div className="calc-meta">
            {sim ? `Est. 1RM ${formatWeight(sim.e1rm, unit)}` : cls?.bw ? 'Enter reps' : 'Enter weight and reps'}
            {delta !== null && (
              <span className={delta > 0 ? 'calc-up' : 'calc-flat'}>
                {delta > 0 ? ` · +${delta} over your best` : delta === 0 ? ' · matches your best' : ` · your best scores ${Math.round(currentNow.score)} today`}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="calc-note">Preview only. Nothing is saved to your logs.</p>
    </div>
  );
});
