/**
 * Importing workout history from a CSV export (built for the Lift Up app, tolerant of
 * other gym trackers that export one row per set).
 *
 * Only what Lyft can store is kept: date, routine name, exercise, set order, weight, reps
 * and reps in reserve. Everything else (RPE, rest time, distance, notes, bodyweight, ...)
 * is ignored. Warm-up sets, cardio rows and rows without reps are skipped and counted.
 *
 * Pure module (no React, no browser globals) so it can be unit tested with node:test.
 */

import { allExercises } from './history.js';
import { toKg } from './lifterProfileStore.js';
import { uid } from './storage.js';

const MAX_BYTES = 20 * 1024 * 1024;

export class CsvImportError extends Error {}

/* ------------------------------------------------------------------ */
/* CSV parsing (RFC 4180)                                               */
/* ------------------------------------------------------------------ */

/** Picks the delimiter used in the header line: comma, semicolon or tab. */
function detectDelimiter(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === '\n' || c === '\r')) break;
    else if (!quoted && c in counts) counts[c] += 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

/**
 * Parses CSV text into rows of trimmed strings. Handles CRLF / LF / CR line endings,
 * quoted fields with delimiters, line breaks and escaped quotes (""), a UTF-8 BOM, and
 * skips blank lines.
 */
export function parseCSV(text, delimiter) {
  let src = String(text ?? '');
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const delim = delimiter || detectDelimiter(src);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;

  const endField = () => {
    row.push(wasQuoted ? field : field.trim());
    field = '';
    wasQuoted = false;
  };
  const endRow = () => {
    endField();
    if (row.some((v) => v !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field.trim() === '') {
      // Opening quote (whitespace before it is dropped).
      field = '';
      quoted = true;
      wasQuoted = true;
    } else if (c === delim) endField();
    else if (c === '\n') endRow();
    else if (c === '\r') {
      if (src[i + 1] === '\n') i++;
      endRow();
    } else if (wasQuoted) {
      // Text after a closing quote, e.g. `"abc" ` or `"abc"def`: keep non-space characters.
      if (!/\s/.test(c)) field += c;
    } else field += c;
  }
  if (field !== '' || wasQuoted || row.length) endRow();
  return rows;
}

/* ------------------------------------------------------------------ */
/* Column detection                                                     */
/* ------------------------------------------------------------------ */

/** Header aliases, normalised (lower case, letters and digits only). First match wins. */
const COLUMNS = {
  exercise: ['exercise', 'exercisename', 'exercisetitle', 'movement', 'movementname', 'lift', 'liftname', 'name'],
  date: ['date', 'workoutdate', 'sessiondate', 'starttime', 'workoutstarttime', 'startdate', 'timestamp', 'datetime', 'start', 'day', 'performedat', 'createdat'],
  workout: ['workoutname', 'workout', 'routine', 'routinename', 'split', 'splitname', 'title', 'workouttitle', 'session', 'sessionname', 'template'],
  set: ['set', 'setnumber', 'setorder', 'setno', 'setnum', 'setindex', 'setid'],
  weight: ['weight', 'weightkg', 'weightkgs', 'weightlbs', 'weightlb', 'load', 'loadkg', 'loadlbs', 'kg', 'kgs', 'lbs', 'lb', 'resistance'],
  reps: ['reps', 'repetitions', 'rep', 'repcount', 'numreps', 'reps1'],
  unit: ['unit', 'units', 'weightunit', 'weightunits', 'unitofmeasure'],
  rir: ['rir', 'repsinreserve'],
  setType: ['settype', 'type', 'setkind', 'warmup', 'iswarmup', 'warmupset'],
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Weight unit named in a header such as "Weight (lbs)" or "weight_kg". */
function headerUnit(header) {
  const h = String(header || '').toLowerCase();
  if (/\b(lbs?|pounds?)\b|_lbs?\b|lbs?\)/.test(h) || /^(weight|load)lbs?$/.test(norm(h)) || /^lbs?$/.test(norm(h))) return 'lbs';
  if (/\bkgs?\b|_kgs?\b|kgs?\)/.test(h) || /^(weight|load)kgs?$/.test(norm(h)) || /^kgs?$/.test(norm(h))) return 'kg';
  return null;
}

