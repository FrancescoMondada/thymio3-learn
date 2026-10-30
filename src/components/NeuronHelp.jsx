import React, { useEffect, useRef, useState } from 'react';
import { CloseIcon } from '../icons.jsx';
import { MAX_SPEED, NORMALISATION } from '../spec.js';
import { clamp, num, sensorColor } from '../util.js';
import { fmt } from '../i18n.js';

// The calculation of one neuron (one wheel), live: every input with what it reads, its weight and the speed it brings, then the sum.
// A window that floats over the page, not hiding the picture more than needed: it can be dragged by its title (on a narrow screen it
// sits at the bottom instead). Its height does not change: what is not always there (the note when the wheel does not follow the network)
// has its place kept. `rows` are the 8 connections of the neuron (7 sensors and the constant input 1), as the picture
// draws them, so that what is added here is what the picture shows. The numbers follow the robot as it sends them.
const signed = (v, digits = 1) => (v > 0.05 ? '+' : '') + num(v, digits);
const tone = (v) => (Math.abs(v) < 0.05 ? 'zero' : v > 0 ? 'pos' : 'neg');

export default function NeuronHelp({ t, wheel, rows, speed, state, onClose }) {
  const box = useRef(null);
  const drag = useRef(null);
  const [at, setAt] = useState(null);                              // { x, y } once it has been dragged
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const sum = rows.reduce((total, k) => total + k.c, 0);
  const result = clamp(Math.trunc(sum), -MAX_SPEED, MAX_SPEED);
  const follows = Math.abs(result - speed) <= 1;                   // the wheel is not given the network's result while the robot backs up, learns or is paused

  const start = (e) => {
    const r = box.current.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const r = box.current.getBoundingClientRect();
    setAt({ x: clamp(e.clientX - d.dx, 4, window.innerWidth - r.width - 4), y: clamp(e.clientY - d.dy, 4, window.innerHeight - 60) });
  };
  const stop = () => { drag.current = null; };

  return (
    <aside ref={box} className="neuron-help" role="dialog" aria-label={fmt(t.calc.title, { wheel })} style={at ? { left: at.x, top: at.y, right: 'auto', bottom: 'auto' } : undefined}>
      <header onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
        <h3>{fmt(t.calc.title, { wheel })}</h3>
        <button type="button" className="icon-btn small" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} aria-label={t.calc.close} title={t.calc.close}><CloseIcon size={16} /></button>
      </header>
      <p className="muted small">{t.calc.intro}</p>
      <ol className="calc-rows">
        {rows.map((k) => (
          <li key={k.i} className={`calc-row ${tone(k.c)}`}>
            <span className="calc-name">
              {k.bias ? <i className="one" aria-hidden="true">1</i> : <i className="key" style={{ background: sensorColor(k.i) }} aria-hidden="true" />}
              {k.bias ? <span className="calc-full">{t.net.bias}</span> : <><span className="calc-full">{`${k.i + 1} ${t.net.sensors[k.i]}`}</span><span className="calc-short">{`${k.i + 1} ${t.net.short[k.i]}`}</span></>}
            </span>
            <span className="calc-expr">
              {k.bias
                ? `1 × ${num(k.w, 1)}`
                : `${Math.round(k.reading)} × ${num(k.w)} ÷ ${NORMALISATION}`}
            </span>
            <span className="calc-val">{signed(k.c)}</span>
          </li>
        ))}
      </ol>
      <dl className="calc-sum" aria-live="off">
        <dt>{t.calc.sum}</dt><dd className={tone(sum)}>{signed(sum)}</dd>
        <dt>{t.calc.speed}<span className="muted small"> · {t.calc.speedNote}</span></dt><dd className="big">{num(result, 0)}</dd>
      </dl>
      <p className="calc-foot muted small">{t.calc.norm}</p>
      <div className="calc-note-slot">
        {!follows && <p className="calc-note">{fmt(t.calc.notDriving, { state: t.cycle[state] || state, v: num(speed, 0) })}</p>}
      </div>
    </aside>
  );
}
