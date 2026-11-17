/**
 * Label over a tabular value and unit. size: 'sm' | 'md' | 'lg' | 'display'.
 * tone sets the value colour ('danger', 'accent', or any CSS colour via style).
 */
export function MetricReadout({ label, value, unit, size = 'md', tone, align = 'start', className = '', children }) {
  return (
    <div className={`readout readout-${size} readout-${align} ${tone ? `tone-${tone}` : ''} ${className}`.trim()}>
      {label && <span className="metric-label">{label}</span>}
      <span className="readout-value tabular">
        {value}
        {unit && <small className="readout-unit">{unit}</small>}
      </span>
      {children}
    </div>
  );
}
