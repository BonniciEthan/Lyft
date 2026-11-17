/**
 * Thin precision arc. `value` is 0..1 (clamped). `segments` > 1 draws the track as that many
 * arcs separated by small gaps. Colour comes from CSS (`--ring`), so callers style by class.
 */
export function SegmentedRing({ value, size = 120, stroke = 4, segments = 1, gapDeg = 3, className = '', children, label }) {
  const R = (size - stroke) / 2 - 1;
  const C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const c = size / 2;
  const segLen = segments > 1 ? C / segments - (gapDeg / 360) * C : C;
  const dash = segments > 1 ? `${segLen} ${C / segments - segLen}` : undefined;
  return (
    <div className={`seg-ring ${className}`.trim()} style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle className="seg-ring-track" cx={c} cy={c} r={R} strokeWidth={stroke} strokeDasharray={dash} transform={`rotate(-90 ${c} ${c})`} />
        <circle
          className="seg-ring-fill"
          cx={c}
          cy={c}
          r={R}
          strokeWidth={stroke}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
      {children && <div className="seg-ring-center">{children}</div>}
    </div>
  );
}
