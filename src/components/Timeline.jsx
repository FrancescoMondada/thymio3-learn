import React, { useMemo, useState } from 'react';
import { COLLISION, PROX_MAX } from '../spec.js';
import { num, sensorColor, useSize } from '../util.js';
import { ago, envelope, indexAt, line, niceMax, stepLine, timeTicks } from './chartkit.js';
import { ChartIcon, EyeIcon, EyeOffIcon, TableIcon } from '../icons.jsx';
import { fmt } from '../i18n.js';
import { FoldTitle, useFold } from './Fold.jsx';

// The signals over time, in one stack of charts that share the same time axis and the same left and right margins, so that what
// happens at one instant lines up from top to bottom: the sensor readings, the weights towards each wheel, the wheel speeds.
// Each chart can be hidden (the eye), and the signals can be chosen (sensors 1 to 7, left and right wheel) to compare only
// those. One cursor goes through all the charts; a red mark on every chart is a hit. A table view has the weights' numbers.
const WINDOWS = [['w30', 30000], ['w1', 60000], ['w5', 300000], ['w15', 900000]];
const LANES = [
  { id: 'read', h: 124 },
  { id: 'wl', h: 104, side: 0 },
  { id: 'wr', h: 104, side: 1 },
  { id: 'wheels', h: 92 },
];
const WHEEL_RANGE = 300;
const ALL_SENSORS = [0, 1, 2, 3, 4, 5, 6];

