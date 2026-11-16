/**
 * Malta wall-clock helpers for the daily reminder (21:00 Europe/Malta, DST-aware).
 * Pure functions, so they run in the browser, the Android app and Node tests alike.
 */
export const REMINDER_TZ = 'Europe/Malta';
export const REMINDER_HOUR = 21;
export const REMINDER_MINUTE = 0;

const fmtCache = new Map();
function formatter(timeZone) {
  if (!fmtCache.has(timeZone)) {
    fmtCache.set(
      timeZone,
      new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    );
  }
  return fmtCache.get(timeZone);
}

/** Wall-clock parts of `date` in `timeZone`. */
export function zonedParts(date, timeZone = REMINDER_TZ) {
  const out = {};
  for (const p of formatter(timeZone).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
}

/** Minutes `timeZone` is ahead of UTC at `date` (Malta: 60 in winter, 120 in summer). */
export function zoneOffsetMinutes(date, timeZone = REMINDER_TZ) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** The UTC instant at which it is y-m-d hh:mm in `timeZone`. */
function zonedToUtc(y, m, d, hh, mm, timeZone) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60000;
  // Re-check with the offset at the result, in case a DST change sits in between.
  return guess - zoneOffsetMinutes(new Date(first), timeZone) * 60000;
}

/** The next 21:00 Malta time strictly after `now`. */
export function nextReminderTime(now = new Date(), timeZone = REMINDER_TZ) {
  const p = zonedParts(now, timeZone);
  let at = zonedToUtc(p.year, p.month, p.day, REMINDER_HOUR, REMINDER_MINUTE, timeZone);
  if (at <= now.getTime()) {
    const t = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
    at = zonedToUtc(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), REMINDER_HOUR, REMINDER_MINUTE, timeZone);
  }
  return new Date(at);
}

/** True when `now` is in the reminder hour in Malta (used by the push server's cron). */
export function isReminderHour(now = new Date(), timeZone = REMINDER_TZ) {
  return zonedParts(now, timeZone).hour === REMINDER_HOUR;
}
