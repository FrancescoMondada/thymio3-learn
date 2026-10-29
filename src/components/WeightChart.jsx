import React, { useMemo, useState } from 'react';
import { num, sensorColor, useSize } from '../util.js';
import { ago, indexAt, niceMax, stepLine, timeTicks } from './chartkit.js';
import { ChartIcon, TableIcon } from '../icons.jsx';
import { fmt } from '../i18n.js';

// The weights over time: one chart per wheel, one line per sensor (same colour and number as everywhere), steps where a lesson or
// a hand changed a weight, a tick at every hit. Hover (or touch) for the values at that moment; a table view has the same numbers.
const WINDOWS = [['w1', 60000], ['w5', 300000], ['w15', 900000]];
const M = { l: 36, r: 34, t: 12, b: 24 };

export default function WeightChart({ t, hist, now, t0 }) {
  const [win, setWin] = useState(300000);
  const [view, setView] = useState('chart');
  const [focus, setFocus] = useState(null);
  const [cursor, setCursor] = useState(null);       // { t, side }
  const span = Math.min(win, Math.max(20000, now - t0));
  const from = now - span;

  // the largest weight in view, for one scale on both charts
  const maxW = useMemo(() => {
    let m = 0;
    for (let k = Math.max(0, indexAt(hist.w, from)); k < hist.w.length; k++) {
      for (const v of hist.w[k].left) m = Math.max(m, Math.abs(v));
      for (const v of hist.w[k].right) m = Math.max(m, Math.abs(v));
    }
    return niceMax(m * 1.1);
  }, [hist.w, hist.w.length, from]);

  const empty = hist.w.length < 2;

  return (
    <section className="card wchart" aria-label={t.chart.title}>
      <header className="card-head">
        <div>
          <h2>{t.chart.title}</h2>
          <p className="muted small">{t.chart.sub}</p>
        </div>
        <div className="toolbar">
          <div className="seg" role="group" aria-label={t.chart.window}>
            {WINDOWS.map(([k, ms]) => <button key={k} type="button" className={win === ms ? 'on' : ''} aria-pressed={win === ms} onClick={() => setWin(ms)}>{t.chart[k]}</button>)}
          </div>
          <div className="seg" role="group">
            <button type="button" className={view === 'chart' ? 'on' : ''} aria-pressed={view === 'chart'} onClick={() => setView('chart')} title={t.chart.chart}><ChartIcon size={16} /></button>
            <button type="button" className={view === 'table' ? 'on' : ''} aria-pressed={view === 'table'} onClick={() => setView('table')} title={t.chart.table}><TableIcon size={16} /></button>
          </div>
        </div>
      </header>

      <ul className="legend" aria-label={t.chart.legend}>
        {t.net.sensors.map((name, i) => (
          <li key={i}>
            <button type="button" className={focus === i ? 'on' : ''} aria-pressed={focus === i} onClick={() => setFocus(focus === i ? null : i)}>
              <i className="key" style={{ background: sensorColor(i) }} aria-hidden="true" />{i + 1} {name}
            </button>
          </li>
        ))}
      </ul>

      {view === 'chart' ? (
        <div className="charts">
          {[0, 1].map((side) => (
            <OneChart key={side} t={t} side={side} hist={hist} now={now} from={from} maxW={maxW} focus={focus} cursor={cursor} setCursor={setCursor} empty={empty} />
          ))}
        </div>
      ) : (
        <WeightTable t={t} hist={hist} now={now} from={from} />
      )}
    </section>
  );
}