export default function Timeline({ t, hist, now, t0, foldable = true }) {
  const [open, toggleOpen] = useFold('signals', foldable);
  const [win, setWin] = useState(60000);
  const [view, setView] = useState('chart');
  const [sensors, setSensors] = useState(ALL_SENSORS);               // the sensors shown
  const [wheelsOn, setWheelsOn] = useState([0, 1]);                   // the wheels shown
  const [off, setOff] = useState([]);                                  // the charts hidden
  const [cursor, setCursor] = useState(null);                         // { t, lane }
  const [ref, { width }] = useSize({ width: 600, height: 400 });
  const span = Math.min(win, Math.max(20000, now - t0));
  const from = now - span;
  const compact = width < 480;
  const W = Math.max(260, width);
  const M = { l: compact ? 38 : 46, r: compact ? 26 : 34, t: 8, b: 4 };
  const x = (tt) => M.l + ((tt - from) / (now - from || 1)) * (W - M.l - M.r);
  const xt = timeTicks(from, now);
  const hits = useMemo(() => (open ? hist.events.filter((e) => e.kind === 'hit' && e.t >= from).map((e) => e.t) : []), [open, hist.events, hist.events.length, from]);
  const shownLanes = LANES.filter((l) => !off.includes(l.id));

  const toggle = (set, v) => set((list) => (list.includes(v) ? list.filter((a) => a !== v) : [...list, v].sort()));
  const toggleLane = (id) => setOff((list) => (list.includes(id) ? list.filter((a) => a !== id) : [...list, id]));
  const titles = { read: t.chart.laneRead, wl: fmt(t.chart.laneWeights, { wheel: t.net.wheels[0] }), wr: fmt(t.chart.laneWeights, { wheel: t.net.wheels[1] }), wheels: t.chart.laneWheels };

  // one scale for the weights of both wheels, from the largest weight of the sensors shown
  const maxW = useMemo(() => {
    let m = 0;
    if (!open) return niceMax(m);
    for (let k = Math.max(0, indexAt(hist.w, from)); k < hist.w.length; k++) {
      for (const i of sensors) m = Math.max(m, Math.abs(hist.w[k].left[i]), Math.abs(hist.w[k].right[i]));
    }
    return niceMax(m * 1.1);
  }, [open, hist.w, hist.w.length, from, sensors]);

  const common = { t, W, M, from, now, xt, hits, x, cursor, setCursor };

  return (
    <section className={`card timeline ${open ? '' : 'folded'}`} aria-label={t.chart.title}>
      <header className="card-head">
        <div>
          <FoldTitle open={open} onToggle={toggleOpen} controls="signals-body" foldable={foldable}>{t.chart.title}</FoldTitle>
          {open && <p className="muted small">{t.chart.sub}</p>}
        </div>
        {open && <div className="toolbar">
          <div className="seg" role="group" aria-label={t.chart.window}>
            {WINDOWS.map(([k, ms]) => <button key={k} type="button" className={win === ms ? 'on' : ''} aria-pressed={win === ms} onClick={() => setWin(ms)}>{t.chart[k]}</button>)}
          </div>
          <div className="seg" role="group">
            <button type="button" className={view === 'chart' ? 'on' : ''} aria-pressed={view === 'chart'} onClick={() => setView('chart')} title={t.chart.chart}><ChartIcon size={16} /></button>
            <button type="button" className={view === 'table' ? 'on' : ''} aria-pressed={view === 'table'} onClick={() => setView('table')} title={t.chart.table}><TableIcon size={16} /></button>
          </div>
        </div>}
      </header>

      {open && <div id="signals-body">
        {view === 'chart' ? (
          <>
            <div className="choose">
              <div className="choose-row">
                <span className="choose-label">{t.chart.sensors}</span>
                <ul className="legend" aria-label={t.chart.sensors}>
                  {t.net.sensors.map((name, i) => (
                    <li key={i}>
                      <button type="button" aria-pressed={sensors.includes(i)} onClick={() => toggle(setSensors, i)} title={sensors.includes(i) ? t.chart.hide : t.chart.show}>
                        <i className="key" style={{ background: sensorColor(i) }} aria-hidden="true" />{i + 1} {name}
                      </button>
                    </li>
                  ))}
                </ul>
                <span className="choose-actions">
                  <button type="button" className="link-btn" onClick={() => setSensors(ALL_SENSORS)}>{t.chart.all}</button>
                  <button type="button" className="link-btn" onClick={() => setSensors([])}>{t.chart.none}</button>
                </span>
              </div>
              <div className="choose-row">
                <span className="choose-label">{t.chart.wheels}</span>
                <ul className="legend" aria-label={t.chart.wheels}>
                  {t.net.wheels.map((name, j) => (
                    <li key={j}>
                      <button type="button" aria-pressed={wheelsOn.includes(j)} onClick={() => toggle(setWheelsOn, j)} title={wheelsOn.includes(j) ? t.chart.hide : t.chart.show}>
                        <i className={`key wheel-key ${j ? 'dashed' : ''}`} aria-hidden="true" />{name}
                      </button>
                    </li>
                  ))}
                </ul>
                <span className="choose-note"><i className="key hit-key" aria-hidden="true" />{t.chart.hit}</span>
              </div>
            </div>

            <div ref={ref} className="sigs">
              {LANES.map((lane) => {
                const hidden = off.includes(lane.id);
                const head = (
                  <div className="sig-head">
                    <button type="button" className="eye" aria-pressed={!hidden} onClick={() => toggleLane(lane.id)} title={hidden ? t.chart.showChart : t.chart.hideChart} aria-label={`${hidden ? t.chart.showChart : t.chart.hideChart} : ${titles[lane.id]}`}>
                      {hidden ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
                    </button>
                    <h3>{titles[lane.id]}</h3>
                  </div>
                );
                if (hidden) return <div key={lane.id} className="sig off">{head}</div>;
                return (
                  <div key={lane.id} className="sig">
                    {head}
                    {lane.id === 'read' && <Readings {...common} H={lane.h} id={lane.id} hist={hist} sensors={sensors} />}
                    {lane.side != null && <Weights {...common} H={lane.h} id={lane.id} hist={hist} sensors={sensors} side={lane.side} maxW={maxW} />}
                    {lane.id === 'wheels' && <Wheels {...common} H={lane.h} id={lane.id} hist={hist} wheelsOn={wheelsOn} />}
                  </div>
                );
              })}
              {shownLanes.length > 0 && (
                <svg className="axis-row" width={W} height="22" viewBox={`0 0 ${W} 22`} aria-hidden="true">
                  {xt.map((tk, k) => (
                    <text key={k} x={x(tk.t)} y="15" className="tick" textAnchor={k === xt.length - 1 ? 'end' : 'middle'}>{k === xt.length - 1 ? t.chart.now : tk.label}</text>
                  ))}
                </svg>
              )}
            </div>
          </>
        ) : (
          <WeightTable t={t} hist={hist} now={now} from={from} />
        )}
      </div>}
    </section>
  );
}

// One chart of the stack: its frame (grid, ticks, hits, cursor), what it draws in it, and the tooltip.
function Frame({ id, H, W, M, from, now, x, xt, hits, range, ticks, tick, cursor, setCursor, label, empty, children, tip }) {
  const y = (v) => M.t + (1 - (v - range[0]) / (range[1] - range[0])) * (H - M.t - M.b);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    setCursor({ t: Math.max(from, Math.min(now, from + ((px - M.l) / (W - M.l - M.r)) * (now - from))), lane: id });
  };
  const rows = cursor && cursor.lane === id ? tip(cursor.t) : null;
  return (
    <div className="sig-plot">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} className={v === 0 && range[0] < 0 ? 'axis' : 'grid'} />
            <text x={M.l - 6} y={y(v)} className="tick" textAnchor="end" dominantBaseline="central">{tick(v)}</text>
          </g>
        ))}
        {xt.slice(0, -1).map((tk, k) => <line key={k} x1={x(tk.t)} x2={x(tk.t)} y1={M.t} y2={H - M.b} className="grid vgrid" />)}
        {hits.map((h, k) => <line key={k} x1={x(h)} x2={x(h)} y1={M.t} y2={H - M.b} className="hit-mark" />)}
        {children(y)}
        {cursor && <line x1={x(cursor.t)} x2={x(cursor.t)} y1={M.t} y2={H - M.b} className="cursor" />}
        <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setCursor(null)} style={{ touchAction: 'pan-y' }} />
      </svg>
      {empty && <p className="empty" style={{ left: M.l, right: M.r }}>{empty}</p>}
      {rows && (
        <div className="tip" style={{ left: Math.min(Math.max(x(cursor.t) + 12, 8), W - 160), top: 6 }} role="status">
          <div className="tip-time">{rows.time}</div>
          {rows.items.map((r, k) => (
            <div key={k} className="tip-row"><i className={`key ${r.dashed ? 'dashed' : ''}`} style={{ background: r.color }} /><b>{r.value}</b><span>{r.name}</span></div>
          ))}
          {!rows.items.length && <div className="tip-row"><span>{rows.none}</span></div>}
        </div>
      )}
    </div>
  );
}

