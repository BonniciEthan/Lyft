import { useEffect, useMemo, useRef, useState } from 'react';
import { TIERS, rankOf } from '../lib/rankingEngine.js';
import { addDays, formatShortDate, fromKey, todayKey } from '../lib/dates.js';
import { Segmented } from './Controls.jsx';
import { tierInk } from '../lib/rankFormat.js';

const RANGES = [
  { value: '1m', label: '1M', days: 30 },
  { value: '3m', label: '3M', days: 91 },
  { value: '1y', label: '1Y', days: 365 },
  { value: 'all', label: 'All', days: null },
];

const H = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 46 };

function useWidth(ref) {
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(220, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Overall Strength Rating over time (step-after: a rating holds until the next PR day). */
export function StrengthChart({ history }) {
  const [range, setRange] = useState('all');
  const [hover, setHover] = useState(null);
  const wrap = useRef(null);
  const W = useWidth(wrap);

  const { points, x0, x1 } = useMemo(() => {
    const today = todayKey();
    const days = RANGES.find((r) => r.value === range).days;
    const start = days ? addDays(today, -days) : history[0]?.date || today;
    // Carry the last rating before the window in as the starting value.
    const before = history.filter((p) => p.date < start).at(-1);
    const inside = history.filter((p) => p.date >= start);
    const pts = [...(before ? [{ ...before, date: start, carried: true }] : []), ...inside];
    const first = pts[0]?.date || start;
    return { points: pts, x0: fromKey(days ? start : first).getTime(), x1: Math.max(fromKey(today).getTime(), fromKey(first).getTime() + 86400000) };
  }, [history, range]);

  if (!history.length) {
    return <p className="empty-line">Log a few sessions to see your rating over time.</p>;
  }

  const scores = points.map((p) => p.score);
  const lo = Math.max(0, Math.floor((Math.min(...scores) - 20) / 100) * 100);
  const hi = Math.min(1100, Math.ceil((Math.max(...scores) + 20) / 100) * 100);
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const sx = (t) => PAD.left + ((t - x0) / (x1 - x0 || 1)) * iw;
  const sy = (s) => PAD.top + ih - ((s - lo) / (hi - lo || 1)) * ih;

  const coords = points.map((p) => ({ ...p, x: sx(fromKey(p.date).getTime()), y: sy(p.score) }));
  const lastX = sx(x1);
  let line = '';
  coords.forEach((c, i) => {
    line += i === 0 ? `M${c.x} ${c.y}` : ` H${c.x} V${c.y}`;
  });
  if (coords.length) line += ` H${lastX}`;
  const area = coords.length ? `${line} V${PAD.top + ih} H${coords[0].x} Z` : '';

  const floors = TIERS.filter((t) => t.min >= lo && t.min <= hi && t.min > 1);
  const real = coords.filter((c) => !c.carried);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = null;
    for (const c of real) if (!best || Math.abs(c.x - px) < Math.abs(best.x - px)) best = c;
    setHover(best);
  };

  const tip = hover && {
    left: Math.min(Math.max(hover.x / W, 0.18), 0.82) * 100,
    rank: rankOf(hover.score),
  };

  return (
    <div className="strength-chart">
      <div className="chart-toolbar">
        <Segmented small options={RANGES} value={range} onChange={(v) => { setRange(v); setHover(null); }} label="Chart range" />
      </div>
      <div className="chart-frame" ref={wrap} data-no-swipe>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="chart-svg"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label="Overall strength rating over time"
        >
          <defs>
            <linearGradient id="sr-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.16" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {floors.map((t) => (
            <g key={t.id}>
              <line className="chart-floor" x1={PAD.left} x2={W - PAD.right} y1={sy(t.min)} y2={sy(t.min)} style={{ stroke: tierInk(t) }} />
              <text className="chart-axis" x={PAD.left - 6} y={sy(t.min) + 3.5} textAnchor="end">
                {t.min} {t.short}
              </text>
            </g>
          ))}
          <text className="chart-axis" x={PAD.left} y={H - 6}>
            {formatShortDate(new Date(x0).toISOString().slice(0, 10))}
          </text>
          <text className="chart-axis" x={W - PAD.right} y={H - 6} textAnchor="end">
            Today
          </text>
          {area && <path d={area} fill="url(#sr-area)" />}
          {line && <path d={line} className="chart-line" />}
          {real.map((c) => (
            <circle key={c.date} cx={c.x} cy={c.y} r={hover?.date === c.date ? 5 : 3} className="chart-dot" style={{ fill: rankOf(c.score).tier?.color }} />
          ))}
          {hover && <line className="chart-cursor" x1={hover.x} x2={hover.x} y1={PAD.top} y2={PAD.top + ih} />}
        </svg>
        {tip && (
          <div className="chart-tip glass-panel" style={{ left: `${tip.left}%` }}>
            <div className="chart-tip-date tabular">{formatShortDate(hover.date)}</div>
            <div className="chart-tip-score">
              <span className="tabular">{Math.round(hover.score)}</span>
              <span style={{ color: tierInk(tip.rank.tier) }}>{tip.rank.label}</span>
            </div>
            <div className="chart-tip-sub">
              {hover.category} · PR on {hover.improved.slice(0, 2).map((i) => i.name).join(', ')}
              {hover.improved.length > 2 ? ` +${hover.improved.length - 2}` : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
