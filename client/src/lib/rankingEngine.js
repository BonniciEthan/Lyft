/**
 * Lyft strength-ranking engine.
 *
 * Pure and deterministic: no React, no storage, no network. Everything is computed from
 * the app state (`state.logs`, `state.workouts`) plus the lifter profile.
 *
 *   set  ──Epley──▶ e1RM ──allometric ratio──▶ calibrated curve ──▶ Strength Rating (1–1000+)
 *   exercise rank  = best-scoring eligible set ever logged
 *   muscle rank    = top-weighted blend of that muscle's best three exercises
 *   overall rank   = top-weighted blend of the strongest six ranked muscles
 */

import { bodyweightOn, ceilToPlate, fromKg, plateStep, toKg } from './lifterProfileStore.js';

/* ================================================================== */
/* Tiers                                                                */
/* ================================================================== */

export const TIERS = [
  { id: 'wood', name: 'Wood', short: 'W', min: 1, color: '#8B5A2B', divs: [[1, 66], [67, 133], [134, 199]] },
  { id: 'bronze', name: 'Bronze', short: 'B', min: 200, color: '#CD7F32' },
  { id: 'silver', name: 'Silver', short: 'S', min: 300, color: '#94A3B8' },
  { id: 'gold', name: 'Gold', short: 'G', min: 400, color: '#EAB308' },
  { id: 'platinum', name: 'Platinum', short: 'P', min: 500, color: '#06B6D4' },
  { id: 'diamond', name: 'Diamond', short: 'D', min: 600, color: '#3B82F6' },
  { id: 'champion', name: 'Champion', short: 'C', min: 700, color: '#A855F7' },
  { id: 'titan', name: 'Titan', short: 'T', min: 800, color: '#F97316' },
  { id: 'olympian', name: 'Olympian', short: 'O', min: 900, color: '#FACC15' },
].map((t, index) => {
  if (t.divs || t.id === 'olympian') return { ...t, index };
  const m = t.min;
  return { ...t, index, divs: [[m, m + 33], [m + 34, m + 66], [m + 67, m + 99]] };
});

const DIV_LABELS = ['III', 'II', 'I'];

/** Integer rating used for tiering. Anything ranked is at least 1. */
export const toRating = (score) => (score > 0 ? Math.max(1, Math.round(score)) : 0);

/**
 * Tier, division and LP for a score.
 * Returns { ranked, tier, division, label, score, lp, divMin, divMax, next }.
 * `next` = { label, minScore, tier } for the next division (null at Olympian).
 */
export function rankOf(score) {
  const s = toRating(score);
  if (s <= 0) return { ranked: false, tier: null, division: null, label: 'Unranked', score: 0, lp: 0, next: nextOf(-1, -1) };
  const tier = [...TIERS].reverse().find((t) => s >= t.min);
  if (tier.id === 'olympian') {
    return { ranked: true, tier, division: null, label: 'Olympian', score: s, lp: Math.round(s - 900), divMin: 900, divMax: null, next: null };
  }
  const d = tier.divs.findIndex(([lo, hi]) => s >= lo && s <= hi);
  const [divMin, divMax] = tier.divs[d];
  const lp = Math.min(99, Math.floor(((s - divMin) / (divMax - divMin + 1)) * 100));
  return {
    ranked: true,
    tier,
    division: DIV_LABELS[d],
    label: `${tier.name} ${DIV_LABELS[d]}`,
    score: s,
    lp,
    divMin,
    divMax,
    next: nextOf(tier.index, d),
  };
}

function nextOf(tierIndex, divIndex) {
  if (tierIndex < 0) return { label: 'Wood III', minScore: 1, tier: TIERS[0] };
  const tier = TIERS[tierIndex];
  if (divIndex < 2) return { label: `${tier.name} ${DIV_LABELS[divIndex + 1]}`, minScore: tier.divs[divIndex + 1][0], tier };
  const up = TIERS[tierIndex + 1];
  if (!up) return null;
  return { label: up.id === 'olympian' ? 'Olympian' : `${up.name} III`, minScore: up.min, tier: up };
}

/** Next tier floor (e.g. Gold III from anywhere in Silver). */
export function nextTierOf(score) {
  const r = rankOf(score);
  if (!r.ranked) return { label: 'Wood III', minScore: 1, tier: TIERS[0] };
  const up = TIERS[r.tier.index + 1];
  if (!up) return null;
  return { label: up.id === 'olympian' ? 'Olympian' : `${up.name} III`, minScore: up.min, tier: up };
}

/** Comparable position: tier*3 + division (Olympian = 25). -1 when unranked. */
export function rankStep(score) {
  const r = rankOf(score);
  if (!r.ranked) return -1;
  if (r.tier.id === 'olympian') return 24;
  return r.tier.index * 3 + DIV_LABELS.indexOf(r.division);
}

/* ================================================================== */
/* Muscles                                                              */
/* ================================================================== */

export const MUSCLES = [
  { id: 'chest', name: 'Chest' },
  { id: 'back', name: 'Back' },
  { id: 'shoulders', name: 'Shoulders' },
  { id: 'biceps', name: 'Biceps' },
  { id: 'triceps', name: 'Triceps' },
  { id: 'abs', name: 'Abs' },
  { id: 'quads', name: 'Quads' },
  { id: 'hamstrings', name: 'Hamstrings' },
  { id: 'glutes', name: 'Glutes' },
  { id: 'calves', name: 'Calves' },
];
export const MUSCLE_NAME = Object.fromEntries(MUSCLES.map((m) => [m.id, m.name]));

