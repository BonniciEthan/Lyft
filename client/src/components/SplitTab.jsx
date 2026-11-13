import { useEffect, useState } from 'react';
import { WEEKDAYS, todayKey, weekdayName } from '../lib/dates.js';
import { uid } from '../lib/storage.js';
import { Segmented } from './Controls.jsx';
import { ArrowDown, ArrowUp, PlusIcon, TrashIcon } from './Icons.jsx';

const SET_OPTIONS = [
  { value: 2, label: '2 sets' },
  { value: 3, label: '3 sets' },
];

function ExerciseRow({ exercise, index, total, onRename, onSets, onMove, onDelete }) {
  const [name, setName] = useState(exercise.name);
  useEffect(() => setName(exercise.name), [exercise.name]);

  const commit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(exercise.name);
      return;
    }
    if (trimmed !== exercise.name) onRename(trimmed);
  };

  const setsValue = exercise.defaultSets === 2 ? 2 : 3;

  return (
    <li className="routine-row">
      <div className="routine-row-top">
        <span className="routine-index tabular">{index + 1}</span>
        <input
          className="inline-input"
          value={name}
          aria-label={`Exercise ${index + 1} name`}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setName(exercise.name);
              e.currentTarget.blur();
            }
          }}
        />
      </div>
      <div className="routine-row-actions">
        <Segmented small options={SET_OPTIONS} value={setsValue} onChange={onSets} label="Default sets" />
        <div className="routine-buttons">
          <button type="button" className="icon-btn glass-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">
            <ArrowUp width={18} height={18} />
          </button>
          <button
            type="button"
            className="icon-btn glass-btn"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Move down"
          >
            <ArrowDown width={18} height={18} />
          </button>
          <button type="button" className="icon-btn glass-btn danger" onClick={onDelete} aria-label="Delete exercise">
            <TrashIcon width={18} height={18} />
          </button>
        </div>
      </div>
    </li>
  );
}

