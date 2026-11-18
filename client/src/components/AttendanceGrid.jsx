import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildAttendanceGrid, describeDay } from '../lib/profileStats.js';
import { fromKey } from '../lib/dates.js';

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

const longDate = (key) => fromKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

/** 53-week GitHub-style attendance heatmap: one accent colour for "trained", nothing else. */
export function AttendanceGrid({ logs, split, rotations, today }) {
  const grid = useMemo(() => buildAttendanceGrid(logs, today), [logs, today]);
  const [selected, setSelected] = useState(today);
  const scrollRef = useRef(null);

  // Start scrolled to the most recent week.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const cellByDate = useMemo(() => {
    const m = new Map();
    for (const week of grid.weeks) for (const c of week) m.set(c.date, c);
    return m;
  }, [grid]);
  const cell = cellByDate.get(selected) || cellByDate.get(today);

  const pick = (e) => {
    const date = e.target?.dataset?.date;
    if (date) setSelected(date);
  };

  return (
    <div className="attendance">
      <div className={`attendance-readout ${cell?.active ? 'is-active' : ''}`} aria-live="polite">
        <span className="attendance-readout-date">{cell ? longDate(cell.date) : ''}</span>
        <span className="attendance-readout-status">{cell ? (cell.future ? 'Upcoming' : describeDay(cell, split, rotations)) : ''}</span>
      </div>

      <div className="attendance-body">
        <div className="attendance-days" aria-hidden>
          {DAY_LABELS.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
        <div className="attendance-scroll" ref={scrollRef}>
          <div className="attendance-inner" style={{ '--weeks': grid.weeks.length }}>
            <div className="attendance-months" aria-hidden>
              {grid.months.map((m) => (
                <span key={`${m.col}-${m.label}`} style={{ '--col': m.col }}>
                  {m.label}
                </span>
              ))}
            </div>
            <div
              className="attendance-grid"
              role="img"
              aria-label={`${grid.activeDays} workout day${grid.activeDays === 1 ? '' : 's'} in the last year`}
              onPointerOver={(e) => e.pointerType === 'mouse' && pick(e)}
              onClick={pick}
            >
              {grid.weeks.map((week) =>
                week.map((c) => (
                  <span
                    key={c.date}
                    data-date={c.date}
                    className={`att-cell${c.active ? ' is-active' : ''}${c.future ? ' is-future' : ''}${c.date === selected ? ' is-selected' : ''}`}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="attendance-legend" aria-hidden>
        <span className="att-cell" /> No workout
        <span className="att-cell is-active" /> Workout logged
      </div>
    </div>
  );
}
