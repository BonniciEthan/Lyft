import { useEffect, useMemo, useState } from 'react';
import { WEEKDAYS, todayKey, weekdayName } from '../lib/dates.js';
import { uid } from '../lib/storage.js';
import { Segmented } from './Controls.jsx';
import { ArrowDown, ArrowUp, PlusIcon, SearchIcon, TrashIcon } from './Icons.jsx';
import { Modal } from './Modal.jsx';
import { MUSCLES, MUSCLE_NAME, classifyExercise, searchLibrary } from '../lib/rankingEngine.js';
import { allExercises, mergeExercises } from '../lib/history.js';

const SET_OPTIONS = [
  { value: 2, label: '2 sets' },
  { value: 3, label: '3 sets' },
];

/** Searchable built-in exercise library with muscle filters. */
function LibraryModal({ open, onClose, category, existing, onAdd }) {
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('');
  useEffect(() => {
    if (open) {
      setQuery('');
      setMuscle('');
    }
  }, [open]);
  const results = useMemo(() => (open ? searchLibrary(query, muscle) : []), [open, query, muscle]);
  return (
    <Modal open={open} onClose={onClose} title={`Add to ${category}`} size="sheet">
      <label className="search-field">
        <SearchIcon width={18} height={18} />
        <input
          className="glass-input"
          type="search"
          placeholder="Search exercises, e.g. bench, curl, row"
          value={query}
          aria-label="Search exercise library"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="chip-row library-filters" role="tablist" aria-label="Muscle group">
        <button type="button" role="tab" aria-selected={!muscle} className={`chip chip-sm ${!muscle ? 'is-active' : ''}`} onClick={() => setMuscle('')}>
          All
        </button>
        {MUSCLES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={muscle === m.id}
            className={`chip chip-sm ${muscle === m.id ? 'is-active' : ''}`}
            onClick={() => setMuscle(m.id)}
          >
            {m.name}
          </button>
        ))}
      </div>
      {results.length ? (
        <ul className="library-list">
          {results.map((ex) => {
            const added = existing.has(ex.name.toLowerCase());
            return (
              <li key={ex.id}>
                <button type="button" className="library-row" disabled={added} onClick={() => onAdd(ex)}>
                  <span className="library-name">{ex.name}</span>
                  <span className="library-tags">
                    <span className="muscle-tag">{MUSCLE_NAME[ex.muscle]}</span>
                    {ex.secondary.map((s) => (
                      <span key={s} className="muscle-tag is-secondary">
                        {MUSCLE_NAME[s]}
                      </span>
                    ))}
                    {ex.bodyweight && <span className="muscle-tag is-secondary">Bodyweight</span>}
                  </span>
                  <span className="library-add">{added ? 'Added' : '+ Add'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted empty-line">No library exercise matches. Close this and type your own name instead.</p>
      )}
    </Modal>
  );
}

/** Pick another exercise whose logged history should be folded into `target`. */
function MergeModal({ target, candidates, onClose, onMerge }) {
  return (
    <Modal open={Boolean(target)} onClose={onClose} title="Merge history" size="sheet">
      {target && (
        <>
          <p className="field-hint">
            Pick the exercise to fold into <strong>{target.name}</strong>. All of its logged sets move over and it is removed from your
            routines.
          </p>
          {candidates.length ? (
            <ul className="library-list">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button type="button" className="library-row" onClick={() => onMerge(c)}>
                    <span className="library-name">{c.name}</span>
                    <span className="library-tags">
                      <span className="muscle-tag is-secondary">{c.inRoutine ? c.category : 'No longer in a routine'}</span>
                      <span className="muscle-tag is-secondary">
                        {c.sessions} session{c.sessions === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span className="library-add">Merge</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted empty-line">There are no other exercises to merge.</p>
          )}
        </>
      )}
    </Modal>
  );
}

function ExerciseRow({ exercise, category, index, total, onRename, onSets, onMove, onDelete, onMuscle, onMerge }) {
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
  const auto = classifyExercise(exercise.name, category);
  const autoLabel = auto.excluded ? 'not ranked' : MUSCLE_NAME[auto.muscle] || 'none found';
  const needsMuscle = !auto.excluded && !auto.muscle && !exercise.muscle;

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
      <div className="routine-row-meta">
        <label className={`muscle-pick ${needsMuscle ? 'needs-muscle' : ''}`}>
          <span className="muscle-pick-label">Muscle</span>
          <select
            className="muscle-select"
            value={exercise.muscle || ''}
            aria-label={`Muscle group for ${exercise.name}`}
            onChange={(e) => onMuscle(e.target.value)}
            disabled={auto.excluded}
          >
            <option value="">Auto ({autoLabel})</option>
            {MUSCLES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="link-btn" onClick={onMerge}>
          Merge history…
        </button>
      </div>
      {needsMuscle && <p className="field-hint muscle-warning">Lyft doesn’t recognise this name, so it counts towards no muscle rank. Pick a muscle.</p>}
    </li>
  );
}

export function SplitTab({ state, update, askConfirm, toast }) {
  const categories = Object.keys(state.workouts);
  const [active, setActive] = useState(categories[0] || '');
  const [newName, setNewName] = useState('');
  const [newSets, setNewSets] = useState(3);
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState(null);

  useEffect(() => {
    if (!state.workouts[active]) setActive(Object.keys(state.workouts)[0] || '');
  }, [state.workouts, active]);

  const exercises = state.workouts[active] || [];
  const todayName = weekdayName(todayKey());

  const setDay = (day, value) =>
    update((d) => {
      d.split[day] = value;
    });

  const pushExercise = (name) => {
    update((d) => {
      d.workouts[active].push({ id: uid(active.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'ex'), name, defaultSets: newSets });
    });
  };

  const addExercise = (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !active) return;
    pushExercise(name);
    setNewName('');
    setNewSets(3);
  };

  const existingNames = useMemo(() => new Set(exercises.map((ex) => ex.name.toLowerCase())), [exercises]);
  const suggestions = useMemo(() => {
    const q = newName.trim();
    if (q.length < 2) return [];
    return searchLibrary(q)
      .filter((ex) => ex.name.toLowerCase() !== q.toLowerCase())
      .slice(0, 5);
  }, [newName]);

  const setMuscle = (id, muscle) =>
    update((d) => {
      const ex = d.workouts[active].find((x) => x.id === id);
      if (!ex) return;
      if (muscle) ex.muscle = muscle;
      else delete ex.muscle;
    });

  const mergeCandidates = useMemo(
    () => (mergeTarget ? allExercises(state).filter((e) => e.id !== mergeTarget.id) : []),
    [state, mergeTarget]
  );

  const merge = async (from) => {
    const into = mergeTarget;
    const ok = await askConfirm({
      title: 'Merge exercises?',
      message: `Move every logged set of "${from.name}" into "${into.name}"${from.inRoutine ? ` and remove "${from.name}" from ${from.category}` : ''}?`,
      confirmLabel: 'Merge',
    });
    if (!ok) return;
    setMergeTarget(null);
    update((d) => mergeExercises(d, from.id, into.id), { undo: `Merged ${from.name} into ${into.name}` });
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
      update(
        (d) => {
          d.workouts[active] = d.workouts[active].filter((x) => x.id !== ex.id);
        },
        { undo: `Deleted ${ex.name}` }
      );
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
    update(
      (d) => {
        delete d.workouts[victim];
        for (const day of WEEKDAYS) if (d.split[day] === victim) d.split[day] = 'Rest';
      },
      { undo: `Deleted ${victim}` }
    );
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
                    category={active}
                    onMuscle={(muscle) => setMuscle(ex.id, muscle)}
                    onMerge={() => setMergeTarget(ex)}
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
              {suggestions.length > 0 && (
                <div className="suggest-row" aria-label="Library suggestions">
                  {suggestions.map((ex) => (
                    <button key={ex.id} type="button" className="chip chip-sm" onClick={() => setNewName(ex.name)}>
                      {ex.name}
                      <span className="chip-count">{MUSCLE_NAME[ex.muscle]}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="add-exercise-row">
                <Segmented small options={SET_OPTIONS} value={newSets} onChange={setNewSets} label="Default sets for new exercise" />
                <button type="submit" className="btn btn-primary" disabled={!newName.trim()}>
                  <PlusIcon width={18} height={18} /> Add Exercise
                </button>
              </div>
              <button type="button" className="btn btn-glass btn-subtle library-open" onClick={() => setLibraryOpen(true)}>
                <SearchIcon width={16} height={16} /> Browse exercise library
              </button>
            </form>
          </>
        ) : (
          <p className="muted empty-line">Add a category to start building routines.</p>
        )}
      </div>

      <LibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        category={active}
        existing={existingNames}
        onAdd={(ex) => {
          pushExercise(ex.name);
          toast?.(`Added ${ex.name} to ${active}`);
        }}
      />
      <MergeModal target={mergeTarget} candidates={mergeCandidates} onClose={() => setMergeTarget(null)} onMerge={merge} />
    </section>
  );
}
