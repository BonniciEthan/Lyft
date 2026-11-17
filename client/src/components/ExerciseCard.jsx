import { memo } from 'react';
import { GlassCheckbox, Stepper } from './Controls.jsx';
import { RankCrest } from './TierCrest.jsx';
import { fromKg, toKg } from '../lib/lifterProfileStore.js';
import { fillFromLast } from '../lib/history.js';
import { relativeLabel } from '../lib/dates.js';

const round2 = (n) => Math.round(n * 100) / 100;

/** Logged weights are stored in kg; these convert to and from what the lifter types. */
const shown = (kg, unit) => (kg === null || kg === undefined ? null : unit === 'lbs' ? Math.round(fromKg(kg, unit) * 10) / 10 : round2(kg));
const stored = (value, unit) => (value === null ? null : unit === 'lbs' ? Math.round(toKg(value, unit) * 10000) / 10000 : value);

const RIR_STEPS = [null, 0, 1, 2, 3, 4];

function LiveRankPill({ live }) {
  return (
    <span
      key={live.tone}
      className={`live-rank tone-${live.tone}`}
      style={{ '--tier': live.rank.tier?.color || 'var(--text-3)' }}
      aria-live="polite"
    >
      <RankCrest rank={live.rank} size={18} />
      <span>{live.text}</span>
    </span>
  );
}

/** Reps in reserve: tap to cycle – → 0 → 1 → 2 → 3 → 4 → –. */
function RirCell({ value, onChange, label }) {
  const has = Number.isInteger(value);
  const next = RIR_STEPS[(RIR_STEPS.indexOf(has ? Math.min(value, 4) : null) + 1) % RIR_STEPS.length];
  return (
    <button
      type="button"
      className={`rir-btn tabular ${has ? 'is-set' : ''}`}
      onClick={() => onChange(next)}
      aria-label={`${label}: ${has ? `${value} reps in reserve` : 'not set'}. Tap to change`}
    >
      {has ? value : '–'}
    </button>
  );
}

function ExerciseCardImpl({ entry, onEdit, live, unit = 'kg', last, today }) {
  const { sets } = entry;

  const setField = (i, field, value) =>
    onEdit(entry.exerciseId, (e) => {
      if (field === 'rir' && value === null) delete e.sets[i].rir;
      else e.sets[i][field] = value;
    });

  const canFill = last && sets.some((s) => s.weight === null && s.reps === null);
  const fill = () => onEdit(entry.exerciseId, (e) => fillFromLast(e, last));

  return (
    <article className="glass-panel exercise-card">
      <header className="exercise-head">
        <div className="exercise-title">
          <h3>{entry.name}</h3>
          {live && <LiveRankPill live={live} />}
        </div>
      </header>

      {last && (
        <div className="last-time">
          <span className="last-time-label">Last time · {relativeLabel(last.date, today)}</span>
          <span className="last-time-sets tabular">
            {last.sets.map((s, i) => (
              <span key={i} className="last-set">
                {s.weight > 0 ? `${shown(s.weight, unit)} × ${s.reps}` : `${s.reps} reps`}
              </span>
            ))}
          </span>
          {canFill && (
            <button type="button" className="mini-btn last-time-fill" onClick={fill}>
              Use
            </button>
          )}
        </div>
      )}

      <div className="set-table" role="table" aria-label={`${entry.name} sets`}>
        <div className="set-row set-row-head" role="row">
          <span role="columnheader" className="col-num">Set</span>
          <span role="columnheader" className="col-weight">Weight ({unit})</span>
          <span role="columnheader" className="col-reps">Reps</span>
          <span role="columnheader" className="col-rir" title="Reps in reserve: how many more you could have done">
            RIR
          </span>
          <span role="columnheader" className="col-spot">Spotted</span>
        </div>
        {sets.map((set, i) => (
          <div className={`set-row ${set.spotted ? 'is-spotted' : ''}`} role="row" key={i}>
            <span className="set-num tabular" role="cell">
              <span className="set-num-word">Set </span>
              {i + 1}
            </span>
            <div role="cell" className="col-weight">
              <Stepper
                value={shown(set.weight, unit)}
                decimal
                step={unit === 'lbs' ? 2.5 : 1}
                label={`Set ${i + 1} weight`}
                onChange={(v) => setField(i, 'weight', stored(v, unit))}
              />
            </div>
            <div role="cell" className="col-reps">
              <Stepper value={set.reps} step={1} label={`Set ${i + 1} reps`} onChange={(v) => setField(i, 'reps', v)} />
            </div>
            <div className="set-extras">
              <div role="cell" className="cell-center col-rir">
                <span className="cell-label" aria-hidden>
                  RIR
                </span>
                <RirCell value={set.rir} label={`Set ${i + 1} RIR`} onChange={(v) => setField(i, 'rir', v)} />
              </div>
              <div role="cell" className="cell-center col-spot">
                <span className="cell-label" aria-hidden>
                  Spotted
                </span>
                <GlassCheckbox
                  checked={set.spotted}
                  label={`Set ${i + 1} spotted`}
                  onChange={(v) => setField(i, 'spotted', v)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export const ExerciseCard = memo(ExerciseCardImpl);
