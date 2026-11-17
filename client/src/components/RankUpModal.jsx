import { useEffect, useState } from 'react';
import { formatWeight } from '../lib/lifterProfileStore.js';
import { formatSet, tierInk } from '../lib/rankFormat.js';
import { Modal } from './Modal.jsx';
import { RankCrest } from './TierCrest.jsx';
import { LpBar } from './RankBits.jsx';

function Promotion({ from, to, title, detail }) {
  return (
    <li className="rankup-row">
      <span className="rankup-crests">
        <RankCrest rank={from} size={26} />
        <span className="rankup-arrow" aria-hidden>
          →
        </span>
        <RankCrest rank={to} size={30} />
      </span>
      <span className="rank-row-main">
        <span className="rank-row-name">{title}</span>
        {detail && <span className="rank-row-sub tabular">{detail}</span>}
      </span>
      <span className="rank-row-label" style={{ color: tierInk(to.tier) }}>
        {to.label}
      </span>
    </li>
  );
}

/** Post-workout celebration. `diff` comes from diffRanks(pre, post). */
export function RankUpModal({ diff, unit, onClose }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!diff) return undefined;
    setRevealed(false);
    const t = setTimeout(() => setRevealed(true), 650);
    return () => clearTimeout(t);
  }, [diff]);

  if (!diff) return <Modal open={false} />;

  // Headline: overall if it moved, otherwise the biggest muscle, otherwise the best exercise.
  const head = diff.overall
    ? { from: diff.overall.from, to: diff.overall.to, label: 'Overall Rank' }
    : diff.muscles[0]
      ? { from: diff.muscles[0].from, to: diff.muscles[0].to, label: diff.muscles[0].name }
      : { from: diff.exercises[0].from, to: diff.exercises[0].to, label: diff.exercises[0].name };

  const setText = (ex) => `${formatSet(ex.best.weightKg, ex.best.reps, ex.cls, unit)} · e1RM ${formatWeight(ex.best.e1rm, unit)}`;

  return (
    <Modal
      open
      onClose={onClose}
      title="Rank Up!"
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
          Nice
        </button>
      }
    >
      <div className={`rankup-hero ${revealed ? 'is-revealed' : ''}`} style={{ '--tier': tierInk(head.to.tier) }}>
        <div className="rankup-stage">
          <RankCrest rank={head.from} size={120} className="rankup-old" />
          <RankCrest rank={head.to} size={120} className="rankup-new" />
        </div>
        <div className="rank-hero-label">{head.label}</div>
        <div className="rank-hero-tier" style={{ color: tierInk(head.to.tier) }}>
          {head.to.label}
        </div>
        <div className="rankup-from">from {head.from.label}</div>
        <LpBar rank={head.to} />
      </div>

      <ul className="rank-list rankup-list">
        {diff.overall && head.label !== 'Overall Rank' && <Promotion from={diff.overall.from} to={diff.overall.to} title="Overall" />}
        {diff.muscles.map((m) => (
          <Promotion key={m.id} from={m.from} to={m.to} title={m.name} detail={m.top ? `${m.top.name}: ${setText(m.top)}` : ''} />
        ))}
        {diff.exercises.map((e) => (
          <Promotion key={e.id} from={e.from} to={e.to} title={e.name} detail={setText(e)} />
        ))}
      </ul>
    </Modal>
  );
}