/* ================================================================== */
/* Movement patterns & calibration                                      */
/* ================================================================== */

/**
 * `m` / `f`: e1RM-to-bodyweight ratios (at the reference bodyweight) that land on the
 * calibration scores below: roughly beginner, novice, intermediate, advanced, elite.
 * When `f` is omitted it is `m × ff`.
 * Dumbbell and single-handle patterns are per hand (what people actually type).
 * `bw`: leverage factor for bodyweight movements (weight field = added load).
 */
const P = (label, muscle, m, ff, extra = {}) => ({ label, muscle, m, ff, ...extra });

export const PATTERNS = {
  // Chest
  bench: P('Barbell Bench Press', 'chest', [0.55, 0.8, 1.1, 1.45, 1.85], 0, { f: [0.25, 0.42, 0.62, 0.85, 1.1], secondary: ['triceps', 'shoulders'] }),
  incline_bench: P('Incline Bench Press', 'chest', [0.45, 0.7, 0.95, 1.3, 1.65], 0.56, { secondary: ['shoulders', 'triceps'] }),
  db_bench: P('Dumbbell Bench Press', 'chest', [0.2, 0.32, 0.45, 0.62, 0.8], 0.56, { secondary: ['triceps', 'shoulders'] }),
  incline_db_press: P('Incline Dumbbell Press', 'chest', [0.17, 0.28, 0.4, 0.56, 0.72], 0.56, { secondary: ['shoulders', 'triceps'] }),
  machine_chest_press: P('Machine Chest Press', 'chest', [0.45, 0.75, 1.05, 1.45, 1.85], 0.56, { secondary: ['triceps'] }),
  pec_deck: P('Pec Deck / Machine Fly', 'chest', [0.3, 0.55, 0.85, 1.2, 1.55], 0.56),
  cable_fly: P('Cable Fly', 'chest', [0.07, 0.13, 0.21, 0.31, 0.42], 0.58),
  push_up: P('Push-Up', 'chest', [0.72, 0.85, 1.0, 1.18, 1.4], 0, { bw: 0.65, f: [0.67, 0.75, 0.86, 1.0, 1.18], secondary: ['triceps'] }),
  // Shoulders
  ohp: P('Overhead Press', 'shoulders', [0.35, 0.55, 0.75, 1.0, 1.3], 0, { f: [0.2, 0.32, 0.45, 0.6, 0.78], secondary: ['triceps'] }),
  db_shoulder_press: P('Dumbbell Shoulder Press', 'shoulders', [0.14, 0.22, 0.32, 0.45, 0.58], 0.56, { secondary: ['triceps'] }),
  machine_shoulder_press: P('Machine Shoulder Press', 'shoulders', [0.3, 0.5, 0.7, 0.95, 1.25], 0.56),
  lateral_raise: P('Lateral Raise', 'shoulders', [0.05, 0.09, 0.14, 0.21, 0.29], 0.6),
  front_raise: P('Front Raise', 'shoulders', [0.06, 0.1, 0.15, 0.22, 0.3], 0.6),
  rear_delt: P('Reverse Pec Deck', 'shoulders', [0.3, 0.5, 0.75, 1.05, 1.4], 0.6, { secondary: ['back'] }),
  face_pull: P('Face Pull', 'shoulders', [0.3, 0.5, 0.75, 1.05, 1.4], 0.6, { secondary: ['back'] }),
  upright_row: P('Upright Row', 'shoulders', [0.3, 0.45, 0.65, 0.9, 1.15], 0.6),
  shrug: P('Shrug', 'shoulders', [0.6, 1.0, 1.4, 1.9, 2.5], 0.65, { secondary: ['back'] }),
  db_shrug: P('Dumbbell Shrug', 'shoulders', [0.25, 0.4, 0.6, 0.85, 1.1], 0.65),
  // Back
  pull_up: P('Pull-Up / Chin-Up', 'back', [1.0, 1.12, 1.35, 1.6, 1.9], 0, { bw: 1.0, f: [0.9, 1.0, 1.12, 1.3, 1.55], secondary: ['biceps'] }),
  lat_pulldown: P('Lat Pulldown', 'back', [0.5, 0.75, 1.0, 1.3, 1.6], 0.65, { secondary: ['biceps'] }),
  barbell_row: P('Barbell Row', 'back', [0.5, 0.75, 1.0, 1.35, 1.75], 0.65, { secondary: ['biceps'] }),
  db_row: P('Dumbbell Row', 'back', [0.25, 0.4, 0.55, 0.75, 0.95], 0.62, { secondary: ['biceps'] }),
  cable_row: P('Seated Cable Row', 'back', [0.6, 0.95, 1.35, 1.85, 2.4], 0.65, { secondary: ['biceps'] }),
  machine_row: P('Machine Row', 'back', [0.5, 0.8, 1.15, 1.55, 2.0], 0.65, { secondary: ['biceps'] }),
  kelso_shrug: P('Kelso Shrug', 'back', [0.4, 0.65, 0.95, 1.3, 1.7], 0.65),
  pullover: P('Pullover', 'back', [0.25, 0.4, 0.6, 0.85, 1.1], 0.62),
  back_extension: P('Back Extension', 'back', [0.55, 0.65, 0.76, 0.9, 1.1], 1, { bw: 0.5, secondary: ['glutes', 'hamstrings'] }),
  deadlift: P('Deadlift', 'back', [1.0, 1.5, 2.0, 2.5, 3.0], 0, { f: [0.6, 0.95, 1.3, 1.7, 2.15], secondary: ['hamstrings', 'glutes'] }),
  // Arms
  barbell_curl: P('Barbell Curl', 'biceps', [0.2, 0.4, 0.6, 0.85, 1.15], 0.6),
  db_curl: P('Dumbbell Curl', 'biceps', [0.1, 0.18, 0.28, 0.4, 0.55], 0.6),
  hammer_curl: P('Hammer Curl', 'biceps', [0.1, 0.2, 0.3, 0.43, 0.58], 0.6),
  cable_curl: P('Cable Curl', 'biceps', [0.2, 0.35, 0.55, 0.8, 1.05], 0.6),
  preacher_curl: P('Preacher Curl', 'biceps', [0.18, 0.33, 0.5, 0.72, 0.95], 0.6),
  reverse_curl: P('Reverse Curl', 'biceps', [0.15, 0.28, 0.43, 0.62, 0.82], 0.6),
  // Forearms aren't one of the 10 groups; they roll into Biceps (the front-of-arm region).
  wrist_curl: P('Forearm (Wrist) Curl', 'biceps', [0.2, 0.35, 0.55, 0.8, 1.05], 0.6),
  reverse_wrist_curl: P('Reverse Forearm Curl', 'biceps', [0.12, 0.22, 0.35, 0.5, 0.68], 0.6),
  pushdown: P('Tricep Pushdown', 'triceps', [0.25, 0.45, 0.7, 1.0, 1.3], 0.6),
  skullcrusher: P('Skullcrusher', 'triceps', [0.2, 0.35, 0.55, 0.8, 1.05], 0.6),
  overhead_extension: P('Overhead Tricep Extension', 'triceps', [0.18, 0.32, 0.5, 0.72, 0.95], 0.6),
  close_grip_bench: P('Close-Grip Bench Press', 'triceps', [0.45, 0.7, 0.95, 1.3, 1.65], 0.56, { secondary: ['chest'] }),
  tricep_kickback: P('Tricep Kickback', 'triceps', [0.05, 0.09, 0.14, 0.2, 0.27], 0.6),
  dip: P('Dip', 'triceps', [1.0, 1.12, 1.3, 1.55, 1.85], 0, { bw: 1.0, f: [0.95, 1.03, 1.15, 1.3, 1.5], secondary: ['chest'] }),
  // Legs
  squat: P('Barbell Squat', 'quads', [0.75, 1.15, 1.5, 2.0, 2.6], 0, { f: [0.5, 0.8, 1.1, 1.45, 1.9], secondary: ['glutes'] }),
  front_squat: P('Front Squat', 'quads', [0.6, 0.95, 1.25, 1.65, 2.1], 0.72, { secondary: ['glutes'] }),
  hack_squat: P('Hack Squat', 'quads', [0.8, 1.3, 1.8, 2.4, 3.0], 0.75, { secondary: ['glutes'] }),
  leg_press: P('Leg Press', 'quads', [1.2, 2.0, 2.9, 3.9, 5.0], 0.78, { secondary: ['glutes'] }),
  goblet_squat: P('Goblet Squat', 'quads', [0.3, 0.5, 0.7, 0.9, 1.15], 0.75),
  lunge: P('Lunge / Split Squat', 'quads', [0.4, 0.65, 0.95, 1.3, 1.7], 0.72, { secondary: ['glutes'] }),
  bw_squat: P('Bodyweight Squat', 'quads', [0.8, 0.95, 1.1, 1.25, 1.4], 1, { bw: 0.7 }),
  leg_extension: P('Leg Extension', 'quads', [0.5, 0.85, 1.2, 1.65, 2.1], 0.72),
  adductor: P('Adductor Machine', 'quads', [0.6, 1.0, 1.45, 2.0, 2.6], 0.78),
  rdl: P('Romanian Deadlift', 'hamstrings', [0.75, 1.1, 1.5, 1.95, 2.45], 0.72, { secondary: ['glutes', 'back'] }),
  leg_curl: P('Leg Curl', 'hamstrings', [0.35, 0.6, 0.85, 1.2, 1.55], 0.7),
  nordic_curl: P('Nordic Curl', 'hamstrings', [0.72, 0.8, 0.9, 1.02, 1.18], 0.95, { bw: 0.7 }),
  hip_thrust: P('Hip Thrust', 'glutes', [0.75, 1.25, 1.8, 2.5, 3.2], 0.85, { secondary: ['hamstrings'] }),
  abductor: P('Abductor Machine', 'glutes', [0.6, 1.0, 1.45, 2.0, 2.6], 0.8),
  glute_kickback: P('Glute Kickback', 'glutes', [0.15, 0.28, 0.42, 0.6, 0.8], 0.8),
  calf_raise: P('Standing Calf Raise', 'calves', [0.6, 1.1, 1.65, 2.3, 3.0], 0.75),
  seated_calf: P('Seated Calf Raise', 'calves', [0.4, 0.75, 1.1, 1.55, 2.0], 0.75),
  // Core
  crunch: P('Weighted Crunch', 'abs', [0.3, 0.55, 0.85, 1.2, 1.6], 0.7),
  bw_crunch: P('Crunch / Sit-Up', 'abs', [0.32, 0.36, 0.41, 0.47, 0.55], 0.95, { bw: 0.3 }),
  hanging_leg_raise: P('Hanging Leg Raise', 'abs', [0.37, 0.42, 0.48, 0.55, 0.65], 0, { bw: 0.35, f: [0.36, 0.4, 0.45, 0.52, 0.6] }),
  dragon_flag: P('Dragon Flag', 'abs', [0.5, 0.55, 0.62, 0.72, 0.85], 0, { bw: 0.5, f: [0.48, 0.52, 0.58, 0.66, 0.78] }),
  // Fallbacks
  generic: P('General Strength', 'chest', [0.3, 0.55, 0.85, 1.2, 1.6], 0.65),
};