/** Maps Lyft fields to column indexes. Unlisted columns are simply never read. */
export function detectColumns(header) {
  const keys = header.map((h) => norm(String(h).replace(/\(.*?\)|\[.*?\]/g, '')));
  const used = new Set();
  const cols = {};
  for (const [field, aliases] of Object.entries(COLUMNS)) {
    for (const alias of aliases) {
      const i = keys.findIndex((k, idx) => k === alias && !used.has(idx));
      if (i >= 0) {
        cols[field] = i;
        used.add(i);
        break;
      }
    }
  }
  return { cols, weightUnit: cols.weight !== undefined ? headerUnit(header[cols.weight]) : null, keys };
}

/* ------------------------------------------------------------------ */
/* Values                                                               */
/* ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, '0');

function validYmd(y, m, d) {
  if (y < 1990 || y > new Date().getFullYear() + 1 || m < 1 || m > 12 || d < 1) return null;
  const last = new Date(y, m, 0).getDate();
  return d <= last ? `${y}-${pad(m)}-${pad(d)}` : null;
}

const YMD = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/;
const DMY = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:$|[T\s,])/;
const HAS_ZONE = /T?\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Decides D/M/Y vs M/D/Y for a whole column: any first part over 12 means day first. */
export function guessDayFirst(values, fallback = true) {
  let dayFirst = null;
  for (const v of values) {
    const m = DMY.exec(String(v || '').trim());
    if (!m) continue;
    if (Number(m[1]) > 12) return true;
    if (Number(m[2]) > 12) dayFirst = false;
  }
  return dayFirst ?? fallback;
}

/** Converts a date cell to a local YYYY-MM-DD key, or null. */
export function parseDateKey(value, dayFirst = true) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (/^\d{10}(\d{3})?$/.test(s)) {
    const d = new Date(Number(s) * (s.length === 10 ? 1000 : 1));
    return Number.isNaN(d.getTime()) ? null : validYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  // A timestamp with a zone (2024-05-01T17:30:00Z) is converted to the local day.
  if (YMD.test(s) && HAS_ZONE.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return validYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  let m = YMD.exec(s);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = DMY.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return dayFirst ? validYmd(y, b, a) : validYmd(y, a, b);
  }
  // "May 1, 2024", "1 May 2024 18:00", "Wed, 01 May 2024 ..."
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return validYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;
}

/** "102.5", "102,5", "225 lbs", "80kg" → { value, unit }; blanks and text → value null. */
export function parseWeight(raw) {
  let s = String(raw || '').trim().toLowerCase();
  if (!s) return { value: null, unit: null };
  const unit = /(lbs?|pounds?)\b/.test(s) ? 'lbs' : /kgs?\b|kilo/.test(s) ? 'kg' : null;
  s = s.replace(/[^0-9.,-]/g, '');
  if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return { value: Number.isFinite(n) && n >= 0 ? n : null, unit };
}

