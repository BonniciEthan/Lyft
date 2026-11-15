import { classifyExercise, e1rmForScore, rankOf, rankStep, repsToReach, scoreSet, totalLoad } from './rankingEngine.js';
import { plural } from './rankFormat.js';

/**
 * Live status for one exercise card in the session logger.
 *
 *  baseline — that exercise's rank from sessions *before* this day (or undefined)
 *  entry    — the day's entry { name, sets }
 *
 * Returns { tone, rank, text } or null.
 *   tone: 'idle' | 'target' | 'pr' | 'rankup' | 'muted'
 */
export function liveRankStatus(entry, baseline, profile, category) {
  if (!entry || !(profile?.bodyweight > 0)) return null;
  const cls = classifyExercise(entry.name, category);
  if (cls.excluded) return null;
  const bw = profile.bodyweight;
  const sex = profile.sex;

  const baseScore = baseline?.score || 0;
  const baseRank = rankOf(baseScore);

  // Best eligible set today.
  let dayBest = null;
  for (const set of entry.sets || []) {
    const s = scoreSet(set, cls, bw, sex);
    if (s && (!dayBest || s.score > dayBest.score)) dayBest = s;
  }

  if (dayBest && Math.round(dayBest.score) > Math.round(baseScore)) {
    const now = rankOf(dayBest.score);
    if (rankStep(dayBest.score) > rankStep(baseScore)) {
      return { tone: 'rankup', rank: now, text: `RANK UP! → ${now.label}` };
    }
    const gain = now.lp - baseRank.lp; // same division, so LP is comparable
    const lpText = now.tier.id === 'olympian' ? `${now.lp} LP` : `${now.lp}/100 LP`;
    return { tone: 'pr', rank: now, text: `+${Math.max(1, gain)} LP (${now.label} — ${lpText})` };
  }

  // The set being typed: the last one with anything entered.
  const active = [...(entry.sets || [])].reverse().find((s) => s.weight !== null || s.reps !== null);
  const next = baseRank.next;

  if (active?.spotted) return { tone: 'muted', rank: baseRank, text: "Spotted sets don't rank" };

  if (active && next && (cls.bw || active.weight > 0)) {
    if (!baseRank.ranked) {
      return { tone: 'target', rank: baseRank, text: active.reps ? 'Log a working set to rank' : 'Any full rep ranks this lift' };
    }
    const need = e1rmForScore(next.minScore - 0.5, bw, sex, cls);
    const load = totalLoad(cls, active.weight, bw);
    const reps = repsToReach(load, need);
    if (reps === null) return { tone: 'target', rank: baseRank, text: `Go heavier for ${next.label}` };
    if (active.reps && active.reps < reps) {
      return { tone: 'target', rank: baseRank, text: `${plural(reps - active.reps, 'more rep')} for ${next.label}` };
    }
    return { tone: 'target', rank: baseRank, text: `Hit ${reps} reps for ${next.label}` };
  }

  if (!baseRank.ranked) return { tone: 'idle', rank: baseRank, text: 'Unranked' };
  return { tone: 'idle', rank: baseRank, text: `${baseRank.label} · ${baseRank.score}` };
}