/** Scores the five calibration anchors land on. */
export const ANCHOR_SCORES = [200, 330, 470, 660, 880];
/** Reference bodyweights for the allometric adjustment. */
export const REF_BW = { male: 80, female: 62 };
/** Allometric exponent (≈ 2/3 power law: strength scales with muscle cross-section). */
export const ALLOMETRIC_EXP = 0.67;

export function anchorsFor(pattern, sex) {
  if (sex === 'female') return pattern.f || pattern.m.map((x) => x * (pattern.ff || 0.65));
  return pattern.m;
}

/* ================================================================== */
/* Exercise classification                                              */
/* ================================================================== */

/** Cardio / time-only work never ranks. */
const EXCLUDE_RE = /\b(plank|run|running|treadmill|bike|cycling|elliptical|stair|walk|jog|cardio|swim|jump rope|skipping|rowing machine|rower|erg|sled|carry|farmer|stretch|mobility|hold)\b/;

/** Ordered: the first matching rule wins, so specific patterns come first. */
const RULES = [
  [/dragon\s*flag/, 'dragon_flag'],
  [/(hanging|captain).*(leg|knee)|leg raise|knee raise|toes.?to.?bar/, 'hanging_leg_raise'],
  [/(cable|machine|weighted|kneeling|decline).*crunch|ab (machine|crunch)|crunch machine/, 'crunch'],
  [/crunch|sit.?up|ab ?wheel|rollout/, 'bw_crunch'],
  [/seated calf/, 'seated_calf'],
  [/calf|calves/, 'calf_raise'],
  [/hip thrust|glute bridge/, 'hip_thrust'],
  [/abduct/, 'abductor'],
  [/adduct/, 'adductor'],
  [/nordic/, 'nordic_curl'],
  [/(\bleg|hamstring|\bhams?\b|lying|seated|prone).*curl/, 'leg_curl'],
  [/\brdl\b|romanian|sldl|stiff.?leg|good ?morning/, 'rdl'],
  [/deadlift|\bdl\b|rack pull/, 'deadlift'],
  [/back extension|hyper.?extension|\bhyper/, 'back_extension'],
  [/leg ext/, 'leg_extension'],
  [/hack squat|pendulum/, 'hack_squat'],
  [/leg press/, 'leg_press'],
  [/front squat/, 'front_squat'],
  [/goblet/, 'goblet_squat'],
  [/split squat|bulgarian|lunge|step.?up/, 'lunge'],
  [/(bodyweight|air|bw) squat/, 'bw_squat'],
  [/squat/, 'squat'],
  [/glute.*kickback|kickback.*glute|donkey kick/, 'glute_kickback'],
  [/reverse (pec|fly|flye)|rear delt|rear.?fly/, 'rear_delt'],
  [/face ?pull/, 'face_pull'],
  [/kelso/, 'kelso_shrug'],
  [/(dumbbell|db).*shrug/, 'db_shrug'],
  [/shrug/, 'shrug'],
  [/high to low|low to high|crossover|cable (fly|flye)|(fly|flye).*cable/, 'cable_fly'],
  [/pec ?(dec|deck)|(machine|chest|dumbbell|db)? ?(fly|flye)\b/, 'pec_deck'],
  [/close.?grip (bench|press)|jm press/, 'close_grip_bench'],
  [/skull|lying.*extension|french/, 'skullcrusher'],
  [/push.?down|pressdown/, 'pushdown'],
  [/kickback/, 'tricep_kickback'],
  [/(overhead|rope|cable).*(tricep|extension)|tricep.*overhead/, 'overhead_extension'],
  [/tricep/, 'pushdown'],
  [/\bdips?\b/, 'dip'],
  [/push.?ups?\b|press.?ups?\b/, 'push_up'],
  [/incline.*(dumbbell|db)|(dumbbell|db).*incline/, 'incline_db_press'],
  [/incline/, 'incline_bench'],
  [/(dumbbell|db).*(bench|chest press|press$)/, 'db_bench'],
  [/(chest press|machine press|smith.*bench)/, 'machine_chest_press'],
  [/bench/, 'bench'],
  [/lateral|side raise|lat raise|\by.?raise/, 'lateral_raise'],
  [/front raise/, 'front_raise'],
  [/upright row/, 'upright_row'],
  [/(dumbbell|db|arnold).*(shoulder|overhead|press)|(shoulder|overhead) press.*(dumbbell|db)/, 'db_shoulder_press'],
  [/machine.*(shoulder|overhead)|shoulder press machine/, 'machine_shoulder_press'],
  [/overhead press|shoulder press|military|\bohp\b|push press/, 'ohp'],
  [/pull.?ups?\b|chin.?ups?\b/, 'pull_up'],
  [/pull.?down|lat pull/, 'lat_pulldown'],
  [/pullover|straight.?arm/, 'pullover'],
  [/(barbell|pendlay|t.?bar|yates|bent.?over).*row/, 'barbell_row'],
  [/(dumbbell|db|one.?arm|single.?arm|kroc).*row/, 'db_row'],
  [/machine.*row|row.*machine|chest.?supported/, 'machine_row'],
  [/\brows?\b/, 'cable_row'],
  [/reverse.*(uwu|wrist|forearm)/, 'reverse_wrist_curl'],
  [/uwu|wrist curl|forearm curl/, 'wrist_curl'],
  [/hammer/, 'hammer_curl'],
  [/preacher|spider/, 'preacher_curl'],
  [/reverse.*curl/, 'reverse_curl'],
  [/(barbell|\bez\b|\bbb\b|drag).*curl/, 'barbell_curl'],
  [/cable.*curl|bayesian/, 'cable_curl'],
  [/(dumbbell|db|incline|concentration).*curl/, 'db_curl'],
  [/curl/, 'cable_curl'],
];