function parseIntish(raw) {
  const n = parseFloat(String(raw || '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

const unitOf = (raw) => {
  const s = norm(raw);
  if (/^(lb|lbs|pound|pounds|imperial)$/.test(s)) return 'lbs';
  if (/^(kg|kgs|kilo|kilos|kilogram|kilograms|metric)$/.test(s)) return 'kg';
  return null;
};

const isWarmup = (raw) => {
  const s = norm(raw);
  return /warm/.test(s) || s === 'w' || s === 'true' || s === 'yes' || s === '1';
};

const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const nameKey = (s) => cleanName(s).toLowerCase();
const round4 = (n) => Math.round(n * 10000) / 10000;

/* ------------------------------------------------------------------ */
/* CSV → sessions                                                       */
/* ------------------------------------------------------------------ */

/**
 * Reads a CSV export into workout sessions, one per date, oldest first:
 *   { sessions: [{ date, workoutName, exercises: [{ name, sets: [{ weight(kg), reps, spotted, rir? }] }] }],
 *     setCount, skipped: { warmup, noReps, badDate, noExercise }, skippedTotal }
 * Throws CsvImportError with a user-facing message when the file can't be used.
 *
 * `unit` is the weight unit assumed when neither a unit column, a header like
 * "Weight (lbs)" nor the value itself says which one it is. Dates like 03/04/2025 are
 * read day-first unless the column proves otherwise (a value over 12 in either place),
 * or `preferDayFirst` is false; `dayFirst` forces one reading.
 */
export function parseLiftCsv(text, { unit = 'kg', dayFirst, preferDayFirst = true } = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new CsvImportError('That file is empty.');
  if (text.length > MAX_BYTES) throw new CsvImportError('That file is too large to import.');
  if (text.includes('\u0000')) throw new CsvImportError("That file isn't a CSV export (it looks like a binary file).");
  const head = text.replace(/^﻿/, '').trimStart();
  if (head.startsWith('{') || head.startsWith('[')) {
    throw new CsvImportError('That looks like a JSON file. Use "Import backup" for Lyft backups, or export a CSV from Lift Up.');
  }

  const rows = parseCSV(text);
  if (rows.length < 2) throw new CsvImportError('That CSV has no workout rows to import.');
  const header = rows[0];
  const { cols, weightUnit, keys } = detectColumns(header);
  const missing = [];
  if (cols.date === undefined) missing.push('Date');
  if (cols.exercise === undefined) missing.push('Exercise');
  if (cols.weight === undefined && cols.reps === undefined) missing.push('Weight or Reps');
  if (missing.length) {
    throw new CsvImportError(
      `That CSV is missing the ${missing.join(', ')} column${missing.length > 1 ? 's' : ''}. Export your workout history from Lift Up as CSV and try again.`
    );
  }

  const cell = (row, field) => (cols[field] === undefined ? '' : row[cols[field]] ?? '');
  const body = rows.slice(1);
  const firstDay = dayFirst ?? guessDayFirst(body.map((r) => cell(r, 'date')), preferDayFirst);
  const fallbackUnit = unit === 'lbs' ? 'lbs' : 'kg';

  const skipped = { warmup: 0, noReps: 0, badDate: 0, noExercise: 0 };
  const byDate = new Map();
  let row = 0;

  for (const r of body) {
    row += 1;
    // A repeated header row (some exports concatenate files).
    if (norm(cell(r, 'exercise')) === keys[cols.exercise] && norm(cell(r, 'date')) === keys[cols.date]) continue;

    const name = cleanName(cell(r, 'exercise'));
    if (!name) {
      skipped.noExercise += 1;
      continue;
    }
    const date = parseDateKey(cell(r, 'date'), firstDay);
    if (!date) {
      skipped.badDate += 1;
      continue;
    }
    if (cols.setType !== undefined && isWarmup(cell(r, 'setType'))) {
      skipped.warmup += 1;
      continue;
    }
    const reps = parseIntish(cell(r, 'reps'));
    if (!(reps > 0)) {
      // Cardio, timed holds and empty rows have no reps to log.
      skipped.noReps += 1;
      continue;
    }
    const w = parseWeight(cell(r, 'weight'));
    const rowUnit = w.unit || unitOf(cell(r, 'unit')) || weightUnit || fallbackUnit;
    const set = { weight: w.value === null ? null : round4(toKg(w.value, rowUnit)), reps, spotted: false };
    const rir = parseIntish(cell(r, 'rir'));
    if (cols.rir !== undefined && cell(r, 'rir') !== '' && rir !== null && rir >= 0 && rir <= 5) set.rir = rir;

    let session = byDate.get(date);
    if (!session) {
      session = { date, workoutName: '', exercises: new Map() };
      byDate.set(date, session);
    }
    if (!session.workoutName) session.workoutName = cleanName(cell(r, 'workout'));
    const key = nameKey(name);
    let ex = session.exercises.get(key);
    if (!ex) {
      ex = { name, sets: [] };
      session.exercises.set(key, ex);
    }
    ex.sets.push({ order: parseIntish(cell(r, 'set')), row, set });
  }

  let setCount = 0;
  const sessions = [...byDate.values()]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((s) => ({
      date: s.date,
      workoutName: s.workoutName,
      exercises: [...s.exercises.values()].map((ex) => {
        // Order by set number when every row has a distinct one; otherwise keep file order.
        const orders = ex.sets.map((x) => x.order);
        const usable = orders.every((o) => o !== null) && new Set(orders).size === orders.length;
        const sorted = usable ? ex.sets.slice().sort((a, b) => a.order - b.order || a.row - b.row) : ex.sets;
        setCount += sorted.length;
        return { name: ex.name, sets: sorted.map((x) => x.set) };
      }),
    }));

  const skippedTotal = Object.values(skipped).reduce((a, b) => a + b, 0);
  if (!sessions.length) {
    throw new CsvImportError(
      skippedTotal
        ? `No weight sets found: all ${skippedTotal} row${skippedTotal === 1 ? ' was' : 's were'} warm-ups, cardio or missing reps / dates.`
        : 'That CSV has no workout rows to import.'
    );
  }
  return { sessions, setCount, skipped, skippedTotal };
}

/* ------------------------------------------------------------------ */
/* Sessions → Lyft state                                                */
/* ------------------------------------------------------------------ */

const hasData = (s) => s && Number.isFinite(s.reps) && s.reps > 0;

/** Lyft routine name for an imported workout: an existing routine's spelling when it matches. */
function categoryFor(workoutName, workouts) {
  const name = cleanName(workoutName).slice(0, 24);
  if (!name || name.toLowerCase() === 'rest') return 'Imported';
  return Object.keys(workouts || {}).find((c) => c.toLowerCase() === name.toLowerCase()) || name;
}

/**
 * Adds imported sessions to `state` (mutates it) without touching what's already logged:
 * - exercises are linked to existing ones by name (any case), otherwise get a new id
 *   (they then show up as history-only exercises, like ones deleted from a routine);
 * - a date with no log gets a new one; a date already logged gains the imported exercises
 *   it doesn't have. An exercise that already has sets that day is left alone, so
 *   importing the same file twice adds nothing the second time.
 * Returns { workouts, sets, duplicateSets, exercisesCreated }.
 */
export function mergeImportedSessions(state, sessions) {
  if (!state.logs) state.logs = {};
  const ids = new Map();
  for (const ex of allExercises(state)) if (!ids.has(nameKey(ex.name))) ids.set(nameKey(ex.name), { id: ex.id, name: ex.name });

  const result = { workouts: 0, sets: 0, duplicateSets: 0, exercisesCreated: 0 };
  for (const session of sessions) {
    const entries = session.exercises.map((ex) => {
      let link = ids.get(nameKey(ex.name));
      if (!link) {
        link = { id: uid('ex'), name: ex.name };
        ids.set(nameKey(ex.name), link);
        result.exercisesCreated += 1;
      }
      return { exerciseId: link.id, name: link.name, sets: ex.sets.map((s) => ({ ...s })) };
    });

    const log = state.logs[session.date];
    let added = 0;
    if (!log) {
      state.logs[session.date] = { category: categoryFor(session.workoutName, state.workouts), exercises: entries };
      added = entries.reduce((n, e) => n + e.sets.length, 0);
    } else {
      for (const entry of entries) {
        const existing = log.exercises.find((e) => e.exerciseId === entry.exerciseId);
        if (existing && (existing.sets || []).some(hasData)) {
          result.duplicateSets += entry.sets.length;
          continue;
        }
        if (existing) existing.sets = entry.sets;
        else log.exercises.push(entry);
        added += entry.sets.length;
      }
    }
    if (added) {
      result.workouts += 1;
      result.sets += added;
    }
  }
  return result;
}

/** Treats a file as CSV by its name or type. */
export function isCsvFile(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  return name.endsWith('.csv') || type === 'text/csv' || type === 'text/comma-separated-values' || type === 'application/csv';
}
