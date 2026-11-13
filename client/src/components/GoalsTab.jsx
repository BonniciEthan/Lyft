import { useEffect, useState } from 'react';
import { formatShortDate } from '../lib/dates.js';
import { uid } from '../lib/storage.js';
import { GlassCheckbox, NumberCell, Stepper, formatNumber } from './Controls.jsx';
import { PlusIcon, TrashIcon } from './Icons.jsx';
import { Modal } from './Modal.jsx';

function progressOf(goal) {
  const { startPR, currentPR, targetPR } = goal;
  if (targetPR <= 0) return 0;
  if (targetPR > startPR) return Math.min(1, Math.max(0, (currentPR - startPR) / (targetPR - startPR)));
  return currentPR >= targetPR ? 1 : Math.min(1, Math.max(0, currentPR / targetPR));
}

function GoalCard({ goal, onChange, onDelete }) {
  const [notes, setNotes] = useState(goal.notes);
  const [name, setName] = useState(goal.exercise);
  useEffect(() => setNotes(goal.notes), [goal.notes]);
  useEffect(() => setName(goal.exercise), [goal.exercise]);

  const pct = progressOf(goal);
  const remaining = Math.max(0, goal.targetPR - goal.currentPR);

  return (
    <article className={`glass-panel goal-card ${goal.achieved ? 'is-achieved' : ''}`}>
      <header className="goal-head">
        <GlassCheckbox
          checked={goal.achieved}
          tone="emerald"
          label={`${goal.exercise} achieved`}
          onChange={(v) => onChange((g) => (g.achieved = v))}
        />
        <input
          className="inline-input goal-title"
          value={name}
          aria-label="Exercise name"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const t = name.trim();
            if (!t) setName(goal.exercise);
            else if (t !== goal.exercise) onChange((g) => (g.exercise = t));
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <button type="button" className="icon-btn glass-btn danger" onClick={onDelete} aria-label="Delete goal">
          <TrashIcon width={18} height={18} />
        </button>
      </header>

      <div className="goal-metrics">
        <div className="metric">
          <span className="metric-label">Current PR (kg)</span>
          <Stepper
            value={goal.currentPR}
            decimal
            label="Current PR"
            onChange={(v) => onChange((g) => (g.currentPR = v ?? 0))}
          />
        </div>
        <div className="metric">
          <span className="metric-label">Target PR (kg)</span>
          <div className="metric-value">
            <NumberCell
              value={goal.targetPR}
              decimal
              label="Target PR"
              className="num-lg"
              onChange={(v) => onChange((g) => (g.targetPR = v ?? 0))}
            />
          </div>
        </div>
      </div>

      <div className="progress">
        <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
          <div className="progress-fill" style={{ transform: `scaleX(${pct})` }} />
        </div>
        <div className="progress-meta tabular">
          <span>{Math.round(pct * 100)}%</span>
          <span>
            {goal.achieved || remaining === 0
              ? 'Target reached'
              : `${formatNumber(remaining)} kg to go · from ${formatNumber(goal.startPR)}`}
          </span>
        </div>
      </div>

      <div className="goal-fields">
        <label className="field compact">
          <span className="field-label">Target date</span>
          <input
            className="glass-input tabular"
            type="date"
            value={goal.targetDate}
            onChange={(e) => onChange((g) => (g.targetDate = e.target.value))}
          />
        </label>
        <label className="field compact grow">
          <span className="field-label">Notes</span>
          <input
            className="glass-input"
            value={notes}
            maxLength={120}
            placeholder="Short note"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== goal.notes && onChange((g) => (g.notes = notes))}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </label>
      </div>
      {goal.targetDate && <p className="goal-date tabular">Due {formatShortDate(goal.targetDate)}</p>}
    </article>
  );
}

const EMPTY_FORM = { exercise: '', currentPR: '', targetPR: '', targetDate: '', notes: '' };

function AddGoalModal({ open, onClose, onAdd }) {
  const [form, setForm] = useState(EMPTY_FORM);
  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const parse = (v) => {
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  };
  const current = parse(form.currentPR);
  const target = parse(form.targetPR);
  const valid = form.exercise.trim() && current !== null && target !== null && target > 0;

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    onAdd({
      id: uid('goal'),
      exercise: form.exercise.trim(),
      startPR: current,
      currentPR: current,
      targetPR: target,
      targetDate: form.targetDate,
      notes: form.notes.trim(),
      achieved: current >= target,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Goal"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="add-goal-form" className="btn btn-primary" disabled={!valid}>
            Add Goal
          </button>
        </>
      }
    >
      <form id="add-goal-form" className="form-grid" onSubmit={submit}>
        <label className="field full">
          <span className="field-label">Exercise / Lift</span>
          <input className="glass-input" autoFocus value={form.exercise} onChange={set('exercise')} placeholder="e.g. Squats" maxLength={60} />
        </label>
        <label className="field">
          <span className="field-label">Current PR (kg)</span>
          <input className="glass-input tabular" inputMode="decimal" value={form.currentPR} onChange={set('currentPR')} placeholder="0" />
        </label>
        <label className="field">
          <span className="field-label">Target PR (kg)</span>
          <input className="glass-input tabular" inputMode="decimal" value={form.targetPR} onChange={set('targetPR')} placeholder="100" />
        </label>
        <label className="field full">
          <span className="field-label">Target date (optional)</span>
          <input className="glass-input tabular" type="date" value={form.targetDate} onChange={set('targetDate')} />
        </label>
        <label className="field full">
          <span className="field-label">Notes</span>
          <input className="glass-input" value={form.notes} onChange={set('notes')} placeholder="Short note" maxLength={120} />
        </label>
      </form>
    </Modal>
  );
}

export function GoalsTab({ state, update, askConfirm }) {
  const [adding, setAdding] = useState(false);

  const change = (id, mutate) =>
    update((d) => {
      const g = d.goals.find((x) => x.id === id);
      if (g) mutate(g);
    });

  const remove = async (goal) => {
    const ok = await askConfirm({
      title: 'Delete goal?',
      message: `Remove the "${goal.exercise}" goal?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) update((d) => void (d.goals = d.goals.filter((g) => g.id !== goal.id)));
  };

  const sorted = [...state.goals].sort((a, b) => Number(a.achieved) - Number(b.achieved));

  return (
    <section className="tab-goals">
      <div className="section-head">
        <h1>Goals &amp; PRs</h1>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          <PlusIcon width={18} height={18} /> Add Goal
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="glass-panel empty-card">
          <h2>No goals yet</h2>
          <p>Add a lift you want to push.</p>
        </div>
      ) : (
        <div className="goal-list">
          {sorted.map((g) => (
            <GoalCard key={g.id} goal={g} onChange={(m) => change(g.id, m)} onDelete={() => remove(g)} />
          ))}
        </div>
      )}

      <AddGoalModal open={adding} onClose={() => setAdding(false)} onAdd={(g) => update((d) => void d.goals.push(g))} />
    </section>
  );
}
