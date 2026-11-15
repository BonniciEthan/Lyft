import { memo } from 'react';
import { GlassCheckbox, Stepper } from './Controls.jsx';
import { RankCrest } from './TierCrest.jsx';

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

function ExerciseCardImpl({ entry, onEdit, live }) {
  const { sets } = entry;

  const setField = (i, field, value) =>
    onEdit(entry.exerciseId, (e) => {
      e.sets[i][field] = value;
    });

  const addSet = () =>
    onEdit(entry.exerciseId, (e) => {
      const last = e.sets[e.sets.length - 1];
      e.sets.push({ weight: last ? last.weight : null, reps: last ? last.reps : null, spotted: false });
    });

  const removeSet = () =>
    onEdit(entry.exerciseId, (e) => {
      if (e.sets.length > 1) e.sets.pop();
    });

  return (
    <article className="glass-panel exercise-card">
      <header className="exercise-head">
        <div className="exercise-title">
          <h3>{entry.name}</h3>
          {live && <LiveRankPill live={live} />}
        </div>
        <div className="set-count" aria-label="Number of sets">
          <button type="button" className="mini-btn" onClick={removeSet} disabled={sets.length <= 1} aria-label="Remove set">
            − Set
          </button>
          <span className="set-count-value tabular" aria-live="polite">
            {sets.length}
          </span>
          <button type="button" className="mini-btn" onClick={addSet} aria-label="Add set">
            + Set
          </button>
        </div>
      </header>

      <div className="set-table" role="table" aria-label={`${entry.name} sets`}>
        <div className="set-row set-row-head" role="row">
          <span role="columnheader">Set</span>
          <span role="columnheader">Weight (kg)</span>
          <span role="columnheader">Reps</span>
          <span role="columnheader">Spotted</span>
        </div>
        {sets.map((set, i) => (
          <div className={`set-row ${set.spotted ? 'is-spotted' : ''}`} role="row" key={i}>
            <span className="set-num tabular" role="cell">
              {i + 1}
            </span>
            <div role="cell">
              <Stepper
                value={set.weight}
                decimal
                step={1}
                label={`Set ${i + 1} weight`}
                onChange={(v) => setField(i, 'weight', v)}
              />
            </div>
            <div role="cell">
              <Stepper value={set.reps} step={1} label={`Set ${i + 1} reps`} onChange={(v) => setField(i, 'reps', v)} />
            </div>
            <div role="cell" className="cell-center">
              <GlassCheckbox
                checked={set.spotted}
                label={`Set ${i + 1} spotted`}
                onChange={(v) => setField(i, 'spotted', v)}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export const ExerciseCard = memo(ExerciseCardImpl);
