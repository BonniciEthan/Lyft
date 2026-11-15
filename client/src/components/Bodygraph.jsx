import { memo, useState } from 'react';
import { MUSCLE_NAME, TIERS } from '../lib/rankingEngine.js';

/*
 * Front / back anatomical silhouette. Each figure is drawn on a 160×370 grid centred
 * on x = 80. Shapes are authored for the left half only and mirrored for the right.
 */

const BODY_HALF =
  'M80 46 L73 46 L72 55 C64 57 54 58 47 62 C39 66 35 74 34 86 L31 118 C29 132 26 146 24 160 L21 194 C18 200 17 210 20 216 ' +
  'C23 220 28 217 29 210 L31 196 C35 180 39 160 42 144 L45 120 C46 110 47 100 48 92 L50 100 C51 116 53 132 54 146 ' +
  'C54 156 54 166 56 176 C54 200 52 222 54 246 C55 262 55 278 55 292 C55 312 57 332 59 346 L57 356 C60 360 70 360 74 358 ' +
  'L74 346 C75 326 76 306 76 290 C77 270 77 256 77 244 C78 222 79 204 80 190 Z';

const FRONT = {
  shoulders: [
    'M47 62 C39 66 35 74 34 86 C38 89 44 87 49 82 C53 76 55 69 54 63 Z',
    'M72 55 C66 56 60 58 55 61 C60 63 66 62 72 59 Z',
  ],
  chest: ['M77 64 C70 63 62 63 55 66 C51 72 50 81 52 88 C57 95 68 98 77 95 Z'],
  biceps: ['M35 90 C33 101 32 111 33 121 C37 124 42 120 44 112 C46 103 47 95 47 88 C43 86 38 87 35 90 Z'],
  abs: [
    'M77 100 L66 100 C64 116 64 140 66 158 C69 167 73 172 77 175 Z',
    'M62 102 C57 107 54 118 55 132 C56 144 59 154 62 162 C61 142 61 120 62 102 Z',
  ],
  quads: [
    'M59 184 C55 202 54 222 56 244 C60 253 68 255 74 250 C77 232 78 212 78 194 C72 192 65 189 59 184 Z',
  ],
  calves: [
    'M57 270 C55 286 55 302 58 318 C62 320 65 314 65 304 C65 292 64 280 62 268 Z',
    'M69 270 C73 282 74 298 72 314 C69 316 67 310 67 300 C67 288 67 278 69 270 Z',
  ],
};

const BACK = {
  shoulders: [
    'M80 48 L73 50 L72 55 C65 57 59 59 55 62 C62 67 70 76 76 96 L80 106 Z',
    'M47 62 C39 66 35 74 34 86 C39 88 45 84 50 78 C53 73 53 67 51 63 Z',
  ],
  back: [
    'M55 72 C51 84 51 98 55 112 C59 124 65 134 72 141 L76 114 C72 98 65 84 55 72 Z',
    'M78 110 L74 142 C73 152 75 160 78 168 Z',
  ],
  triceps: ['M35 89 C33 100 32 111 34 122 C38 124 43 118 45 110 C47 101 48 93 47 86 C43 85 38 86 35 89 Z'],
  glutes: ['M78 173 C70 171 62 173 57 181 C55 192 57 202 63 207 C70 209 76 206 79 200 Z'],
  hamstrings: ['M59 212 C55 228 55 243 57 256 C61 260 66 258 70 252 C74 238 76 224 77 212 C71 214 65 214 59 212 Z'],
  calves: ['M57 270 C53 283 53 298 57 312 C61 316 66 312 68 302 C70 292 72 280 72 270 C67 267 61 267 57 270 Z'],
};

const MIRROR = 'translate(160 0) scale(-1 1)';

/** Decorative separation lines (abs grid, sternum, spine). */
const FRONT_DETAIL = 'M80 66 V96 M67 116 H77 M67 132 H77 M67 147 H77';
const BACK_DETAIL = 'M80 108 V170';

function Figure({ x, label, shapes, detail, muscles, hot, selected, onHover, onSelect }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <ellipse className="bg-body" cx="80" cy="26" rx="14" ry="17" />
      <path className="bg-body" d={BODY_HALF} />
      <path className="bg-body" d={BODY_HALF} transform={MIRROR} />
      {Object.entries(shapes).map(([id, paths]) => {
        const m = muscles[id];
        const ranked = m?.rank.ranked;
        const cls = ['bg-muscle', ranked ? 'is-ranked' : 'is-unranked', hot === id ? 'is-hot' : '', selected === id ? 'is-selected' : '']
          .filter(Boolean)
          .join(' ');
        return (
          <g
            key={id}
            className={cls}
            style={ranked ? { '--tier': m.rank.tier.color } : undefined}
            role="button"
            tabIndex={0}
            aria-label={`${MUSCLE_NAME[id]}: ${m?.rank.label || 'Unranked'}`}
            onPointerEnter={() => onHover(id)}
            onPointerLeave={() => onHover(null)}
            onFocus={() => onHover(id)}
            onBlur={() => onHover(null)}
            onClick={() => onSelect(id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(id);
              }
            }}
          >
            {paths.map((d, i) => (
              <g key={i}>
                <path d={d} />
                <path d={d} transform={MIRROR} />
              </g>
            ))}
          </g>
        );
      })}
      <path className="bg-detail" d={detail} />
      <text className="bg-label" x="80" y="378" textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

function BodygraphImpl({ muscles, selected, onSelect }) {
  const [hot, setHot] = useState(null);
  const props = { muscles, hot, selected, onHover: setHot, onSelect };
  return (
    <div className="bodygraph">
      <svg viewBox="0 0 340 386" className="bodygraph-svg" role="group" aria-label="Muscle rank bodygraph">
        <Figure x={0} label="FRONT" shapes={FRONT} detail={FRONT_DETAIL} {...props} />
        <Figure x={180} label="BACK" shapes={BACK} detail={BACK_DETAIL} {...props} />
      </svg>
      <div className="bodygraph-hint" aria-live="polite">
        {hot ? (
          <>
            <strong>{MUSCLE_NAME[hot]}</strong>
            <span>{muscles[hot]?.rank.ranked ? `${muscles[hot].rank.label} · ${muscles[hot].rank.score}` : 'Unranked'}</span>
          </>
        ) : (
          <span>Tap a muscle for details</span>
        )}
      </div>
    </div>
  );
}

export const Bodygraph = memo(BodygraphImpl);

export function TierLegend() {
  return (
    <div className="tier-legend" aria-label="Tier colours">
      {TIERS.map((t) => (
        <div key={t.id} className="tier-legend-item" title={`${t.name} ${t.min}+`}>
          <span className="tier-swatch" style={{ background: t.color }} />
          <span>{t.short}</span>
        </div>
      ))}
    </div>
  );
}