const timeLabel = (t, now, at) => (at >= now - 500 ? t.chart.now : fmt(t.chart.ago, { s: Math.round((now - at) / 1000) }));

// Labels at the right end of the lines, only where they do not collide.
function endLabels(items, y, gap = 12) {
  const sorted = [...items].sort((a, b) => y(a.v) - y(b.v));
  const out = [];
  for (const e of sorted) if (!out.length || y(e.v) - y(out[out.length - 1].v) >= gap) out.push(e);
  return out;
}

function Readings({ id, H, hist, sensors, t, now, from, W, M, x, cursor, ...rest }) {
  const buckets = Math.max(60, Math.floor(W - M.l - M.r));
  const lines = useMemo(() => sensors.map((i) => ({ i, pts: envelope(hist.n, (p) => p.prox[i], from, now, buckets) })), [hist.n, hist.n.length, sensors, from, now, buckets]);
  const empty = hist.n.length < 2 ? t.chart.emptyRead : sensors.length === 0 ? t.chart.pickSensors : null;
  const last = hist.n[hist.n.length - 1];
  const tip = (at) => {
    const p = hist.n[Math.max(0, indexAt(hist.n, at))];
    return { time: timeLabel(t, now, at), none: t.chart.noData, items: p ? sensors.map((i) => ({ color: sensorColor(i), value: Math.round(p.prox[i]), name: t.net.sensors[i] })) : [] };
  };
  return (
    <Frame
      id={id} H={H} W={W} M={M} from={from} now={now} x={x} cursor={cursor} {...rest} range={[0, PROX_MAX]} ticks={[0, 1000, 2000, 3000, 4000]} tick={(v) => num(v, 0)}
      label={t.chart.laneRead} empty={empty} tip={tip}
    >
      {(y) => (
        <>
          <line x1={M.l} x2={W - M.r} y1={y(COLLISION)} y2={y(COLLISION)} className="threshold-line"><title>{fmt(t.act.threshold, { v: COLLISION })}</title></line>
          <text x={M.l + 4} y={y(COLLISION) - 4} className="note">{fmt(t.act.threshold, { v: COLLISION })}</text>
          {lines.map(({ i, pts }) => pts.length > 1 && (
            <path key={i} d={line(pts.map(([tt, v]) => [x(tt), y(Math.min(v, PROX_MAX))]))} className="series thin" style={{ stroke: sensorColor(i) }} />
          ))}
          {last && endLabels(sensors.map((i) => ({ i, v: last.prox[i] })), y, 11).map((e) => (
            <text key={e.i} x={W - M.r + 8} y={y(e.v)} className="end-label" dominantBaseline="central">{e.i + 1}</text>
          ))}
        </>
      )}
    </Frame>
  );
}

