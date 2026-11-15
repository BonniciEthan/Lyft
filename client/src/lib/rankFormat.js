import { formatWeight } from './lifterProfileStore.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const trim = (n) => String(Math.round(n * 100) / 100);

/** "100 kg × 5", "BW × 12", "BW+10 kg × 6". */
export function formatSet(weightKg, reps, cls, unit) {
  if (cls?.bw) return weightKg > 0 ? `BW+${formatWeight(weightKg, unit)} × ${reps}` : `BW × ${reps}`;
  return `${formatWeight(weightKg, unit)} × ${reps}`;
}

/** Weight already in display units (from the solver). */
function displaySet(weight, reps, cls, unit) {
  if (cls?.bw) return weight > 0 ? `BW+${trim(weight)} ${unit} × ${reps}` : `BW × ${reps}`;
  return `${trim(weight)} ${unit} × ${reps}`;
}

/** Both ways to reach a solved target: ["105 kg × 5 (+2.5 kg)", "102.5 kg × 6 (+1 rep)"]. */
export function targetOptions(target, cls, unit) {
  if (!target) return [];
  const out = [];
  if (target.moreWeight) {
    const w = target.moreWeight;
    out.push({ kind: 'weight', text: displaySet(w.weight, w.reps, cls, unit), delta: `+${trim(w.delta)} ${unit}` });
  }
  if (target.moreReps) {
    const r = target.moreReps;
    out.push({ kind: 'reps', text: formatSet(r.weightKg, r.reps, cls, unit), delta: `+${plural(r.delta, 'rep')}` });
  }
  return out;
}

export { plural };
