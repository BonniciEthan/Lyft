import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PATTERNS,
  TIERS,
  anchorsFor,
  classifyExercise,
  computeRanks,
  diffRanks,
  e1rmForScore,
  estimate1RM,
  getNextRankTarget,
  isEligibleSet,
  muscleScore,
  overallScore,
  rankHistory,
  rankOf,
  ratioToScore,
  scoreE1RM,
  scoreSet,
  scoreToRatio,
  simulateSet,
  repsToReach,
} from '../src/lib/rankingEngine.js';
import {
  bodyweightOn,
  ceilToPlate,
  formatWeight,
  normalizeProfile,
  parseWeightInput,
  setBodyweight,
  toKg,
  fromKg,
} from '../src/lib/lifterProfileStore.js';

const male80 = normalizeProfile({ bodyweight: 80, sex: 'male', unit: 'kg', bodyweightHistory: [{ date: '2026-01-01', weightKg: 80 }] });
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

const log = (category, exercises) => ({ category, exercises: exercises.map(([id, name, sets]) => ({ exerciseId: id, name, sets: sets.map(([weight, reps, spotted = false]) => ({ weight, reps, spotted })) })) });
const stateOf = (logs) => ({ workouts: {}, logs });

/* ---------------- Epley ---------------- */

test('Epley: single equals weight, standard multiplier otherwise', () => {
  assert.equal(estimate1RM(100, 1), 100);
  close(estimate1RM(100, 5), 100 * (1 + 5 / 30));
  close(estimate1RM(100, 10), 100 * (1 + 10 / 30));
});

test('Epley: reps cap at 30', () => {
  assert.equal(estimate1RM(50, 30), 100);
  assert.equal(estimate1RM(50, 60), 100);
});

test('Epley: RIR and RPE extend effective reps (still capped)', () => {
  close(estimate1RM(100, 5, { rir: 2 }), 100 * (1 + 7 / 30));
  close(estimate1RM(100, 5, { rpe: 8 }), 100 * (1 + 7 / 30));
  assert.equal(estimate1RM(50, 29, { rir: 5 }), 100);
});

test('Epley: zero / NaN / null inputs give 0', () => {
  assert.equal(estimate1RM(100, 0), 0);
  assert.equal(estimate1RM(0, 5), 0);
  assert.equal(estimate1RM(NaN, 5), 0);
  assert.equal(estimate1RM(100, null), 0);
});

/* ---------------- Eligibility ---------------- */

test('Set eligibility excludes empty, zero, spotted, warmup, cardio', () => {
  const bench = classifyExercise('Flat Barbell Bench');
  assert.ok(isEligibleSet({ weight: 100, reps: 5 }, bench));
  assert.ok(!isEligibleSet({ weight: 100, reps: 0 }, bench));
  assert.ok(!isEligibleSet({ weight: 0, reps: 5 }, bench));
  assert.ok(!isEligibleSet({ weight: null, reps: 5 }, bench));
  assert.ok(!isEligibleSet({ weight: 100, reps: null }, bench));
  assert.ok(!isEligibleSet({ weight: 100, reps: 5, spotted: true }, bench));
  assert.ok(!isEligibleSet({ weight: 100, reps: 5, warmup: true }, bench));
  assert.ok(!isEligibleSet({ weight: 100, reps: 5, completed: false }, bench));
  assert.ok(classifyExercise('Treadmill Run').excluded);
  assert.ok(classifyExercise('Plank').excluded);
});

/* ---------------- Classification ---------------- */