/** Muscle keywords for unmapped exercises. */
const MUSCLE_WORDS = [
  [/chest|pec/, 'chest'],
  [/\blats?\b|back|rhomboid|trap/, 'back'],
  [/shoulder|delt/, 'shoulders'],
  [/bicep/, 'biceps'],
  [/tricep/, 'triceps'],
  [/\babs?\b|core|oblique/, 'abs'],
  [/quad|thigh/, 'quads'],
  [/hamstring|\bhams?\b/, 'hamstrings'],
  [/glute|butt/, 'glutes'],
  [/calf|calves/, 'calves'],
];

const CATEGORY_HINT = { push: 'chest', pull: 'back', legs: 'quads', leg: 'quads', upper: 'chest', lower: 'quads', arms: 'biceps', core: 'abs' };

const classifyCache = new Map();

/**
 * Map an exercise name to its movement pattern.
 * Returns { patternId, pattern, muscle, secondary, bw (leverage|null), mapped, excluded }.
 */
export function classifyExercise(name, categoryHint = '') {
  const key = `${name}|${categoryHint}`;
  const hit = classifyCache.get(key);
  if (hit) return hit;

  const n = String(name || '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  let result;
  if (EXCLUDE_RE.test(n)) {
    result = { patternId: null, pattern: null, muscle: null, secondary: [], bw: null, mapped: true, excluded: true };
  } else {
    const rule = RULES.find(([re]) => re.test(n));
    if (rule) {
      const pattern = PATTERNS[rule[1]];
      result = { patternId: rule[1], pattern, muscle: pattern.muscle, secondary: pattern.secondary || [], bw: pattern.bw ?? null, mapped: true, excluded: false };
    } else {
      const word = MUSCLE_WORDS.find(([re]) => re.test(n));
      const muscle = word ? word[1] : CATEGORY_HINT[String(categoryHint).toLowerCase()] || 'chest';
      result = { patternId: 'generic', pattern: PATTERNS.generic, muscle, secondary: [], bw: null, mapped: false, excluded: false };
    }
  }
  classifyCache.set(key, result);
  return result;
}

/* ================================================================== */
/* Estimated 1RM                                                        */
/* ================================================================== */

export const REP_CAP = 30;

/** Effective reps after RIR/RPE adjustment and the 30-rep cap. */
export function effectiveReps(reps, { rir, rpe } = {}) {
  let r = reps;
  let reserve = Number.isFinite(rir) && rir >= 0 ? rir : null;
  if (reserve === null && Number.isFinite(rpe) && rpe >= 5 && rpe <= 10) reserve = 10 - rpe;
  if (reserve !== null) r += reserve;
  return Math.min(r, REP_CAP);
}

/** Epley multiplier; exactly 1 for a single. */
export const repMultiplier = (reps) => (reps <= 1 ? 1 : 1 + Math.min(reps, REP_CAP) / 30);

/** Epley e1RM. `weight` is the total load moved. */
export function estimate1RM(weight, reps, adj) {
  if (!(Number.isFinite(weight) && weight > 0 && Number.isFinite(reps) && reps > 0)) return 0;
  return weight * repMultiplier(effectiveReps(reps, adj));
}

/** Total load for a set: external weight, plus bodyweight × leverage for bodyweight movements. */
export function totalLoad(cls, weightKg, bwKg) {
  const ext = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 0;
  return cls.bw ? (bwKg || 0) * cls.bw + ext : ext;
}

/* ================================================================== */
/* Strength Rating curve                                                */
/* ================================================================== */

/** Body-size normaliser. Bodyweight movements use plain ratio (the body *is* the load). */
function normaliser(bwKg, sex, cls) {
  if (cls.bw) return bwKg;
  const ref = REF_BW[sex] || REF_BW.male;
  return Math.pow(bwKg, ALLOMETRIC_EXP) * Math.pow(ref, 1 - ALLOMETRIC_EXP);
}

/** Strictly increasing map: calibrated ratio → score. Log-linear between anchors. */
export function ratioToScore(ratio, anchors) {
  if (!(ratio > 0)) return 0;
  const S = ANCHOR_SCORES;
  if (ratio <= anchors[0]) return 1 + (S[0] - 1) * (ratio / anchors[0]);
  for (let i = 0; i < anchors.length - 1; i++) {
    if (ratio <= anchors[i + 1]) {
      return S[i] + (S[i + 1] - S[i]) * (Math.log(ratio / anchors[i]) / Math.log(anchors[i + 1] / anchors[i]));
    }
  }
  const last = anchors.length - 1;
  const slope = (S[last] - S[last - 1]) / Math.log(anchors[last] / anchors[last - 1]);
  return S[last] + slope * Math.log(ratio / anchors[last]);
}

/** Inverse of ratioToScore. */
export function scoreToRatio(score, anchors) {
  const S = ANCHOR_SCORES;
  if (score <= 1) return (anchors[0] * Math.max(score - 1, 0)) / (S[0] - 1);
  if (score <= S[0]) return (anchors[0] * (score - 1)) / (S[0] - 1);
  for (let i = 0; i < anchors.length - 1; i++) {
    if (score <= S[i + 1]) {
      return anchors[i] * Math.exp(((score - S[i]) / (S[i + 1] - S[i])) * Math.log(anchors[i + 1] / anchors[i]));
    }
  }
  const last = anchors.length - 1;
  const slope = (S[last] - S[last - 1]) / Math.log(anchors[last] / anchors[last - 1]);
  return anchors[last] * Math.exp((score - S[last]) / slope);
}

/** Raw (unrounded) Strength Rating for an e1RM. */
export function scoreE1RM(e1rm, bwKg, sex, cls) {
  if (!(e1rm > 0 && bwKg > 0 && cls?.pattern)) return 0;
  return ratioToScore(e1rm / normaliser(bwKg, sex, cls), anchorsFor(cls.pattern, sex));
}

/** e1RM needed to reach `score`. */
export function e1rmForScore(score, bwKg, sex, cls) {
  return scoreToRatio(score, anchorsFor(cls.pattern, sex)) * normaliser(bwKg, sex, cls);
}

/* ================================================================== */
/* Set eligibility & scoring                                            */
/* ================================================================== */

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Whether a set can rank. Warm-ups, skipped/assisted (spotted) and empty sets don't. */
export function isEligibleSet(set, cls) {
  if (!set || !cls || cls.excluded || !cls.pattern) return false;
  if (set.warmup === true || set.isWarmup === true || set.type === 'warmup') return false;
  if (set.completed === false || set.skipped === true) return false;
  if (set.spotted === true) return false;
  if (!finite(set.reps) || set.reps <= 0) return false;
  if (set.weight !== null && set.weight !== undefined && (!finite(set.weight) || set.weight < 0)) return false;
  if (cls.bw) return true;
  return finite(set.weight) && set.weight > 0;
}

/** Score one set. Returns null when ineligible. */
export function scoreSet(set, cls, bwKg, sex) {
  if (!isEligibleSet(set, cls) || !(bwKg > 0)) return null;
  const load = totalLoad(cls, set.weight, bwKg);
  const e1rm = estimate1RM(load, set.reps, { rir: set.rir, rpe: set.rpe });
  if (!(e1rm > 0)) return null;
  return { e1rm, score: scoreE1RM(e1rm, bwKg, sex, cls), weightKg: finite(set.weight) ? set.weight : 0, reps: set.reps, bwKg };
}

/* ================================================================== */
/* Aggregation                                                          */
/* ================================================================== */

export const MUSCLE_WEIGHTS = [0.6, 0.25, 0.15];
export const OVERALL_WEIGHTS = [0.25, 0.22, 0.18, 0.14, 0.11, 0.1];
/** Weaker or missing 2nd/3rd exercises count as this share of the muscle's best lift. */
export const MUSCLE_FLOOR = 0.9;

/**
 * Muscle score: 60/25/15 over the top three exercises. A slot that is empty, or holds a
 * lift weaker than 90% of the best, counts as 90% of the best, so logging a light
 * accessory can never lower a muscle, and a broad set of strong lifts lifts it to 100%.
 */
export function muscleScore(scores) {
  const sorted = scores.filter((s) => s > 0).sort((a, b) => b - a);
  if (!sorted.length) return 0;
  const floor = sorted[0] * MUSCLE_FLOOR;
  return MUSCLE_WEIGHTS.reduce((sum, w, i) => sum + w * (i === 0 ? sorted[0] : Math.max(sorted[i] ?? 0, floor)), 0);
}

/** Overall: top-six weighted average over ranked muscles, normalised to how many are ranked. */
export function overallScore(muscleScores) {
  const sorted = muscleScores.filter((s) => s > 0).sort((a, b) => b - a).slice(0, OVERALL_WEIGHTS.length);
  if (!sorted.length) return 0;
  const wsum = OVERALL_WEIGHTS.slice(0, sorted.length).reduce((a, b) => a + b, 0);
  return sorted.reduce((sum, s, i) => sum + s * OVERALL_WEIGHTS[i], 0) / wsum;
}

/* ================================================================== */
/* Building ranks from logs                                             */
/* ================================================================== */

/** Current names from routine templates (renames propagate to rank screens). */
function templateIndex(workouts) {
  const map = new Map();
  for (const [category, list] of Object.entries(workouts || {})) {
    for (const ex of list || []) map.set(ex.id, { name: ex.name, category });
  }
  return map;
}

/**
 * Fold one day's log into a bests map (mutates `bests`). Returns ids that improved.
 * bests: Map<exerciseId, { id, name, category, cls, best }>
 */
function foldLog(bests, date, log, profile, templates) {
  const improved = [];
  const sex = profile?.sex || 'male';
  const bw = bodyweightOn(profile, date);
  if (!bw || !log || !Array.isArray(log.exercises)) return improved;
  for (const entry of log.exercises) {
    const tpl = templates.get(entry.exerciseId);
    const name = tpl?.name || entry.name;
    const category = tpl?.category || log.category;
    const cls = classifyExercise(name, category);
    if (cls.excluded) continue;
    let rec = bests.get(entry.exerciseId);
    for (const set of entry.sets || []) {
      const s = scoreSet(set, cls, bw, sex);
      if (!s) continue;
      if (!rec) {
        rec = { id: entry.exerciseId, name, category, cls, best: null };
        bests.set(entry.exerciseId, rec);
      }
      if (!rec.best || s.score > rec.best.score + 1e-9) {
        rec.best = { ...s, date };
        if (!improved.includes(entry.exerciseId)) improved.push(entry.exerciseId);
      }
    }
  }
  return improved;
}

/** Turn a bests map into the three ranking layers. */
export function summarize(bests) {
  const exercises = [...bests.values()]
    .filter((r) => r.best)
    .map((r) => ({ id: r.id, name: r.name, category: r.category, muscle: r.cls.muscle, patternId: r.cls.patternId, cls: r.cls, mapped: r.cls.mapped, best: r.best, score: r.best.score, rank: rankOf(r.best.score) }))
    .sort((a, b) => b.score - a.score);

  const muscles = {};
  for (const m of MUSCLES) {
    const list = exercises.filter((e) => e.muscle === m.id);
    const score = muscleScore(list.map((e) => e.score));
    muscles[m.id] = { id: m.id, name: m.name, score, rank: rankOf(score), exercises: list, top: list[0] || null };
  }

  const ranked = Object.values(muscles).filter((m) => m.score > 0);
  const score = overallScore(ranked.map((m) => m.score));
  return {
    exercises,
    byId: Object.fromEntries(exercises.map((e) => [e.id, e])),
    muscles,
    overall: { score, rank: rankOf(score), rankedMuscles: ranked.length, totalMuscles: MUSCLES.length },
  };
}

const sortedDates = (logs) => Object.keys(logs || {}).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();

/**
 * All-time ranks.
 * opts.before  — only logs strictly before this date (pre-session snapshot)
 * opts.through — only logs on or before this date
 */
export function computeRanks(state, profile, opts = {}) {
  const bests = new Map();
  const templates = templateIndex(state?.workouts);
  for (const date of sortedDates(state?.logs)) {
    if (opts.before && date >= opts.before) continue;
    if (opts.through && date > opts.through) continue;
    foldLog(bests, date, state.logs[date], profile, templates);
  }
  return summarize(bests);
}

/**
 * Overall rating after each training day, chronologically.
 * [{ date, score, category, improved: [{ id, name, best }] }]
 */
export function rankHistory(state, profile) {
  const bests = new Map();
  const templates = templateIndex(state?.workouts);
  const out = [];
  for (const date of sortedDates(state?.logs)) {
    const log = state.logs[date];
    const improvedIds = foldLog(bests, date, log, profile, templates);
    if (!bests.size) continue;
    const summary = summarize(bests);
    const prev = out.at(-1);
    if (!improvedIds.length && prev) continue;
    out.push({
      date,
      score: summary.overall.score,
      category: log.category,
      improved: improvedIds.map((id) => ({ id, name: bests.get(id).name, best: bests.get(id).best })),
    });
  }
  return out;
}

/** Ranks that went up a division (or tier) between two summaries. */
export function diffRanks(before, after) {
  const promoted = (a, b) => rankStep(b) > rankStep(a);
  const exercises = after.exercises
    .filter((e) => promoted(before.byId[e.id]?.score || 0, e.score))
    .map((e) => ({ ...e, from: rankOf(before.byId[e.id]?.score || 0), to: e.rank }));
  const muscles = MUSCLES.map((m) => after.muscles[m.id])
    .filter((m) => promoted(before.muscles[m.id].score, m.score))
    .map((m) => ({ ...m, from: before.muscles[m.id].rank, to: m.rank }));
  const overall = promoted(before.overall.score, after.overall.score)
    ? { from: before.overall.rank, to: after.overall.rank, score: after.overall.score }
    : null;
  return { exercises, muscles, overall, any: Boolean(exercises.length || muscles.length || overall) };
}

/* ================================================================== */
/* Inverse target solver                                                */
/* ================================================================== */

export const MAX_EXTRA_REPS = 20;

/** Fewest reps at `load` (kg total) reaching `needE1rm`; null if beyond the rep cap. */
export function repsToReach(load, needE1rm) {
  if (!(load > 0)) return null;
  if (load >= needE1rm) return 1;
  const r = Math.max(2, Math.ceil(30 * (needE1rm / load - 1) - 1e-9));
  return r <= REP_CAP ? r : null;
}

/** Total load needed at `reps` to reach `needE1rm`. */
export const loadToReach = (reps, needE1rm) => needE1rm / repMultiplier(Math.min(reps, REP_CAP));

/**
 * Minimum change to an exercise's best set that reaches `targetScore`, scored at the
 * lifter's *current* bodyweight. Weights round up to plate jumps in the display unit.
 *  → { targetScore, moreReps: { weightKg, reps, delta } | null, moreWeight: { weight, weightKg, reps, delta } | null }
 */
export function solveTarget(cls, best, targetScore, profile) {
  const bw = profile?.bodyweight;
  const sex = profile?.sex || 'male';
  const unit = profile?.unit || 'kg';
  if (!(bw > 0) || !cls?.pattern) return null;
  const need = e1rmForScore(targetScore, bw, sex, cls);
  const extKg = best?.weightKg || 0;
  const reps = best?.reps || 1;

  let moreReps = null;
  const load = totalLoad(cls, extKg, bw);
  const r = repsToReach(load, need);
  if (r !== null) {
    const target = Math.max(r, reps + 1);
    if (target - reps <= MAX_EXTRA_REPS && target <= REP_CAP) moreReps = { weightKg: extKg, reps: target, delta: target - reps };
  }

  const neededExtKg = loadToReach(reps, need) - (cls.bw ? bw * cls.bw : 0);
  const current = fromKg(extKg, unit);
  let weight = ceilToPlate(Math.max(neededExtKg, 0), unit);
  if (weight <= current + 1e-9) weight = Math.ceil((current + plateStep(unit) - 1e-9) / plateStep(unit)) * plateStep(unit);
  const moreWeight = { weight, weightKg: toKg(weight, unit), reps, delta: Math.round((weight - current) * 100) / 100 };

  return { targetScore, moreReps, moreWeight };
}

/**
 * What it takes to reach the next division and the next tier from an exercise's best.
 * `exercise` = an entry from computeRanks().exercises.
 */
export function getNextRankTarget(exercise, profile) {
  if (!exercise?.best) return null;
  const nextDiv = exercise.rank.next;
  const nextTier = nextTierOf(exercise.score);
  return {
    nextDivision: nextDiv ? { ...nextDiv, ...solveTarget(exercise.cls, exercise.best, nextDiv.minScore, profile) } : null,
    nextTier:
      nextTier && (!nextDiv || nextTier.minScore !== nextDiv.minScore)
        ? { ...nextTier, ...solveTarget(exercise.cls, exercise.best, nextTier.minScore, profile) }
        : null,
  };
}

/* ================================================================== */
/* Sandbox / live helpers                                               */
/* ================================================================== */

/** Score a hypothetical set (calculator & live pill). */
export function simulateSet(name, category, weightKg, reps, profile) {
  const cls = classifyExercise(name, category);
  if (cls.excluded || !(profile?.bodyweight > 0)) return null;
  const s = scoreSet({ weight: weightKg, reps, spotted: false }, cls, profile.bodyweight, profile.sex);
  return s ? { ...s, cls, rank: rankOf(s.score) } : null;
}

/**
 * Next division for a muscle, reached by improving its best exercise.
 * Solves the muscle blend for the top exercise's required score, then that lift's set.
 */
export function getMuscleTarget(muscle, profile) {
  const top = muscle?.top;
  const next = muscle?.rank?.next;
  if (!top || !next) return null;
  const others = muscle.exercises.slice(1).map((e) => e.score);
  const goal = next.minScore - 0.5; // ratings round to the nearest integer
  let lo = top.score;
  let hi = Math.max(top.score * 3, next.minScore * 3);
  if (muscleScore([hi, ...others]) < goal) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (muscleScore([mid, ...others]) >= goal) hi = mid;
    else lo = mid;
  }
  return { ...next, exercise: top, ...solveTarget(top.cls, top.best, hi, profile) };
}

/** Every exercise name the calculator can offer: routines, logs, then the standard library. */
export function exerciseOptions(state) {
  const seen = new Map();
  const add = (name, category, source) => {
    const key = String(name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.set(key, { name: String(name).trim(), category, source });
  };
  for (const [category, list] of Object.entries(state?.workouts || {})) for (const ex of list || []) add(ex.name, category, 'routine');
  for (const log of Object.values(state?.logs || {})) for (const e of log?.exercises || []) add(e.name, log.category, 'logged');
  for (const p of Object.values(PATTERNS)) if (p !== PATTERNS.generic) add(p.label, '', 'library');
  return [...seen.values()].filter((o) => !classifyExercise(o.name, o.category).excluded);
}
