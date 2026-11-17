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
    rows.push(<path key={i} d={`M41 ${y + 4} L50 ${y - 2} L59 ${y + 4}`} stroke={color} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />);
  }
  return <g>{rows}</g>;
}

/* Materials: each tier is a physical finish rather than a flat hue. hi / base / lo are the
   highlight, body and shadow stops of the metal; ink is the engraved chevron / gem colour. */
const MATERIALS = {
  wood: { hi: '#C7A37E', base: '#8A6440', lo: '#4E3620', ink: '#EAD9C6', brushed: 0.1 }, // satin walnut
  bronze: { hi: '#E7B98C', base: '#A86F3E', lo: '#5E3A1C', ink: '#F6E1CB', brushed: 0.16 }, // anodized bronze
  silver: { hi: '#E9EDF0', base: '#A3ACB4', lo: '#5B636B', ink: '#FFFFFF', brushed: 0.2 }, // brushed titanium
  gold: { hi: '#F4E2A6', base: '#C9A548', lo: '#7A5F1C', ink: '#FFF6DA', brushed: 0.16 }, // satin gold
  platinum: { hi: '#DCEDEB', base: '#8FB5B2', lo: '#476866', ink: '#F4FFFE', brushed: 0.18 }, // cool pewter
  diamond: { hi: '#D7E4F6', base: '#7F9FCB', lo: '#3C5578', ink: '#FFFFFF', brushed: 0.08 }, // steel-blue glass
  champion: { hi: '#D8CCE8', base: '#8F78AE', lo: '#4A3B5F', ink: '#F6F0FF', brushed: 0.1 }, // smoked amethyst
  titan: { hi: '#EDBE9C', base: '#B56E43', lo: '#5F331A', ink: '#FCE6D6', brushed: 0.16 }, // burnished copper
  olympian: { hi: '#3A3D40', base: '#1A1C1E', lo: '#08090A', ink: '#F1E3B0', brushed: 0.12, rim: true }, // obsidian
};

function CrestImpl({ tier, size = 44, className = '', title }) {
  const raw = useId().replace(/:/g, '');
  const id = (k) => `${raw}-${k}`;
  const t = typeof tier === 'number' ? TIERS[tier] : tier;

  if (!t) {
    return (
      <svg className={`tier-crest is-unranked ${className}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title || 'Unranked'}>
        <path d={SHIELD} fill="none" stroke="var(--text-3)" strokeWidth="2" strokeDasharray="4 4" />
        <path d="M44 48 H56" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  const m = MATERIALS[t.id] || { hi: mix(t.color, 'white', 0.55), base: t.color, lo: mix(t.color, 'black', 0.45), ink: '#fff', brushed: 0.12 };
  const level = t.index; // 0..8
  const isOlympian = t.id === 'olympian';
  const wingLayers = level >= 3 ? Math.min(3, level - 2) : 0; // gold 1, plat 2, diamond+ 3
  const ornate = level >= 6;
  const trim = isOlympian ? m.ink : m.hi;

  const metal = `url(#${id('metal')})`;

  return (
    <svg className={`tier-crest tier-${t.id} ${className}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title || t.name}>
      <defs>
        <linearGradient id={id('metal')} x1="0.1" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={m.hi} />
          <stop offset="0.48" stopColor={m.base} />
          <stop offset="1" stopColor={m.lo} />
        </linearGradient>
        <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.38" />
          <stop offset="0.38" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {isOlympian && (
          <linearGradient id={id('rim')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#E9D8A6" />
            <stop offset="0.5" stopColor="#9FC2C0" />
            <stop offset="1" stopColor="#B7A3CF" />
          </linearGradient>
        )}
        <filter id={id('brush')} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.04" numOctaves="2" seed="7" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>

      {wingLayers > 0 && (
        <g fill={metal} stroke={m.lo} strokeWidth="0.6" strokeLinejoin="round">
          {WINGS.slice(0, wingLayers).map((d, i) => (
            <g key={i}>
              <path d={d} />
              <path d={d} transform={mirror} />
            </g>
          ))}
        </g>
      )}

      {ornate && <Laurel color={trim} />}

      <path d={SHIELD} fill={metal} stroke={isOlympian ? `url(#${id('rim')})` : m.lo} strokeWidth={isOlympian ? 2 : 1.2} strokeLinejoin="round" />
      <path d={SHIELD} fill="#fff" opacity={m.brushed} filter={`url(#${id('brush')})`} />
      <path d={SHIELD_INNER} fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="1" />
      <path d={SHIELD} fill={`url(#${id('sheen')})`} />

      {level < 3 ? (
        <Chevrons count={level + 1} color={m.ink} />
      ) : (
        <g>
          <polygon points={GEM.outer} fill={m.ink} fillOpacity="0.9" stroke={m.lo} strokeOpacity="0.6" strokeWidth="0.8" strokeLinejoin="round" />
          <path d={GEM.facets} stroke={m.lo} strokeOpacity="0.45" strokeWidth="0.7" fill="none" />
        </g>
      )}

      {ornate && <path d={CROWN} fill={trim} stroke={m.lo} strokeWidth="0.8" strokeLinejoin="round" />}
      {level === 8 && <circle cx="50" cy="5.5" r="1.8" fill={m.ink} />}
    </svg>
  );
}

export const TierCrest = memo(CrestImpl);

/** Crest for a rankOf() result. */
export const RankCrest = ({ rank, ...p }) => <TierCrest tier={rank?.ranked ? rank.tier.index : null} title={rank?.label} {...p} />;