test('Every seed exercise maps to a sensible muscle', () => {
  const expect = {
    'Flat Barbell Bench': ['bench', 'chest'],
    'Incline Dumbbell Bench': ['incline_db_press', 'chest'],
    'High to Low Cable Extensions': ['cable_fly', 'chest'],
    'Side Cable Lateral Raises': ['lateral_raise', 'shoulders'],
    'Tricep Rope Overhead Extension': ['overhead_extension', 'triceps'],
    'Tricep Bar Pushdown': ['pushdown', 'triceps'],
    'Uwu Curls': ['wrist_curl', 'biceps'],
    'Reverse Uwu Curls': ['reverse_wrist_curl', 'biceps'],
    'Wrist Curls': ['wrist_curl', 'biceps'],
    'Reverse Forearm Curl': ['reverse_wrist_curl', 'biceps'],
    'Reverse Barbell Curl': ['reverse_curl', 'biceps'],
    'Wide Grip Lat Pulldown': ['lat_pulldown', 'back'],
    'Close Grip Lat Pulldown': ['lat_pulldown', 'back'],
    'Close Grip Cable Rows': ['cable_row', 'back'],
    'Flat Grip Machine Row': ['machine_row', 'back'],
    'Reverse Pec Dec': ['rear_delt', 'shoulders'],
    'Face Pulls': ['face_pull', 'shoulders'],
    'Kelso Shrugs': ['kelso_shrug', 'back'],
    Shrugs: ['shrug', 'shoulders'],
    'Dumbbell Curls': ['db_curl', 'biceps'],
    'Cable Hammer Curls': ['hammer_curl', 'biceps'],
    Squats: ['squat', 'quads'],
    SLDL: ['rdl', 'hamstrings'],
    'Leg Extensions': ['leg_extension', 'quads'],
    'Hamstring Curls': ['leg_curl', 'hamstrings'],
    'Standing Calf Raises': ['calf_raise', 'calves'],
    'Abductor Machine': ['abductor', 'glutes'],
    'Adductor Machine': ['adductor', 'quads'],
    'Incline Dragon Flag': ['dragon_flag', 'abs'],
    'Overhead Press': ['ohp', 'shoulders'],
    'Conventional Deadlift': ['deadlift', 'back'],
    'Romanian Deadlift': ['rdl', 'hamstrings'],
    'Leg Press': ['leg_press', 'quads'],
    'Barbell Row': ['barbell_row', 'back'],
    'Pull-Ups': ['pull_up', 'back'],
    'Chin Ups': ['pull_up', 'back'],
    Dips: ['dip', 'triceps'],
    'Push-Ups': ['push_up', 'chest'],
    Skullcrushers: ['skullcrusher', 'triceps'],
    'Hammer Curl': ['hammer_curl', 'biceps'],
    'Barbell Curl': ['barbell_curl', 'biceps'],
    'Cable Crunch': ['crunch', 'abs'],
    'Hanging Leg Raises': ['hanging_leg_raise', 'abs'],
    'Hip Thrust': ['hip_thrust', 'glutes'],
    'Lateral Raise': ['lateral_raise', 'shoulders'],
    'Dumbbell Bench Press': ['db_bench', 'chest'],
    'Incline Bench Press': ['incline_bench', 'chest'],
  };
  for (const [name, [pattern, muscle]] of Object.entries(expect)) {
    const c = classifyExercise(name);
    assert.equal(c.patternId, pattern, name);
    assert.equal(c.muscle, muscle, name);
  }
});

test('Unknown exercises fall back to keyword or category muscle', () => {
  assert.equal(classifyExercise('Mystery Glute Machine').muscle, 'glutes');
  assert.equal(classifyExercise('Zottman Thing', 'Pull').muscle, 'back');
  assert.equal(classifyExercise('Zottman Thing', 'Legs').muscle, 'quads');
  assert.equal(classifyExercise('Zottman Thing').mapped, false);
});

/* ---------------- Curves ---------------- */

test('Anchors are strictly increasing for every pattern and sex', () => {
  for (const [id, p] of Object.entries(PATTERNS)) {
    for (const sex of ['male', 'female']) {
      const a = anchorsFor(p, sex);
      for (let i = 1; i < a.length; i++) assert.ok(a[i] > a[i - 1], `${id}/${sex}`);
    }
  }
});

test('Score curve is monotonic and invertible', () => {
  const a = PATTERNS.bench.m;
  let prev = 0;
  for (let r = 0.01; r < 4; r += 0.01) {
    const s = ratioToScore(r, a);
    assert.ok(s > prev, `monotonic at ${r}`);
    close(scoreToRatio(s, a), r, 1e-9);
    prev = s;
  }
});

test('More weight or reps never lowers the rating (all patterns)', () => {
  for (const id of Object.keys(PATTERNS)) {
    const cls = { patternId: id, pattern: PATTERNS[id], bw: PATTERNS[id].bw ?? null, muscle: PATTERNS[id].muscle };
    for (const sex of ['male', 'female']) {
      let prev = -1;
      for (let w = 5; w <= 300; w += 5) {
        const s = scoreSet({ weight: w, reps: 5 }, cls, 80, sex).score;
        assert.ok(s >= prev, `${id} weight`);
        prev = s;
      }
      prev = -1;
      for (let r = 1; r <= 40; r++) {
        const s = scoreSet({ weight: 60, reps: r }, cls, 80, sex).score;
        assert.ok(s >= prev, `${id} reps`);
        prev = s;
      }
    }
  }
});