function Weights({ id, H, hist, sensors, side, maxW, t, now, from, W, M, x, cursor, ...rest }) {
  const key = side === 0 ? 'left' : 'right';
  const wheel = t.net.wheels[side];
  // a sensor whose weight never left 0 in this span has nothing to show
  const live = useMemo(() => {
    const used = new Array(7).fill(false);
    for (let k = Math.max(0, indexAt(hist.w, from)); k < hist.w.length; k++) hist.w[k][key].forEach((v, i) => { if (v !== 0) used[i] = true; });
    return used;
  }, [hist.w, hist.w.length, from, key]);
  const last = hist.w[hist.w.length - 1];
  const empty = hist.w.length < 2 ? t.chart.empty : sensors.length === 0 ? t.chart.pickSensors : null;
  const tip = (at) => {
    const k = indexAt(hist.w, at);
    const row = k >= 0 ? hist.w[k][key] : last ? last[key] : null;
    return {
      time: timeLabel(t, now, at), none: t.chart.noData,
      items: row ? sensors.filter((i) => live[i] || row[i] !== 0).map((i) => ({ color: sensorColor(i), value: num(row[i]), name: t.net.sensors[i] })) : [],
    };
  };
  return (
    <Frame
      id={id} H={H} W={W} M={M} from={from} now={now} x={x} cursor={cursor} {...rest} range={[-maxW, maxW]} ticks={[-maxW, -maxW / 2, 0, maxW / 2, maxW]} tick={(v) => num(v, 0)}
      label={`${t.chart.title}, ${wheel}`} empty={empty} tip={tip}
    >
      {(y) => (
        <>
          {hist.w.length > 1 && sensors.map((i) => live[i] && (
            <path key={i} d={stepLine(hist.w, (p) => p[key][i], x, y, from, now)} className="series" style={{ stroke: sensorColor(i) }} />
          ))}
          {last && sensors.map((i) => live[i] && last[key][i] !== 0 && <circle key={`d${i}`} cx={x(now)} cy={y(last[key][i])} r="4" className="end-dot" style={{ fill: sensorColor(i) }} />)}
          {last && endLabels(sensors.filter((i) => live[i] && last[key][i] !== 0).map((i) => ({ i, v: last[key][i] })), y, 13).map((e) => (
            <text key={e.i} x={x(now) + 9} y={y(e.v)} className="end-label" dominantBaseline="central">{e.i + 1}</text>
          ))}
        </>
      )}
    </Frame>
  );
}

function Wheels({ id, H, hist, wheelsOn, t, now, from, W, M, x, cursor, ...rest }) {
  const buckets = Math.max(60, Math.floor(W - M.l - M.r));
  const lines = useMemo(() => wheelsOn.map((j) => ({ j, pts: envelope(hist.n, (p) => p.motors[j], from, now, buckets) })), [hist.n, hist.n.length, wheelsOn, from, now, buckets]);
  const empty = hist.n.length < 2 ? t.chart.emptyRead : wheelsOn.length === 0 ? t.chart.pickWheels : null;
  const tip = (at) => {
    const p = hist.n[Math.max(0, indexAt(hist.n, at))];
    return { time: timeLabel(t, now, at), none: t.chart.noData, items: p ? wheelsOn.map((j) => ({ color: 'var(--ink)', dashed: j === 1, value: num(p.motors[j], 0), name: t.net.wheels[j] })) : [] };
  };
  return (
    <Frame
      id={id} H={H} W={W} M={M} from={from} now={now} x={x} cursor={cursor} {...rest} range={[-WHEEL_RANGE, WHEEL_RANGE]} ticks={[-WHEEL_RANGE, -WHEEL_RANGE / 2, 0, WHEEL_RANGE / 2, WHEEL_RANGE]} tick={(v) => num(v, 0)}
      label={t.chart.laneWheels} empty={empty} tip={tip}
    >
      {(y) => lines.map(({ j, pts }) => pts.length > 1 && (
        <path key={j} d={line(pts.map(([tt, v]) => [x(tt), y(Math.max(-WHEEL_RANGE, Math.min(WHEEL_RANGE, v)))]))} className={`series ${j ? 'dashed' : ''}`} style={{ stroke: 'var(--ink)' }} />
      ))}
    </Frame>
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
