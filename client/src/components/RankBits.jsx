import { RankCrest } from './TierCrest.jsx';
import { tierInk } from '../lib/rankFormat.js';

/** LP progress toward the next division, filled in the tier colour. */
export function LpBar({ rank, thin = false, showMeta = true }) {
  const olympian = rank.tier?.id === 'olympian';
  const pct = !rank.ranked ? 0 : olympian ? 1 : rank.lp / 100;
  return (
    <div className={`lp ${thin ? 'lp-thin' : ''}`}>
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rank.lp}>
        <div className="progress-fill lp-fill" style={{ transform: `scaleX(${pct})`, '--tier': tierInk(rank.tier) || 'var(--text-3)' }} />
      </div>
      {showMeta && (
        <div className="progress-meta tabular">
          <span>{rank.ranked ? (olympian ? `${rank.lp} LP` : `${rank.lp} / 100 LP`) : '0 LP'}</span>
          <span>{rank.next ? `Next: ${rank.next.label} at ${rank.next.minScore}` : 'Top tier'}</span>
        </div>
      )}
    </div>
  );
}

/** Mini crest + "Gold II" label. */
export function RankBadge({ rank, size = 22 }) {
  return (
    <span className="rank-badge" style={{ '--tier': tierInk(rank.tier) || 'var(--text-3)' }}>
      <RankCrest rank={rank} size={size} />
      <span>{rank.label}</span>
    </span>
  );
}