test('Calibration: 1×BW bench ≈ Gold for an 80 kg man, intermediate lifts land mid-ladder', () => {
  const bench = classifyExercise('Bench Press');
  const s = scoreE1RM(80, 80, 'male', bench);
  assert.equal(rankOf(s).tier.name, 'Gold');
  assert.equal(rankOf(scoreE1RM(80 * 2.0, 80, 'male', classifyExercise('Deadlift'))).tier.name, 'Gold');
  // Same absolute lift scores higher for a woman.
  assert.ok(scoreE1RM(60, 62, 'female', bench) > scoreE1RM(60, 62, 'male', bench));
});

test('Allometric: same ratio favours the heavier lifter, same load favours the lighter one', () => {
  const sq = classifyExercise('Squat');
  assert.ok(scoreE1RM(120 * 1.5, 120, 'male', sq) > scoreE1RM(60 * 1.5, 60, 'male', sq));
  assert.ok(scoreE1RM(120, 60, 'male', sq) > scoreE1RM(120, 100, 'male', sq));
  // Less extreme than plain ratio: 120 kg lifter's 2x ratio vs 60 kg lifter's 2x.
  const plainGap = 0; // plain ratio would score them identically
  assert.ok(scoreE1RM(240, 120, 'male', sq) - scoreE1RM(120, 60, 'male', sq) > plainGap);
  close(scoreE1RM(80 * 1.5, 80, 'male', sq), 470, 1e-6); // reference BW hits the anchor exactly
});

/* ---------------- Bodyweight lifts ---------------- */

test('Bodyweight lifts: pull-ups use BW, added weight stacks, push-ups use 0.65 leverage', () => {
  const pu = classifyExercise('Pull-Ups');
  const bwOnly = scoreSet({ weight: null, reps: 10 }, pu, 80, 'male');
  close(bwOnly.e1rm, 80 * (1 + 10 / 30));
  const weighted = scoreSet({ weight: 20, reps: 10 }, pu, 80, 'male');
  close(weighted.e1rm, 100 * (1 + 10 / 30));
  assert.ok(weighted.score > bwOnly.score);

  const push = classifyExercise('Push-Ups');
  close(scoreSet({ weight: 0, reps: 1 }, push, 80, 'male').e1rm, 52);
  // Weighted (non-BW) lifts still need weight.
  assert.equal(scoreSet({ weight: null, reps: 10 }, classifyExercise('Bench'), 80, 'male'), null);
});

/* ---------------- Tiers / LP ---------------- */

test('Tier boundaries, divisions and LP', () => {
  assert.equal(rankOf(0).ranked, false);
  assert.equal(rankOf(1).label, 'Wood III');
  assert.equal(rankOf(66).label, 'Wood III');
  assert.equal(rankOf(67).label, 'Wood II');
  assert.equal(rankOf(134).label, 'Wood I');
  assert.equal(rankOf(199).label, 'Wood I');
  assert.equal(rankOf(200).label, 'Bronze III');
  assert.equal(rankOf(233).label, 'Bronze III');
  assert.equal(rankOf(234).label, 'Bronze II');
  assert.equal(rankOf(267).label, 'Bronze I');
  assert.equal(rankOf(299).label, 'Bronze I');
  assert.equal(rankOf(542).label, 'Platinum II');
  assert.equal(rankOf(899).label, 'Titan I');
  assert.equal(rankOf(900).label, 'Olympian');
  assert.equal(rankOf(1234).lp, 334);
  assert.equal(rankOf(1234).next, null);
  assert.equal(rankOf(200).lp, 0);
  assert.equal(rankOf(233).lp, 97);
  assert.equal(rankOf(542).lp, Math.floor((542 - 534) / 33 * 100));
  assert.equal(rankOf(299).next.label, 'Silver III');
  assert.equal(rankOf(899).next.label, 'Olympian');
  for (const t of TIERS) assert.ok(t.color.startsWith('#'));
  // Every integer 1..899 has a division and LP 0..99.
  for (let s = 1; s < 900; s++) {
    const r = rankOf(s);
    assert.ok(r.division && r.lp >= 0 && r.lp <= 99, String(s));
  }
});

