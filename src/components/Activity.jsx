import React, { useState } from 'react';
import { COLLISION, PROX_MAX } from '../spec.js';
import { num, sensorColor, useSize } from '../util.js';
import { ago, line, nearest } from './chartkit.js';
import { fmt } from '../i18n.js';

// What the sensors read and what the wheels do during the last 30 seconds: one small row for each, on one shared time axis.
// Sensors 0 to 4 (the front ones) have the collision threshold drawn: a line that goes over it is a hit.
const SPAN = 30000;
const ROW = 30;
const GAP = 6;
const LABEL = 116;
const VALUE = 46;

export default function Activity({ t, hist, now }) {
  const [ref, { width }] = useSize({ width: 560, height: 300 });
  const [cursor, setCursor] = useState(null);
  const W = Math.max(280, width);
  const compact = W < 420;
  const left = compact ? 84 : LABEL;
  const right = W - VALUE;
  const from = now - SPAN;
  const pts = hist.n.filter((p) => p.t >= from);
  const x = (tt) => left + ((tt - from) / SPAN) * (right - left - 6);
  const rows = [
    ...t.net.sensors.map((name, i) => ({ id: `s${i}`, name: compact ? t.net.short[i] : name, color: sensorColor(i), min: 0, max: PROX_MAX, get: (p) => p.prox[i], sensor: i, num: i + 1 })),
    ...t.act.wheels.map((name, j) => ({ id: `m${j}`, name: compact ? t.net.wheelsShort[j] : name, color: 'var(--ink-2)', min: -300, max: 300, get: (p) => p.motors[j], wheel: j })),
  ];
  const H = rows.length * (ROW + GAP) + 22;
  const at = cursor != null && pts.length ? pts[nearest(pts, cursor)] : pts[pts.length - 1];

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    setCursor(from + ((px - left) / (right - left - 6)) * SPAN);
  };

  return (
    <section className="card activity" aria-label={t.act.title}>
      <header className="card-head">
        <div>
          <h2>{t.act.title}</h2>
          <p className="muted small">{t.act.sub}</p>
        </div>
      </header>
      <div ref={ref} className="spark-wrap">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.act.title}>
          {rows.map((r, k) => {
            const top = k * (ROW + GAP);
            const y = (v) => top + ROW - ((v - r.min) / (r.max - r.min)) * ROW;
            const path = pts.length > 1 ? line(pts.map((p) => [x(p.t), y(r.get(p))])) : '';
            const cur = at ? r.get(at) : 0;
            const over = r.sensor != null && r.sensor < 5 && cur > COLLISION;
            return (
              <g key={r.id}>
                <rect x={left} y={top} width={right - left - 6} height={ROW} className="lane" />
                {r.sensor != null && r.sensor < 5 && <line x1={left} x2={right - 6} y1={y(COLLISION)} y2={y(COLLISION)} className="threshold-line"><title>{fmt(t.act.threshold, { v: COLLISION })}</title></line>}
                {r.wheel != null && <line x1={left} x2={right - 6} y1={y(0)} y2={y(0)} className="axis" />}
                {path && r.sensor != null && <path d={`${path}L${x(pts[pts.length - 1].t).toFixed(1)},${top + ROW}L${x(pts[0].t).toFixed(1)},${top + ROW}Z`} className="area" style={{ fill: r.color }} />}
                {path && <path d={path} className="series" style={{ stroke: r.color }} />}
                {r.sensor != null && <circle cx={4} cy={top + ROW / 2} r="3.5" style={{ fill: r.color }} />}
                <text x={r.sensor != null ? 14 : 0} y={top + ROW / 2} className="row-label" dominantBaseline="central">{r.sensor != null ? `${r.num} ` : ''}{r.name}</text>
                <text x={W - 2} y={top + ROW / 2} className={`row-value ${over ? 'over' : ''}`} textAnchor="end" dominantBaseline="central">{r.sensor != null ? Math.round(cur) : num(cur, 0)}</text>
              </g>
            );
          })}
          {[0, 0.5, 1].map((f) => (
            <text key={f} x={left + f * (right - left - 6)} y={H - 4} className="tick" textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}>{f === 1 ? t.act.now : ago(-SPAN * (1 - f))}</text>
          ))}
          {cursor != null && at && <line x1={x(at.t)} x2={x(at.t)} y1={0} y2={H - 20} className="cursor" />}
          <rect x={left} y={0} width={right - left - 6} height={H - 20} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setCursor(null)} style={{ touchAction: 'pan-y' }} />
        </svg>
      </div>
    </section>
  );
}
