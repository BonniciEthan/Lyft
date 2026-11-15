import { memo, useId } from 'react';
import { TIERS } from '../lib/rankingEngine.js';

/* Colour helpers ----------------------------------------------------- */

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (hex, target, t) => {
  const a = hexToRgb(hex);
  const b = target === 'white' ? [255, 255, 255] : [0, 0, 0];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
};

/* Shapes (100×100 canvas, shield centred on x = 50) ------------------ */

const SHIELD = 'M50 20 L70 27 V48 C70 62 61 72 50 79 C39 72 30 62 30 48 V27 Z';
const SHIELD_INNER = 'M50 25.5 L65.5 31 V48 C65.5 59 58.5 67 50 72.8 C41.5 67 34.5 59 34.5 48 V31 Z';
const WINGS = [
  'M31 34 C22 31 13 26 6 18 C8 29 14 37 23 42 C15 43 9 41 5 39 C10 47 19 51 30 51 Z',
  'M31 44 C24 45 16 44 9 41 C13 50 21 55 31 57 Z',
  'M31 52 C26 55 20 56 14 55 C18 61 25 64 33 63 Z',
];
const CROWN = 'M37 21 L39.5 9 L45 15.5 L50 5 L55 15.5 L60.5 9 L63 21 Z';
const GEM = { outer: '50,34 60,46 50,61 40,46', facets: 'M40 46 H60 M45 46 L50 34 L55 46 M45 46 L50 61 L55 46' };

const mirror = 'translate(100 0) scale(-1 1)';

function Laurel({ color }) {
  const leaves = [];
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const x = 33 - t * 6 + t * t * 2;
    const y = 62 + t * 22;
    leaves.push(<ellipse key={i} cx={x} cy={y} rx="2.4" ry="5" transform={`rotate(${-35 + t * 55} ${x} ${y})`} fill={color} />);
  }
  return (
    <g opacity="0.95">
      {leaves}
      <g transform={mirror}>{leaves}</g>
    </g>
  );
}

function Chevrons({ count, color }) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const y = 40 + i * 8 - (count - 1) * 4;
    rows.push(<path key={i} d={`M41 ${y + 4} L50 ${y - 2} L59 ${y + 4}`} stroke={color} strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />);
  }
  return <g>{rows}</g>;
}

function CrestImpl({ tier, size = 44, className = '', title }) {
  const raw = useId().replace(/:/g, '');
  const id = (k) => `${raw}-${k}`;
  const t = typeof tier === 'number' ? TIERS[tier] : tier;

  if (!t) {
    return (
      <svg className={`tier-crest is-unranked ${className}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title || 'Unranked'}>
        <path d={SHIELD} fill="rgba(255,255,255,0.04)" stroke="var(--text-3)" strokeWidth="2.5" strokeDasharray="5 4" />
        <path d="M43 48 H57" stroke="var(--text-3)" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  const c = t.color;
  const level = t.index; // 0..8
  const isOlympian = t.id === 'olympian';
  const light = mix(c, 'white', 0.55);
  const dark = mix(c, 'black', 0.45);
  const wingLayers = level >= 3 ? Math.min(3, level - 2) : 0; // gold 1, plat 2, diamond+ 3
  const ornate = level >= 6;

  const metal = `url(#${id('metal')})`;
  const wingFill = `url(#${id('wing')})`;

  return (
    <svg className={`tier-crest tier-${t.id} ${className}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title || t.name}>
      <defs>
        <linearGradient id={id('metal')} x1="0" y1="0" x2="0.35" y2="1">
          {isOlympian ? (
            <>
              <stop offset="0" stopColor="#FEF9C3" />
              <stop offset="0.3" stopColor="#FACC15" />
              <stop offset="0.55" stopColor="#F472B6" />
              <stop offset="0.78" stopColor="#60A5FA" />
              <stop offset="1" stopColor="#A855F7" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor={light} />
              <stop offset="0.5" stopColor={c} />
              <stop offset="1" stopColor={dark} />
            </>
          )}
        </linearGradient>
        <linearGradient id={id('wing')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={isOlympian ? '#FEF08A' : light} />
          <stop offset="1" stopColor={isOlympian ? '#C084FC' : dark} />
        </linearGradient>
        <linearGradient id={id('gem')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.45" stopColor={isOlympian ? '#F9A8D4' : light} />
          <stop offset="1" stopColor={isOlympian ? '#818CF8' : c} />
        </linearGradient>
        <linearGradient id={id('sheen')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {ornate && (
          <radialGradient id={id('glow')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={c} stopOpacity="0.6" />
            <stop offset="1" stopColor={c} stopOpacity="0" />
          </radialGradient>
        )}
      </defs>

      {ornate && <circle cx="50" cy="48" r="48" fill={`url(#${id('glow')})`} />}

      {isOlympian && (
        <g stroke="#FDE68A" strokeWidth="1.4" strokeLinecap="round" opacity="0.7">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <line key={i} x1={50 + Math.cos(a) * 40} y1={48 + Math.sin(a) * 40} x2={50 + Math.cos(a) * 47} y2={48 + Math.sin(a) * 47} />;
          })}
        </g>
      )}

      {wingLayers > 0 && (
        <g fill={wingFill} stroke={dark} strokeWidth="0.8" strokeLinejoin="round">
          {WINGS.slice(0, wingLayers).map((d, i) => (
            <g key={i}>
              <path d={d} />
              <path d={d} transform={mirror} />
            </g>
          ))}
        </g>
      )}

      {ornate && <Laurel color={isOlympian ? '#FDE68A' : light} />}

      <path d={SHIELD} fill={metal} stroke={dark} strokeWidth="1.6" strokeLinejoin="round" />
      <path d={SHIELD_INNER} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.2" />
      <path d={SHIELD} fill={`url(#${id('sheen')})`} />

      {level < 3 ? (
        <Chevrons count={level + 1} color={mix(c, 'white', 0.75)} />
      ) : (
        <g>
          <polygon points={GEM.outer} fill={`url(#${id('gem')})`} stroke="#fff" strokeOpacity="0.8" strokeWidth="1.1" strokeLinejoin="round" />
          <path d={GEM.facets} stroke="#fff" strokeOpacity="0.55" strokeWidth="0.8" fill="none" />
        </g>
      )}

      {ornate && <path d={CROWN} fill={isOlympian ? '#FDE68A' : light} stroke={dark} strokeWidth="1" strokeLinejoin="round" />}
      {level === 8 && <circle cx="50" cy="5.5" r="2.2" fill="#fff" />}
    </svg>
  );
}

export const TierCrest = memo(CrestImpl);

/** Crest for a rankOf() result. */
export const RankCrest = ({ rank, ...p }) => <TierCrest tier={rank?.ranked ? rank.tier.index : null} title={rank?.label} {...p} />;