function OneChart({ t, side, hist, now, from, maxW, focus, cursor, setCursor, empty }) {
  const [ref, { width }] = useSize({ width: 360, height: 190 });
  const H = 190;
  const W = Math.max(220, width);
  const x = (tt) => M.l + ((tt - from) / (now - from || 1)) * (W - M.l - M.r);
  const y = (v) => M.t + (1 - (v + maxW) / (2 * maxW)) * (H - M.t - M.b);
  const key = side === 0 ? 'left' : 'right';
  const wheel = t.net.wheels[side];

  // which sensors have something to show: a weight that is not 0 at some point of the span
  const live = useMemo(() => {
    const used = new Array(7).fill(false);
    for (let k = Math.max(0, indexAt(hist.w, from)); k < hist.w.length; k++) hist.w[k][key].forEach((v, i) => { if (v !== 0) used[i] = true; });
    return used;
  }, [hist.w, hist.w.length, from, key]);

  const last = hist.w[hist.w.length - 1];
  const ticks = [-maxW, -maxW / 2, 0, maxW / 2, maxW];
  const xt = timeTicks(from, now);
  const hits = hist.events.filter((e) => e.kind === 'hit' && e.t >= from);

  // end labels for the three largest weights, if they do not collide
  const ends = last ? last[key].map((v, i) => ({ i, v })).filter((e) => e.v !== 0).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 3).sort((a, b) => y(a.v) - y(b.v)) : [];
  const labelled = [];
  for (const e of ends) if (!labelled.length || y(e.v) - y(labelled[labelled.length - 1].v) >= 13) labelled.push(e);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const tt = from + ((px - M.l) / (W - M.l - M.r)) * (now - from);
    setCursor({ t: Math.max(from, Math.min(now, tt)), side });
  };

  const at = cursor ? indexAt(hist.w, cursor.t) : -1;
  const rowAt = at >= 0 ? hist.w[at][key] : last ? last[key] : null;
  const showTip = cursor && cursor.side === side && rowAt;
  const tipLeft = cursor ? x(cursor.t) : 0;

  return (
    <div className="chart" ref={ref}>
      <h3>{wheel}</h3>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t.chart.title}, ${wheel}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'axis' : 'grid'} />
            <text x={M.l - 6} y={y(v)} className="tick" textAnchor="end" dominantBaseline="central">{num(v, 0)}</text>
          </g>
        ))}
        {xt.map((tk, k) => (
          <g key={k}>
            {k < xt.length - 1 && <line x1={x(tk.t)} x2={x(tk.t)} y1={M.t} y2={H - M.b} className="grid vgrid" />}
            <text x={x(tk.t)} y={H - 6} className="tick" textAnchor={k === xt.length - 1 ? 'end' : 'middle'}>{k === xt.length - 1 ? t.chart.now : tk.label}</text>
          </g>
        ))}
        {hits.map((h, k) => <line key={k} x1={x(h.t)} x2={x(h.t)} y1={H - M.b - 8} y2={H - M.b} className="hit-mark"><title>{t.chart.hit}</title></line>)}
        {!empty && live.map((used, i) => used && (
          <path key={i} d={stepLine(hist.w, (p) => p[key][i], x, y, from, now)} className="series" style={{ stroke: sensorColor(i), opacity: focus == null || focus === i ? 1 : 0.18 }} />
        ))}
        {!empty && last && live.map((used, i) => used && last[key][i] !== 0 && (focus == null || focus === i) && (
          <circle key={`d${i}`} cx={x(now)} cy={y(last[key][i])} r="4" className="end-dot" style={{ fill: sensorColor(i) }} />
        ))}
        {labelled.map((e) => <text key={e.i} x={x(now) + 9} y={y(e.v)} className="end-label" dominantBaseline="central">{t.net.short[e.i]}</text>)}
        {cursor && <line x1={x(cursor.t)} x2={x(cursor.t)} y1={M.t} y2={H - M.b} className="cursor" />}
        <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setCursor(null)} style={{ touchAction: 'pan-y' }} />
      </svg>
      {empty && <p className="empty">{t.chart.empty}</p>}
      {showTip && (
        <div className="tip" style={{ left: Math.min(Math.max(tipLeft + 12, 8), W - 150), top: 30 }} role="status">
          <div className="tip-time">{cursor.t >= now - 500 ? t.chart.now : fmt(t.chart.ago, { s: Math.round((now - cursor.t) / 1000) })}</div>
          {rowAt.map((v, i) => (live[i] || v !== 0) && (
            <div key={i} className="tip-row"><i className="key" style={{ background: sensorColor(i) }} /><b>{num(v)}</b><span>{t.net.sensors[i]}</span></div>
          ))}
          {rowAt.every((v) => v === 0) && <div className="tip-row"><span>{t.chart.noData}</span></div>}
        </div>
      )}
    </div>
  );
}

// The same numbers as a table: one row for each moment a weight changed, the newest first.
function WeightTable({ t, hist, now, from }) {
  const rows = hist.w.filter((p) => p.t >= from).slice(-40).reverse();
  return (
    <div className="table-scroll">
      <table className="wlog">
        <thead>
          <tr>
            <th rowSpan="2" scope="col" />
            <th colSpan="7" scope="colgroup">{t.net.wheels[0]}</th>
            <th colSpan="7" scope="colgroup">{t.net.wheels[1]}</th>
          </tr>
          <tr>{[0, 1].flatMap((s) => t.net.short.map((c, i) => <th key={`${s}${i}`} scope="col" style={{ borderBottom: `2px solid ${sensorColor(i)}` }}>{c}</th>))}</tr>
        </thead>
        <tbody>
          {rows.map((p, k) => {
            const prev = rows[k + 1];
            return (
              <tr key={p.t}>
                <th scope="row">{p.t >= now - 500 ? t.chart.now : ago(p.t - now)}</th>
                {['left', 'right'].flatMap((s) => p[s].map((v, i) => <td key={`${s}${i}`} className={prev && prev[s][i] !== v ? 'changed' : ''}>{num(v)}</td>))}
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan="15" className="muted">{t.chart.empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

