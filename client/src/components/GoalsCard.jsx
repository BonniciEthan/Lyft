import { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal.jsx';
import { CheckIcon, EditIcon, PlusIcon, TrashIcon } from './Icons.jsx';
import { allExercises, bestWeights, goalProgress } from '../lib/history.js';
import { formatWeight, fromKg, parseWeightInput, roundForUnit } from '../lib/lifterProfileStore.js';
import { daysBetween, formatShortDate, todayKey } from '../lib/dates.js';
import { uid } from '../lib/storage.js';

const numText = (v) => /^\d*([.,]\d{0,2})?$/.test(v);
const show = (kg, unit) => (kg > 0 ? String(roundForUnit(fromKg(kg, unit), unit)) : '');

function GoalModal({ open, goal, unit, exercises, bests, onClose, onSave }) {
  const [form, setForm] = useState({ exercise: '', start: '', target: '', targetDate: '', notes: '' });
  useEffect(() => {
    if (!open) return;
    setForm({
      exercise: goal?.exercise || '',
      start: show(goal?.startPR, unit),
      target: show(goal?.targetPR, unit),
      targetDate: goal?.targetDate || '',
      notes: goal?.notes || '',
    });
  }, [open, goal, unit]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setNum = (k) => (e) => numText(e.target.value) && setForm((f) => ({ ...f, [k]: e.target.value }));

  const loggedKg = bests.get(form.exercise.trim().toLowerCase()) || 0;
  const targetKg = parseWeightInput(form.target, unit);
  const startKg = parseWeightInput(form.start, unit) ?? loggedKg;
  const valid = form.exercise.trim() && targetKg;

  const save = () =>
    onSave({
      id: goal?.id || uid('goal'),
      exercise: form.exercise.trim(),
      startPR: startKg || 0,
      currentPR: Math.max(goal?.currentPR || 0, startKg || 0),
      targetPR: targetKg,
      targetDate: /^\d{4}-\d{2}-\d{2}$/.test(form.targetDate) ? form.targetDate : '',
      notes: form.notes.trim(),
      achieved: goal?.achieved === true,
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={goal ? 'Edit Goal' : 'New Goal'}
      size="sheet"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!valid} onClick={save}>
            Save Goal
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field full">
          <span className="field-label">Exercise</span>
          <input className="glass-input" list="goal-exercises" value={form.exercise} onChange={set('exercise')} placeholder="e.g. Flat Barbell Bench" />
          <datalist id="goal-exercises">
            {exercises.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {loggedKg > 0 && <span className="field-hint">Heaviest logged so far: {formatWeight(loggedKg, unit)}</span>}
        </label>
        <label className="field">
          <span className="field-label">Starting from</span>
          <span className="unit-input">
            <input
              className="glass-input tabular"
              inputMode="decimal"
              value={form.start}
              onChange={setNum('start')}
              placeholder={loggedKg ? show(loggedKg, unit) : '0'}
            />
            <span className="bw-unit">{unit}</span>
          </span>
        </label>
        <label className="field">
          <span className="field-label">Target</span>
          <span className="unit-input">
            <input className="glass-input tabular" inputMode="decimal" value={form.target} onChange={setNum('target')} placeholder="100" />
            <span className="bw-unit">{unit}</span>
          </span>
        </label>
        <label className="field full">
          <span className="field-label">Target date (optional)</span>
          <input className="glass-input" type="date" value={form.targetDate} onChange={set('targetDate')} />
        </label>
        <label className="field full">
          <span className="field-label">Notes (optional)</span>
          <input className="glass-input" value={form.notes} onChange={set('notes')} maxLength={120} placeholder="e.g. clean pause reps" />
        </label>
      </div>
    </Modal>
  );
}

function deadline(goal, today) {
  if (!goal.targetDate) return null;
  const left = daysBetween(today, goal.targetDate);
  const when = formatShortDate(goal.targetDate);
  if (left < 0) return { text: `Due ${when}`, late: true };
  return { text: left === 0 ? `Due today` : `${left} day${left === 1 ? '' : 's'} left · ${when}`, late: false };
}

/** Strength goals: a target weight per exercise, tracked automatically from the logs. */
export function GoalsCard({ state, update, unit }) {
  const [editing, setEditing] = useState(null); // null | 'new' | goal
  const today = todayKey();
  const bests = useMemo(() => bestWeights(state), [state]);
  const exercises = useMemo(() => [...new Set(allExercises(state).map((e) => e.name))].sort(), [state]);
  const goals = state.goals || [];

  const save = (goal) => {
    update((d) => {
      const i = d.goals.findIndex((g) => g.id === goal.id);
      if (i >= 0) d.goals[i] = goal;
      else d.goals.push(goal);
    });
    setEditing(null);
  };
  const remove = (goal) => update((d) => void (d.goals = d.goals.filter((g) => g.id !== goal.id)), { undo: `Deleted goal for ${goal.exercise}` });
  const toggle = (goal) =>
    update((d) => {
      const g = d.goals.find((x) => x.id === goal.id);
      if (g) g.achieved = !g.achieved;
    });

  return (
    <div className="glass-panel card goals-card">
      <div className="card-head">
        <h2>Goals</h2>
        <button type="button" className="pill-btn" onClick={() => setEditing('new')}>
          <PlusIcon width={16} height={16} /> Add Goal
        </button>
      </div>

      {goals.length === 0 ? (
        <p className="muted empty-line">Set a target weight for a lift. Progress fills in from the sets you log.</p>
      ) : (
        <ul className="goal-list">
          {goals.map((goal) => {
            const p = goalProgress(goal, bests);
            const due = p.done ? null : deadline(goal, today);
            return (
              <li key={goal.id} className={`goal-row ${p.done ? 'is-done' : ''}`}>
                <div className="goal-top">
                  <span className="goal-name">{goal.exercise || 'Goal'}</span>
                  {p.done && (
                    <span className="goal-badge">
                      <CheckIcon width={13} height={13} /> {p.reached ? 'Reached' : 'Done'}
                    </span>
                  )}
                  <span className="goal-actions">
                    {!p.reached && (
                      <button type="button" className="icon-btn" onClick={() => toggle(goal)} aria-label={goal.achieved ? 'Mark as not done' : 'Mark as done'}>
                        <CheckIcon width={18} height={18} />
                      </button>
                    )}
                    <button type="button" className="icon-btn" onClick={() => setEditing(goal)} aria-label={`Edit goal for ${goal.exercise}`}>
                      <EditIcon width={18} height={18} />
                    </button>
                    <button type="button" className="icon-btn" onClick={() => remove(goal)} aria-label={`Delete goal for ${goal.exercise}`}>
                      <TrashIcon width={18} height={18} />
                    </button>
                  </span>
                </div>
                <div className="goal-numbers tabular">
                  <strong>{formatWeight(p.current, unit)}</strong>
                  <span>
                    of {formatWeight(goal.targetPR, unit)} · started at {formatWeight(p.start, unit)}
                  </span>
                </div>
                <div className="progress-track">
                  <span className="progress-fill goal-fill" style={{ transform: `scaleX(${p.pct})` }} />
                </div>
                <div className="goal-foot">
                  {!p.done && <span>{formatWeight(Math.max(0, goal.targetPR - p.current), unit)} to go</span>}
                  {due && <span className={due.late ? 'danger-text' : ''}>{due.text}</span>}
                  {goal.notes && <span className="goal-notes">{goal.notes}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <GoalModal
        open={Boolean(editing)}
        goal={editing && editing !== 'new' ? editing : null}
        unit={unit}
        exercises={exercises}
        bests={bests}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    </div>
  );
}