export function SplitTab({ state, update, askConfirm }) {
  const categories = Object.keys(state.workouts);
  const [active, setActive] = useState(categories[0] || '');
  const [newName, setNewName] = useState('');
  const [newSets, setNewSets] = useState(3);
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');

  useEffect(() => {
    if (!state.workouts[active]) setActive(Object.keys(state.workouts)[0] || '');
  }, [state.workouts, active]);

  const exercises = state.workouts[active] || [];
  const todayName = weekdayName(todayKey());

  const setDay = (day, value) =>
    update((d) => {
      d.split[day] = value;
    });

  const addExercise = (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !active) return;
    update((d) => {
      d.workouts[active].push({ id: uid(active.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'ex'), name, defaultSets: newSets });
    });
    setNewName('');
    setNewSets(3);
  };

  const rename = (id, name) =>
    update((d) => {
      const ex = d.workouts[active].find((x) => x.id === id);
      if (ex) ex.name = name;
    });

  const setSets = (id, sets) =>
    update((d) => {
      const ex = d.workouts[active].find((x) => x.id === id);
      if (ex) ex.defaultSets = sets;
    });

  const move = (index, delta) =>
    update((d) => {
      const list = d.workouts[active];
      const target = index + delta;
      if (target < 0 || target >= list.length) return;
      [list[index], list[target]] = [list[target], list[index]];
    });

  const remove = async (ex) => {
    const ok = await askConfirm({
      title: 'Delete exercise?',
      message: `Remove "${ex.name}" from ${active}? Past logged sessions are kept.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) {
      update((d) => {
        d.workouts[active] = d.workouts[active].filter((x) => x.id !== ex.id);
      });
    }
  };

  const addCategory = (e) => {
    e.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    if (name.toLowerCase() === 'rest') {
      setCategoryError('"Rest" is reserved.');
      return;
    }
    if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setCategoryError('That category already exists.');
      return;
    }
    update((d) => {
      d.workouts[name] = [];
    });
    setActive(name);
    setCategoryName('');
    setCategoryError('');
    setAddingCategory(false);
  };

  const deleteCategory = async () => {
    const days = WEEKDAYS.filter((day) => state.split[day] === active);
    const ok = await askConfirm({
      title: `Delete ${active}?`,
      message: `This removes the ${active} routine${
        days.length ? ` and sets ${days.join(', ')} to Rest` : ''
      }. Past logged sessions are kept.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    const victim = active;
    update((d) => {
      delete d.workouts[victim];
      for (const day of WEEKDAYS) if (d.split[day] === victim) d.split[day] = 'Rest';
    });
  };

  return (
    <section className="tab-split">
      <div className="glass-panel card">
        <div className="card-head">
          <h2>Weekly Schedule</h2>
        </div>
        <ul className="schedule-list">
          {WEEKDAYS.map((day) => {
            const value = state.split[day];
            return (
              <li key={day} className={`schedule-row ${day === todayName ? 'is-today' : ''}`}>
                <span className="schedule-day">
                  {day}
                  {day === todayName && <span className="today-dot" aria-label="today" />}
                </span>
                <div className={`glass-select-wrap badge-${value.toLowerCase()}`}>
                  <select
                    className="glass-select"
                    value={value}
                    aria-label={`${day} workout`}
                    onChange={(e) => setDay(day, e.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="Rest">Rest</option>
                  </select>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="glass-panel card">
        <div className="card-head">
          <h2>Routines</h2>
          {active && (
            <button type="button" className="link-btn danger-text" onClick={deleteCategory}>
              Delete {active}
            </button>
          )}
        </div>

        <div className="chip-row" role="tablist" aria-label="Workout categories">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={c === active}
              className={`chip ${c === active ? 'is-active' : ''}`}
              onClick={() => setActive(c)}
            >
              {c}
              <span className="chip-count tabular">{state.workouts[c].length}</span>
            </button>
          ))}
          {!addingCategory && (
            <button type="button" className="chip chip-ghost" onClick={() => setAddingCategory(true)}>
              <PlusIcon width={16} height={16} /> Add Category
            </button>
          )}
        </div>

        {addingCategory && (
          <form className="inline-form" onSubmit={addCategory}>
            <input
              className="glass-input"
              autoFocus
              placeholder="Category name (e.g. Arms)"
              value={categoryName}
              onChange={(e) => {
                setCategoryName(e.target.value);
                setCategoryError('');
              }}
              maxLength={24}
            />
            <button type="submit" className="btn btn-primary" disabled={!categoryName.trim()}>
              Add
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setAddingCategory(false);
                setCategoryName('');
                setCategoryError('');
              }}
            >
              Cancel
            </button>
            {categoryError && <span className="field-error full">{categoryError}</span>}
          </form>
        )}

        {active ? (
          <>
            {exercises.length === 0 ? (
              <p className="muted empty-line">No exercises in {active} yet.</p>
            ) : (
              <ul className="routine-list">
                {exercises.map((ex, i) => (
                  <ExerciseRow
                    key={ex.id}
                    exercise={ex}
                    index={i}
                    total={exercises.length}
                    onRename={(name) => rename(ex.id, name)}
                    onSets={(sets) => setSets(ex.id, sets)}
                    onMove={(delta) => move(i, delta)}
                    onDelete={() => remove(ex)}
                  />
                ))}
              </ul>
            )}

            <form className="add-exercise" onSubmit={addExercise}>
              <input
                className="glass-input"
                placeholder={`Add exercise to ${active}`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={60}
              />
              <div className="add-exercise-row">
                <Segmented small options={SET_OPTIONS} value={newSets} onChange={setNewSets} label="Default sets for new exercise" />
                <button type="submit" className="btn btn-primary" disabled={!newName.trim()}>
                  <PlusIcon width={18} height={18} /> Add Exercise
                </button>
              </div>
            </form>
          </>
        ) : (
          <p className="muted empty-line">Add a category to start building routines.</p>
        )}
      </div>
    </section>
  );
}
