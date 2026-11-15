'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');

const PORT = Number(process.env.PORT) || 3456;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'gym.db');
const CLIENT_DIST = process.env.CLIENT_DIST || path.join(__dirname, '..', 'client', 'dist');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/* ------------------------------------------------------------------ */
/* Seed state (mirrors client/src/seed.js)                              */
/* ------------------------------------------------------------------ */

const SEED_STATE = {
  lastSynced: null,
  split: {
    Monday: 'Push',
    Tuesday: 'Pull',
    Wednesday: 'Legs',
    Thursday: 'Push',
    Friday: 'Pull',
    Saturday: 'Rest',
    Sunday: 'Rest',
  },
  workouts: {
    Push: [
      { id: 'push-1', name: 'Flat Barbell Bench', defaultSets: 3 },
      { id: 'push-2', name: 'Incline Dumbbell Bench', defaultSets: 3 },
      { id: 'push-3', name: 'High to Low Cable Extensions', defaultSets: 3 },
      { id: 'push-4', name: 'Side Cable Lateral Raises', defaultSets: 3 },
      { id: 'push-5', name: 'Tricep Rope Overhead Extension', defaultSets: 3 },
      { id: 'push-6', name: 'Tricep Bar Pushdown', defaultSets: 3 },
      { id: 'push-7', name: 'Uwu Curls', defaultSets: 3 },
      { id: 'push-8', name: 'Reverse Uwu Curls', defaultSets: 3 },
    ],
    Pull: [
      { id: 'pull-1', name: 'Wide Grip Lat Pulldown', defaultSets: 3 },
      { id: 'pull-2', name: 'Close Grip Lat Pulldown', defaultSets: 3 },
      { id: 'pull-3', name: 'Close Grip Cable Rows', defaultSets: 3 },
      { id: 'pull-4', name: 'Flat Grip Machine Row', defaultSets: 3 },
      { id: 'pull-5', name: 'Reverse Pec Dec', defaultSets: 3 },
      { id: 'pull-6', name: 'Face Pulls', defaultSets: 3 },
      { id: 'pull-7', name: 'Kelso Shrugs', defaultSets: 3 },
      { id: 'pull-8', name: 'Shrugs', defaultSets: 3 },
      { id: 'pull-9', name: 'Dumbbell Curls', defaultSets: 3 },
      { id: 'pull-10', name: 'Cable Hammer Curls', defaultSets: 3 },
    ],
    Legs: [
      { id: 'legs-1', name: 'Squats', defaultSets: 3 },
      { id: 'legs-2', name: 'SLDL', defaultSets: 3 },
      { id: 'legs-3', name: 'Leg Extensions', defaultSets: 3 },
      { id: 'legs-4', name: 'Hamstring Curls', defaultSets: 3 },
      { id: 'legs-5', name: 'Standing Calf Raises', defaultSets: 3 },
      { id: 'legs-6', name: 'Abductor Machine', defaultSets: 3 },
      { id: 'legs-7', name: 'Adductor Machine', defaultSets: 3 },
      { id: 'legs-8', name: 'Incline Dragon Flag', defaultSets: 3 },
    ],
  },
  logs: {},
  goals: [
    {
      id: 'goal-1',
      exercise: 'Flat Barbell Bench',
      startPR: 80,
      currentPR: 80,
      targetPR: 100,
      targetDate: '',
      notes: 'Clean pause reps',
      achieved: false,
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Database                                                             */
/* ------------------------------------------------------------------ */

fs.mkdirSync(DATA_DIR, { recursive: true });
const isNewDb = !fs.existsSync(DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    data       TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
  );
`);

const selectState = db.prepare('SELECT data, updated_at FROM app_state WHERE id = 1');
const upsertState = db.prepare(`
  INSERT INTO app_state (id, data, updated_at) VALUES (1, @data, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
`);

function ensureSeeded() {
  const row = selectState.get();
  if (!row) {
    upsertState.run({ data: JSON.stringify(SEED_STATE), updatedAt: new Date().toISOString() });
    console.log(`[lyft] Seeded ${isNewDb ? 'new' : 'empty'} database at ${DB_PATH}`);
  }
}
ensureSeeded();

function readState() {
  const row = selectState.get();
  if (!row) {
    ensureSeeded();
    return JSON.parse(JSON.stringify(SEED_STATE));
  }
  try {
    return JSON.parse(row.data);
  } catch (err) {
    console.error('[lyft] Stored state is corrupt, returning seed:', err.message);
    return JSON.parse(JSON.stringify(SEED_STATE));
  }
}

/* ------------------------------------------------------------------ */
/* Validation                                                           */
/* ------------------------------------------------------------------ */

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonNegNumberOrNull = (v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);

function validateState(s) {
  if (!isPlainObject(s)) return 'State must be a JSON object';

  if (!isPlainObject(s.split)) return '"split" must be an object';
  for (const day of DAYS) {
    if (typeof s.split[day] !== 'string' || !s.split[day]) return `"split.${day}" must be a non-empty string`;
  }

  if (!isPlainObject(s.workouts)) return '"workouts" must be an object';
  for (const [category, list] of Object.entries(s.workouts)) {
    if (!Array.isArray(list)) return `"workouts.${category}" must be an array`;
    for (const ex of list) {
      if (!isPlainObject(ex)) return `Exercise in "${category}" must be an object`;
      if (typeof ex.id !== 'string' || !ex.id) return `Exercise in "${category}" is missing an id`;
      if (typeof ex.name !== 'string') return `Exercise "${ex.id}" is missing a name`;
      if (!Number.isInteger(ex.defaultSets) || ex.defaultSets < 1 || ex.defaultSets > 20) {
        return `Exercise "${ex.id}" has invalid defaultSets`;
      }
    }
  }

  if (!isPlainObject(s.logs)) return '"logs" must be an object';
  for (const [date, log] of Object.entries(s.logs)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return `Log key "${date}" must be YYYY-MM-DD`;
    if (!isPlainObject(log)) return `Log "${date}" must be an object`;
    if (typeof log.category !== 'string') return `Log "${date}" is missing a category`;
    if (!Array.isArray(log.exercises)) return `Log "${date}" exercises must be an array`;
    for (const entry of log.exercises) {
      if (!isPlainObject(entry) || typeof entry.exerciseId !== 'string' || !Array.isArray(entry.sets)) {
        return `Log "${date}" has an invalid exercise entry`;
      }
      for (const set of entry.sets) {
        if (!isPlainObject(set)) return `Log "${date}" has an invalid set`;
        if (!isNonNegNumberOrNull(set.weight)) return `Log "${date}" has an invalid weight`;
        if (!isNonNegNumberOrNull(set.reps)) return `Log "${date}" has invalid reps`;
        if (typeof set.spotted !== 'boolean') return `Log "${date}" has an invalid spotted flag`;
      }
    }
  }

  if (!Array.isArray(s.goals)) return '"goals" must be an array';
  for (const g of s.goals) {
    if (!isPlainObject(g) || typeof g.id !== 'string' || typeof g.exercise !== 'string') {
      return 'Each goal needs an id and exercise';
    }
    for (const key of ['startPR', 'currentPR', 'targetPR']) {
      if (!(typeof g[key] === 'number' && Number.isFinite(g[key]) && g[key] >= 0)) return `Goal "${g.id}" has invalid ${key}`;
    }
    if (typeof g.achieved !== 'boolean') return `Goal "${g.id}" has invalid achieved flag`;
  }

  // Lifter profile (optional; older clients don't send it).
  if (s.profile !== undefined && s.profile !== null) {
    const p = s.profile;
    if (!isPlainObject(p)) return '"profile" must be an object';
    if (p.bodyweight !== null && !(typeof p.bodyweight === 'number' && Number.isFinite(p.bodyweight) && p.bodyweight > 0)) {
      return '"profile.bodyweight" must be a positive number or null';
    }
    if (!['male', 'female'].includes(p.sex)) return '"profile.sex" must be "male" or "female"';
    if (!['kg', 'lbs'].includes(p.unit)) return '"profile.unit" must be "kg" or "lbs"';
    if (!Array.isArray(p.bodyweightHistory)) return '"profile.bodyweightHistory" must be an array';
    for (const h of p.bodyweightHistory) {
      if (!isPlainObject(h) || !/^\d{4}-\d{2}-\d{2}$/.test(h.date) || !(typeof h.weightKg === 'number' && h.weightKg > 0)) {
        return 'Invalid bodyweight history entry';
      }
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                 */
/* ------------------------------------------------------------------ */

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/sync', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(readState());
});

app.post('/api/sync', (req, res) => {
  const incoming = req.body;
  const error = validateState(incoming);
  if (error) {
    return res.status(400).json({ success: false, error });
  }

  const lastSynced = new Date().toISOString();
  const toStore = {
    lastSynced,
    split: incoming.split,
    workouts: incoming.workouts,
    logs: incoming.logs,
    goals: incoming.goals,
    ...(incoming.profile ? { profile: incoming.profile } : {}),
  };

  try {
    upsertState.run({ data: JSON.stringify(toStore), updatedAt: lastSynced });
  } catch (err) {
    console.error('[lyft] Failed to write state:', err);
    return res.status(500).json({ success: false, error: 'Failed to write to database' });
  }

  res.json({ success: true, lastSynced });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// Malformed JSON bodies etc.
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ success: false, error: status === 500 ? 'Internal server error' : err.message });
});

/* Desktop installer downloads (e.g. the Tauri .deb) */
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || path.join(__dirname, '..', 'downloads');
app.get('/downloads', (_req, res) => {
  const files = fs.existsSync(DOWNLOADS_DIR) ? fs.readdirSync(DOWNLOADS_DIR).filter((f) => !f.startsWith('.')) : [];
  const items = files.map((f) => `<li><a href="/downloads/${encodeURIComponent(f)}">${f}</a></li>`).join('');
  res.type('html').send(
    `<!doctype html><meta name="viewport" content="width=device-width"><title>Lyft downloads</title>` +
      `<body style="font-family:sans-serif;background:#080A0F;color:#F8FAFC;padding:24px">` +
      `<h1>Lyft downloads</h1><ul>${items || '<li>No files yet</li>'}</ul></body>`
  );
});
app.use('/downloads', express.static(DOWNLOADS_DIR, { index: false, dotfiles: 'ignore' }));

/* Static React build + SPA fallback */
if (fs.existsSync(CLIENT_DIST)) {
  app.use(
    express.static(CLIENT_DIST, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html') || filePath.endsWith('manifest.json')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  console.warn(`[lyft] Client build not found at ${CLIENT_DIST} — API only.`);
  app.get('/', (_req, res) => res.type('text').send('Lyft API is running. Build the client to serve the UI.'));
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[lyft] Listening on http://0.0.0.0:${PORT} (db: ${DB_PATH})`);
});

function shutdown(signal) {
  console.log(`[lyft] ${signal} received, shutting down`);
  server.close(() => {
    try {
      db.close();
    } catch (_) {
      /* already closed */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