/* ---------------- Aggregation ---------------- */

test('Muscle score: light accessory never lowers it; more strong lifts raise it', () => {
  const one = muscleScore([600]);
  assert.ok(muscleScore([600, 100]) >= one);
  assert.ok(muscleScore([600, 100, 50]) >= one);
  assert.ok(muscleScore([600, 590, 580]) > one);
  assert.ok(muscleScore([600, 600, 600]) === 600);
  assert.equal(muscleScore([]), 0);
});

test('Overall: weighted toward strongest muscles, unranked ignored', () => {
  assert.equal(overallScore([500]), 500);
  assert.equal(overallScore([0, 0, 500]), 500);
  const s = overallScore([700, 500]);
  close(s, (700 * 0.25 + 500 * 0.22) / 0.47);
  assert.equal(overallScore([]), 0);
});

/* ---------------- Ranks from logs ---------------- */

test('computeRanks: all-time best set wins; spotted sets ignored; unlogged muscles unranked', () => {
  const state = stateOf({
    '2026-02-01': log('Push', [['b', 'Flat Barbell Bench', [[80, 5], [90, 1]]]]),
    '2026-03-01': log('Push', [['b', 'Flat Barbell Bench', [[85, 2], [120, 5, true]]]]),
  });
  const r = computeRanks(state, male80);
  const bench = r.byId.b;
  assert.equal(bench.best.weightKg, 80);
  assert.equal(bench.best.reps, 5);
  assert.equal(r.muscles.chest.rank.ranked, true);
  assert.equal(r.muscles.calves.rank.ranked, false);
  assert.equal(r.muscles.calves.score, 0);
  assert.equal(r.overall.rankedMuscles, 1);
});

test('Historical bodyweight is matched to each workout date', () => {
  const p = normalizeProfile({
    bodyweight: 90,
    bodyweightHistory: [
      { date: '2026-01-01', weightKg: 70 },
      { date: '2026-06-01', weightKg: 90 },
    ],
  });
  assert.equal(bodyweightOn(p, '2025-12-01'), 70);
  assert.equal(bodyweightOn(p, '2026-03-01'), 70);
  assert.equal(bodyweightOn(p, '2026-06-01'), 90);
  assert.equal(bodyweightOn(normalizeProfile({ bodyweight: 85 }), '2026-03-01'), 85);
  const state = stateOf({ '2026-03-01': log('Push', [['b', 'Bench', [[100, 1]]]]) });
  const r = computeRanks(state, p);
  assert.equal(r.byId.b.best.bwKg, 70);
});

test('before / through filters and diffRanks detect promotions', () => {
  const state = stateOf({
    '2026-02-01': log('Push', [['b', 'Bench', [[60, 5]]]]),
    '2026-02-08': log('Push', [['b', 'Bench', [[100, 5]]]]),
  });
  const before = computeRanks(state, male80, { before: '2026-02-08' });
  const after = computeRanks(state, male80, { through: '2026-02-08' });
  const d = diffRanks(before, after);
  assert.ok(d.any);
  assert.equal(d.exercises[0].id, 'b');
  assert.ok(d.muscles.some((m) => m.id === 'chest'));
  assert.ok(d.overall);
  assert.equal(diffRanks(after, after).any, false);
});

test('rankHistory: chronological, one point per improving day', () => {
  const state = stateOf({
    '2026-02-08': log('Push', [['b', 'Bench', [[100, 5]]]]),
    '2026-02-01': log('Push', [['b', 'Bench', [[60, 5]]]]),
    '2026-02-15': log('Push', [['b', 'Bench', [[50, 5]]]]),
  });
  const h = rankHistory(state, male80);
  assert.deepEqual(h.map((p) => p.date), ['2026-02-01', '2026-02-08']);
  assert.ok(h[1].score > h[0].score);
});

/* ---------------- Inverse solver ---------------- */

test('repsToReach returns the minimum reps', () => {
  assert.equal(repsToReach(100, 90), 1);
  assert.equal(repsToReach(100, 100 * (1 + 7 / 30)), 7);
  assert.equal(repsToReach(100, 100 * (1 + 7 / 30) + 0.01), 8);
  assert.equal(repsToReach(10, 1000), null);
});

