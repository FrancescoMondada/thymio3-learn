import React from 'react';
import { ResetIcon } from '../icons.jsx';

// A labelled slider. `format(value)` writes the value; `defaultValue` (the maker's) gets a small button to go back to it.
export default function Slider({ id, label, hint, title, value, min, max, step, onChange, format = String, defaultValue, resetLabel, disabled, ticks, signed }) {
  const pct = clamp01(((value - min) / (max - min)) * 100);
  // a signed slider is filled from the middle, in the colour of the sign
  const a = signed ? Math.min(pct, 50) : 0;
  const b = signed ? Math.max(pct, 50) : pct;
  const fill = signed ? (value > 0 ? 'var(--pos)' : value < 0 ? 'var(--neg)' : 'var(--axis)') : undefined;
  const changed = defaultValue != null && Math.abs(value - defaultValue) > 1e-9;
  return (
    <div className={`slider ${disabled ? 'off' : ''}`} title={title}>
      <div className="slider-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <div className="slider-row">
        <input
          id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled}
          style={{ '--pct': `${pct}%`, '--a': `${a}%`, '--b': `${b}%`, '--fill': fill }}
          aria-valuetext={format(value)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button type="button" className="icon-btn small" title={resetLabel} aria-label={resetLabel} onClick={() => onChange(defaultValue)} disabled={disabled || !changed} style={{ visibility: defaultValue == null ? 'hidden' : 'visible' }}>
          <ResetIcon size={15} />
        </button>
      </div>
      {ticks && <div className="slider-ticks" aria-hidden="true">{ticks.map((tk) => <span key={tk.at} style={{ left: `${((tk.at - min) / (max - min)) * 100}%` }}>{tk.label}</span>)}</div>}
      {hint && <p className="slider-hint">{hint}</p>}
    </div>
  );
}

const clamp01 = (v) => Math.max(0, Math.min(100, v));
