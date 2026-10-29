import React from 'react';
import Slider from './Slider.jsx';
import { RANGES, W_LIMIT } from '../spec.js';
import { MINUS, clamp, num, sensorColor, useHeld } from '../util.js';
import { fmt } from '../i18n.js';
import { CloseIcon, MinusIcon, PlusIcon } from '../icons.jsx';

// The 14 weights as a table (sensor by wheel), each cell tinted by its sign and size.
export default function WeightTable({ t, weights, selected, onSelect }) {
  const sensor = selected ? selected.sensor : null;
  return (
    <section className="card weights" aria-label={t.weights.title}>
      <header className="card-head">
        <h2>{t.weights.title}</h2>
      </header>
      <p className="muted small">{t.weights.hint}</p>
      <div className="table-scroll">
      <table className="wtable">
        <thead>
          <tr><th scope="col">{t.weights.sensor}</th><th scope="col">{t.net.wheels[0]}</th><th scope="col">{t.net.wheels[1]}</th></tr>
        </thead>
        <tbody>
          {Array.from({ length: 7 }, (_, i) => (
            <tr key={i} className={sensor === i ? 'picked' : ''}>
              <th scope="row">
                <button type="button" className="row-btn" onClick={() => onSelect(i, null)} aria-pressed={sensor === i}>
                  <i className="dot" style={{ background: sensorColor(i) }} aria-hidden="true" />
                  <span className="n">{i + 1}</span>{t.net.sensors[i]}
                </button>
              </th>
              {[weights.left[i], weights.right[i]].map((w, j) => (
                <td key={j}>
                  <button type="button" className={`cell ${w > 0 ? 'pos' : w < 0 ? 'neg' : ''}`} style={{ '--k': Math.min(1, Math.abs(w) / 15) }} onClick={() => onSelect(i, j)} aria-label={`${t.net.sensors[i]}, ${t.net.wheels[j]} : ${num(w)}`}>
                    {num(w)}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}

// The two weights of the chosen sensor, set by hand: a slider, a typed value, and one notch more or less.
export function SensorEditor({ t, weights, selected, onSet, onClose, enabled }) {
  const sensor = selected ? selected.sensor : null;
  const box = React.useRef(null);
  // on a phone the editor is below the diagram: bring it into view when a sensor is chosen
  React.useEffect(() => { if (sensor != null) box.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [sensor]);
  if (sensor == null) return <p className="muted small pick">{t.net.pick}</p>;
  return (
    <div className="editor" ref={box} role="group" aria-label={fmt(t.weights.editing, { sensor: t.net.sensors[sensor] })}>
      <div className="editor-head">
        <h3><i className="dot" style={{ background: sensorColor(sensor) }} aria-hidden="true" />{fmt(t.weights.editing, { sensor: t.net.sensors[sensor] })}</h3>
        <button type="button" className="icon-btn small" onClick={onClose} aria-label={t.diag.close}><CloseIcon size={15} /></button>
      </div>
      {[0, 1].map((j) => (
        <WeightRow key={`${sensor}-${j}`} t={t} sensor={sensor} wheel={j} value={(j === 0 ? weights.left : weights.right)[sensor]} focus={selected.wheel === j} enabled={enabled} onSet={(w) => onSet(sensor, j, w)} />
      ))}
    </div>
  );
}

function WeightRow({ t, sensor, wheel, value, enabled, onSet, focus }) {
  const [shown, hold] = useHeld(value, 800);
  const [text, setText] = React.useState(null);
  const set = (w) => { const v = clamp(Math.round(w * 2) / 2, -W_LIMIT, W_LIMIT); hold(v); onSet(v); };
  const id = `w-${sensor}-${wheel}`;
  return (
    <div className={`wrow ${focus ? 'focus' : ''}`}>
      <Slider id={id} label={t.net.wheels[wheel]} value={clamp(shown, RANGES.weight.min, RANGES.weight.max)} {...RANGES.weight} signed disabled={!enabled} format={(v) => num(v)} onChange={set} />
      <div className="wrow-tools">
        <button type="button" className="icon-btn" disabled={!enabled} onClick={() => set(shown - 0.5)} aria-label={`${t.weights.less} (${MINUS}0,5)`} title={t.weights.less}><MinusIcon size={15} /></button>
        <input
          type="text" inputMode="decimal" className="num" aria-label={`${t.weights.typed}, ${t.net.wheels[wheel]}`} disabled={!enabled}
          value={text ?? num(shown)} onFocus={(e) => { setText(num(shown)); e.target.select(); }}
          onChange={(e) => { setText(e.target.value); const v = Number(e.target.value.replace(MINUS, '-').replace(',', '.')); if (Number.isFinite(v) && e.target.value.trim() !== '') set(v); }}
          onBlur={() => setText(null)}
        />
        <button type="button" className="icon-btn" disabled={!enabled} onClick={() => set(shown + 0.5)} aria-label={`${t.weights.more} (+0,5)`} title={t.weights.more}><PlusIcon size={15} /></button>
        <button type="button" className="btn small" disabled={!enabled || shown === 0} onClick={() => set(0)}>{t.weights.zero}</button>
      </div>
    </div>
  );
}
