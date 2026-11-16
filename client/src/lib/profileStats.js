/**
 * Profile page stats: current streak, lifetime totals and the attendance heatmap.
 *
 * All dates are local-calendar `YYYY-MM-DD` keys (see dates.js), never UTC.
 * Pure module (no React, no browser globals) so it can be unit tested with node:test.
 */

import { addDays, fromKey, weekdayName } from './dates.js';

export const STREAK_CAP_DAYS = 3650;
export const GRID_WEEKS = 53;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A set counts once something was entered in it. The logger pre-fills a day with empty
 * placeholder rows (weight and reps null), and those aren't workouts.
 */
export const isLoggedSet = (s) => Boolean(s) && ((s.reps ?? 0) > 0 || (s.weight ?? 0) > 0);

/** Logged sets on one day. */
export function loggedSetCount(log) {
  if (!Array.isArray(log?.exercises)) return 0;
  let n = 0;
  for (const ex of log.exercises) {
    if (Array.isArray(ex?.sets)) for (const s of ex.sets) if (isLoggedSet(s)) n += 1;
  }
  return n;
}

export const isWorkoutLogged = (logs, dateStr) => loggedSetCount(logs?.[dateStr]) > 0;

export const isScheduledRestDay = (split, dateStr) => split?.[weekdayName(dateStr)] === 'Rest';

/**
 * Consecutive days, ending today, of training-or-scheduled-rest.
 *
 * - An unlogged *training* day today doesn't break the streak yet: the walk starts at yesterday.
 * - A scheduled Rest day counts, but only once it sits on top of a real workout: rest days
 *   before the oldest workout of the run are not counted (so a mostly-Rest split can't stretch
 *   a single old workout into a years-long streak).
 * - A missed training day ends it. No workout at all means 0.
 */
export function calculateCurrentStreak(logs, split, todayStr) {
  let cursor = todayStr;
  if (!isWorkoutLogged(logs, todayStr) && !isScheduledRestDay(split, todayStr)) cursor = addDays(todayStr, -1);

  let count = 0;
  let streak = 0; // count as of the oldest workout seen so far
  for (let i = 0; i < STREAK_CAP_DAYS; i++) {
    if (isWorkoutLogged(logs, cursor)) {
      count += 1;
      streak = count;
    } else if (isScheduledRestDay(split, cursor)) {
      count += 1;
    } else {
      break;
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Lifetime totals: days with at least one logged set, and logged sets. */
export function workoutTotals(logs) {
  let workouts = 0;
  let sets = 0;
  for (const log of Object.values(logs || {})) {
    const n = loggedSetCount(log);
    if (n > 0) {
      workouts += 1;
      sets += n;
    }
  }
  return { workouts, sets };
}

/**
 * GitHub-style attendance grid: 53 week columns (Sunday on top, Saturday at the bottom),
 * the last one being the week that contains `todayStr`.
 *
 * Returns {
 *   weeks:  [[{ date, active, future, sets, category }] × 7] × 53,
 *   months: [{ col, label }],   // label above the first column of each month
 *   activeDays,                 // workouts within the grid
 *   start, end                  // first Sunday, last Saturday
 * }
 */
export function buildAttendanceGrid(logs, todayStr, weekCount = GRID_WEEKS) {
  const todayDow = fromKey(todayStr).getDay(); // 0 = Sunday
  const end = addDays(todayStr, 6 - todayDow);
  const start = addDays(todayStr, -todayDow - (weekCount - 1) * 7);

  const weeks = [];
  const months = [];
  let activeDays = 0;
  let date = start;
  let lastMonth = -1;

  for (let w = 0; w < weekCount; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const future = date > todayStr;
      const log = logs?.[date];
      const sets = future ? 0 : loggedSetCount(log);
      const active = sets > 0;
      if (active) activeDays += 1;
      days.push({ date, active, future, sets, category: active ? log.category || null : null });
      date = addDays(date, 1);
    }
    // A month's label sits over the first column whose Sunday falls in that month.
    const month = fromKey(days[0].date).getMonth();
    if (month !== lastMonth) {
      months.push({ col: w, label: MONTHS[month] });
      lastMonth = month;
    }
    weeks.push(days);
  }

  // The leftmost label is usually a partial month; drop it when it would collide with the next.
  if (months.length > 1 && months[1].col - months[0].col < 3) months.shift();

  return { weeks, months, activeDays, start, end };
}

/** "Pull • 14 sets" / "Scheduled Rest" / "No workout logged". */
export function describeDay(cell, split) {
  if (cell.active) return `${cell.category ? `${cell.category} • ` : ''}${cell.sets} set${cell.sets === 1 ? '' : 's'}`;
  if (isScheduledRestDay(split, cell.date)) return 'Scheduled Rest';
  return 'No workout logged';
}
