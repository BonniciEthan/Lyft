import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, formatDate, relativeLabel, todayKey, weekdayName } from '../lib/dates.js';
import { ExerciseCard } from './ExerciseCard.jsx';
import { ChevronLeft, ChevronRight } from './Icons.jsx';
import { IS_LOCAL } from '../edition.js';
import { computeRanks, diffRanks } from '../lib/rankingEngine.js';
import { liveRankStatus } from '../lib/liveRank.js';
import { hasBodyweight, normalizeProfile } from '../lib/lifterProfileStore.js';
import { RankUpModal } from './RankUpModal.jsx';
import { lastSessions } from '../lib/history.js';
import { badgeClass, fitSets, freshEntry, scheduledFor } from '../lib/splitDays.js';

/**
 * Entries shown for a date.
 * - No log: fresh empty rows from the routine template.
 * - Log for today/future: follow the current template order (picking up newly added
 *   exercises and renames). Exercises deleted in My Split are already gone from today's
 *   log (see syncLogToRoutine); entries that were never in the routine stay at the end.
 * - Log in the past: exactly what was saved.
 */
function buildEntries(template, log, followTemplate) {
  if (!log) return template.map(freshEntry);
  if (!followTemplate) return log.exercises;
  const byId = new Map(log.exercises.map((e) => [e.exerciseId, e]));
  const ordered = template.map((ex) => {
    const existing = byId.get(ex.id);
    return existing ? { ...existing, name: ex.name, sets: fitSets(existing.sets, ex.defaultSets) } : freshEntry(ex);
  });
  const templateIds = new Set(template.map((ex) => ex.id));
  return [...ordered, ...log.exercises.filter((e) => !templateIds.has(e.exerciseId))];
}