test('getNextRankTarget hits exactly the next division at minimum cost', () => {
  const state = stateOf({ '2026-02-01': log('Push', [['b', 'Bench', [[80, 5]]]]) });
  const ex = computeRanks(state, male80).byId.b;
  const t = getNextRankTarget(ex, male80);
  const nd = t.nextDivision;
  assert.equal(nd.minScore, ex.rank.next.minScore);
  const cls = ex.cls;

  // Reps route: the suggested reps reach the target, one fewer does not.
  assert.ok(nd.moreReps.delta >= 1);
  const atReps = scoreSet({ weight: 80, reps: nd.moreReps.reps }, cls, 80, 'male').score;
  assert.ok(atReps >= nd.minScore - 0.5);
  if (nd.moreReps.reps - 1 > 5) {
    const below = scoreSet({ weight: 80, reps: nd.moreReps.reps - 1 }, cls, 80, 'male').score;
    assert.ok(below < nd.minScore);
  }

  // Weight route: plate-rounded (1.25 kg) and sufficient.
  assert.equal((nd.moreWeight.weight / 1.25) % 1, 0);
  const atWeight = scoreSet({ weight: nd.moreWeight.weightKg, reps: 5 }, cls, 80, 'male').score;
  assert.ok(atWeight >= nd.minScore - 0.5);
  const lighter = scoreSet({ weight: nd.moreWeight.weightKg - 1.25, reps: 5 }, cls, 80, 'male').score;
  assert.ok(lighter < nd.minScore);
});

test('Solver in lbs rounds to 2.5 lb plates', () => {
  const lbs = normalizeProfile({ ...male80, unit: 'lbs' });
  const state = stateOf({ '2026-02-01': log('Push', [['b', 'Bench', [[80, 5]]]]) });
  const ex = computeRanks(state, lbs).byId.b;
  const t = getNextRankTarget(ex, lbs);
  assert.equal((t.nextDivision.moreWeight.weight / 2.5) % 1, 0);
});

test('Required e1RM round-trips through the score', () => {
  const cls = classifyExercise('Squat');
  for (const target of [50, 200, 450, 650, 899, 1000]) {
    close(scoreE1RM(e1rmForScore(target, 80, 'male', cls), 80, 'male', cls), target, 1e-6);
  }
});

/* ---------------- Units / profile ---------------- */

test('kg / lbs conversion and rounding', () => {
  close(toKg(100, 'lbs'), 45.359237);
  close(fromKg(45.359237, 'lbs'), 100);
  assert.equal(parseWeightInput('176.4', 'lbs'), Math.round(176.4 * 0.45359237 * 100) / 100);
  assert.equal(parseWeightInput('0', 'kg'), null);
  assert.equal(parseWeightInput('abc', 'kg'), null);
  assert.equal(formatWeight(80, 'kg'), '80 kg');
  assert.equal(formatWeight(80.1, 'kg'), '80 kg');
  assert.equal(formatWeight(80.2, 'kg'), '80.25 kg');
  assert.equal(formatWeight(80, 'lbs'), '176.5 lbs');
  assert.equal(ceilToPlate(80.1, 'kg'), 81.25);
  assert.equal(ceilToPlate(80, 'kg'), 80);
  assert.equal(ceilToPlate(toKg(181, 'lbs'), 'lbs'), 182.5);
});

test('Profile normalisation and bodyweight logging', () => {
  const p = normalizeProfile(null);
  assert.deepEqual(p, { bodyweight: null, sex: 'male', unit: 'kg', bodyweightHistory: [], displayName: 'Lifter', avatarDataUrl: null });
  const bad = normalizeProfile({ sex: 'x', unit: 'stone', bodyweight: -5, bodyweightHistory: [{ date: 'nope', weightKg: 3 }] });
  assert.equal(bad.sex, 'male');
  assert.equal(bad.unit, 'kg');
  assert.equal(bad.bodyweight, null);
  assert.equal(bad.bodyweightHistory.length, 0);

  let q = setBodyweight(p, 82, '2026-03-01');
  q = setBodyweight(q, 80, '2026-01-01');
  q = setBodyweight(q, 81, '2026-03-01');
  assert.deepEqual(q.bodyweightHistory.map((h) => h.date), ['2026-01-01', '2026-03-01']);
  assert.equal(q.bodyweight, 81);
});

test('simulateSet previews without touching state', () => {
  const sim = simulateSet('Squats', 'Legs', 120, 5, male80);
  assert.ok(sim.rank.ranked);
  assert.equal(simulateSet('Squats', 'Legs', 120, 5, normalizeProfile({})), null);
});
