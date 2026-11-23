import { useRef, useState } from 'react';
import * as m from 'motion/react-m';
import { CheckIcon } from './Icons.jsx';
import { SPRING } from '../lib/motion.js';

const round2 = (n) => Math.round(n * 100) / 100;

export function formatNumber(v) {
  if (v === null || v === undefined) return '–';
  return String(round2(v));
}

/** A number that displays as text and turns into an input when tapped. */
export function NumberCell({ value, onChange, decimal = false, label, className = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const cancelled = useRef(false);

  const start = () => {
    cancelled.current = false;
    setDraft(value === null || value === undefined ? '' : String(value));
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    if (cancelled.current) return;
    const raw = draft.replace(',', '.').trim();
    if (raw === '') {
      if (value !== null && value !== undefined) onChange(null);
      return;
    }
    const n = decimal ? parseFloat(raw) : parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return;
    const next = decimal ? round2(n) : Math.round(n);
    if (next !== value) onChange(next);
  };

  if (editing) {
    return (
      <input
        className={`num-input ${className}`}
        autoFocus
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        pattern={decimal ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'}
        enterKeyHint="done"
        value={draft}
        aria-label={label}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const v = e.target.value;
          const ok = decimal ? /^\d*([.,]\d{0,2})?$/.test(v) : /^\d*$/.test(v);
          if (ok) setDraft(v);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`num-display ${value === null || value === undefined ? 'is-empty' : ''} ${className}`}
      onClick={start}
      aria-label={`${label}: ${value ?? 'empty'}. Tap to edit`}
    >
      {formatNumber(value)}
    </button>
  );
}

/** [-] value [+] glass stepper. */
export function Stepper({ value, onChange, step = 1, decimal = false, label, compact = false }) {
  const current = value ?? 0;
  return (
    <div className={`stepper ${compact ? 'stepper-compact' : ''}`}>
      <button
        type="button"
        className="step-btn"
        aria-label={`Decrease ${label} by ${step}`}
        disabled={!value}
        onClick={() => onChange(Math.max(0, round2(current - step)))}
      >
        <span aria-hidden>−</span>
      </button>
      <NumberCell value={value} onChange={onChange} decimal={decimal} label={label} />
      <button
        type="button"
        className="step-btn"
        aria-label={`Increase ${label} by ${step}`}
        onClick={() => onChange(round2(current + step))}
      >
        <span aria-hidden>+</span>
      </button>
    </div>
  );
}

export function GlassCheckbox({ checked, onChange, label, tone = 'accent' }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`glass-check tone-${tone} ${checked ? 'is-checked' : ''}`}
      onClick={() => onChange(!checked)}
    >
      {/* Pops only when the value changes, not when the row first appears. */}
      <m.span
        className="glass-check-pop"
        initial={false}
        animate={{ scale: checked ? [1, 1.14, 1] : [1, 0.94, 1] }}
        transition={{ duration: 0.28, ease: SPRING }}
      >
        <span className="glass-check-box">
          <CheckIcon width={16} height={16} />
        </span>
      </m.span>
    </button>
  );
}

export function Segmented({ options, value, onChange, label, small = false }) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      className={`segmented ${small ? 'segmented-sm' : ''}`}
      role="radiogroup"
      aria-label={label}
      style={{ '--seg-count': options.length, '--seg-index': index }}
    >
      <span className="segmented-pill" aria-hidden />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