export function ProgressTab({ state, update, askConfirm, onNavigate, toast }) {
  const today = todayKey();
  const [date, setDate] = useState(today);
  const [direction, setDirection] = useState(0);
  const [showTrainPicker, setShowTrainPicker] = useState(false);
  const touch = useRef(null);

  const log = state.logs[date];
  const weekday = weekdayName(date);
  const scheduled = scheduledFor(state.split, state.rotations, date);
  const category = log ? log.category : scheduled;
  const template = state.workouts[category];
  const isRest = !log && (category === 'Rest' || !template);
  const categories = Object.keys(state.workouts);
  const isToday = date === today;

  const entries = useMemo(
    () => (isRest ? [] : buildEntries(template || [], log, date >= today)),
    [isRest, template, log, date, today]
  );

  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  // Rank baseline = everything logged before this day, so the pill shows what today adds.
  const profile = useMemo(() => normalizeProfile(state.profile), [state.profile]);
  const rankReady = hasBodyweight(profile);
  const baseline = useMemo(
    () => (rankReady ? computeRanks({ workouts: state.workouts, logs: state.logs }, profile, { before: date }) : null),
    [rankReady, state.workouts, state.logs, profile, date]
  );
  const [rankUp, setRankUp] = useState(null);
  const lastByExercise = useMemo(() => lastSessions(state.logs, date), [state.logs, date]);

  const finishWorkout = () => {
    if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
    // Let a pending inline edit commit before comparing.
    setTimeout(() => {
      if (!rankReady) {
        toast?.('Workout logged. Add your bodyweight in Rank to track rank-ups.');
        return;
      }
      const after = computeRanks(stateRef.current, profile, { through: date });
      const diff = diffRanks(baseline, after);
      if (diff.any) setRankUp(diff);
      else toast?.('Workout logged. No rank changes this time.');
    }, 0);
  };
  const stateRef = useRef(state);
  stateRef.current = state;

  const go = useCallback((delta) => {
    setDirection(delta);
    setShowTrainPicker(false);
    setDate((d) => addDays(d, delta));
  }, []);

  const goToday = () => {
    setDirection(date < today ? 1 : -1);
    setShowTrainPicker(false);
    setDate(today);
  };

  // Desktop: arrow keys flip days when not typing.
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
    if (e.touches.length !== 1 || e.target.closest('input, textarea, select')) {
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
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - start.time < 900) {
      go(dx > 0 ? -1 : 1); // swipe right = back in time
    }
  };

  const editEntry = useCallback(
    (exerciseId, mutate, opts) => {
      const cat = category;
      update((draft) => {
        let dayLog = draft.logs[date];
        const shown = entriesRef.current;
        if (!dayLog) {
          dayLog = { category: cat, exercises: JSON.parse(JSON.stringify(shown)) };
          draft.logs[date] = dayLog;
        }
        let entry = dayLog.exercises.find((e) => e.exerciseId === exerciseId);
        if (!entry) {
          const fromShown = shown.find((e) => e.exerciseId === exerciseId);
          if (!fromShown) return;
          entry = JSON.parse(JSON.stringify(fromShown));
          dayLog.exercises.push(entry);
        }
        const tpl = draft.workouts[dayLog.category]?.find((ex) => ex.id === exerciseId);
        if (tpl && date >= todayKey()) {
          entry.name = tpl.name;
          entry.sets = fitSets(entry.sets, tpl.defaultSets);
        }
        mutate(entry);
      }, opts);
    },
    [category, date, update]
  );

  const trainAnyway = (cat) => {
    update((draft) => {
      draft.logs[date] = { category: cat, exercises: (draft.workouts[cat] || []).map(freshEntry) };
    });
    setShowTrainPicker(false);
  };

  const clearDay = async () => {
    const ok = await askConfirm({
      title: 'Clear this day?',
      message: `Remove the ${log.category} session logged for ${formatDate(date)}?`,
      confirmLabel: 'Clear',
      destructive: true,
    });
    if (ok) {
      update(
        (draft) => {
          delete draft.logs[date];
        },
        { undo: `Cleared ${formatDate(date)}` }
      );
    }
  };

  const badge = isRest ? 'Rest' : category;
  const offSchedule = log && log.category !== scheduled;

  return (
    <section className="tab-progress" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="calendar-bar glass-panel">
        <button type="button" className="icon-btn cal-arrow" onClick={() => go(-1)} aria-label="Previous day">
          <ChevronLeft />
        </button>
        <div className="cal-center">
          <div className="cal-title">
            <span className="cal-relative">{relativeLabel(date, today)}</span>
            <span className={`split-badge ${badgeClass(badge)}`}>{badge}</span>
          </div>
          <div className="cal-date tabular">{formatDate(date)}</div>
        </div>
        <button type="button" className="icon-btn cal-arrow" onClick={() => go(1)} aria-label="Next day">
          <ChevronRight />
        </button>
      </div>

      <div className="cal-sub">
        {!isToday && (
          <button type="button" className="today-pill glass-panel" onClick={goToday}>
            Today
          </button>
        )}
        {offSchedule && <span className="cal-note">Scheduled: {scheduled}</span>}
        {log && (
          <button type="button" className="link-btn" onClick={clearDay}>
            Clear day
          </button>
        )}
      </div>

      <div key={date} className={`day-content slide-${direction > 0 ? 'left' : direction < 0 ? 'right' : 'none'}`}>
        {IS_LOCAL && isRest && Object.values(state.workouts).every((list) => list.length === 0) ? (
          <div className="glass-panel rest-card">
            <div className="rest-orb" aria-hidden />
            <h2>Welcome</h2>
            <p>Add your exercises and plan your week in My Split. Your workouts will show up here.</p>
            <button type="button" className="btn btn-primary" onClick={() => onNavigate?.('split')}>
              Set up My Split
            </button>
          </div>
        ) : isRest ? (
          <div className="glass-panel rest-card">
            <div className="rest-orb" aria-hidden />
            <h2>Rest Day</h2>
            <p>
              {category !== 'Rest' && !template
                ? `"${category}" no longer exists in your split.`
                : `${weekday} is scheduled for recovery.`}
            </p>
            {categories.length > 0 &&
              (showTrainPicker ? (
                <div className="train-picker">
                  {categories.map((c) => (
                    <button key={c} type="button" className="chip" onClick={() => trainAnyway(c)}>
                      {c}
                    </button>
                  ))}
                  <button type="button" className="chip chip-ghost" onClick={() => setShowTrainPicker(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn-glass btn-subtle" onClick={() => setShowTrainPicker(true)}>
                  Train Anyway
                </button>
              ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="glass-panel empty-card">
            <h2>No exercises</h2>
            <p>Add exercises to {category} in My Split.</p>
          </div>
        ) : (
          <div className="exercise-list">
            {entries.map((entry) => (
              <ExerciseCard
                key={entry.exerciseId}
                entry={entry}
                onEdit={editEntry}
                live={baseline ? liveRankStatus(entry, baseline.byId[entry.exerciseId], profile, category) : null}
                unit={profile.unit}
                last={lastByExercise.get(entry.exerciseId)}
                today={today}
              />
            ))}
            {log && date <= today && (
              <button type="button" className="btn btn-primary finish-btn" onClick={finishWorkout}>
                Finish Workout
              </button>
            )}
          </div>
        )}
      </div>
      <RankUpModal diff={rankUp} unit={profile.unit} onClose={() => setRankUp(null)} />
    </section>
  );
}
