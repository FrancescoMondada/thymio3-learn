import React, { useMemo } from 'react';
import RobotTop from './RobotTop.jsx';
import { PROX_MAX, COLLISION, contribution } from '../spec.js';
import { bezierAt, clamp, curve, num, sensorColor, usePrefersReducedMotion } from '../util.js';
import { fmt } from '../i18n.js';

// The network, drawn as a diagram: 7 sensors and the constant "base" on the left, 2 wheels on the right, 16 connections.
// A connection is as thick as its weight is large; blue ends in an arrow (it speeds the wheel up), red ends in a bar (it slows
// it down); what flows along it is the speed that this sensor adds to this wheel right now.
// `vertical` turns the diagram a quarter turn for narrow screens: sensors on top, wheels at the bottom.

const NEURON_R = 19;

function layout(vertical) {
  if (!vertical) {
    const W = 900, H = 540;
    const top = 52, step = (H - 104) / 7;
    return {
      W, H, vertical,
      inputs: Array.from({ length: 8 }, (_, i) => ({ x: 372, y: top + i * step, r: NEURON_R })),
      outputs: [{ x: 786, y: 178, r: 38 }, { x: 786, y: 362, r: 38 }],
      robot: { x: 6, y: H / 2 - 98, size: 196 },
    };
  }
  const W = 420, H = 580;
  return {
    W, H, vertical,
    inputs: Array.from({ length: 8 }, (_, i) => ({ x: 34 + i * 50.3, y: 170, r: 17 })),
    outputs: [{ x: 112, y: 430, r: 38 }, { x: 308, y: 430, r: 38 }],
    robot: { x: 166, y: 0, size: 88 },
  };
}

// Where a connection leaves its sensor and arrives at its wheel; the arrivals are spread over the wheel's edge.
function ends(geo, i, j) {
  const a = geo.inputs[i];
  const o = geo.outputs[j];
  const spread = ((i - 3.5) / 3.5) * (Math.PI / 3.1);
  if (geo.vertical) return [[a.x, a.y + a.r], [o.x + Math.sin(spread) * o.r * 0.95, o.y - Math.cos(spread) * o.r * 0.95]];
  return [[a.x + a.r, a.y], [o.x - Math.cos(spread) * o.r * 0.95, o.y + Math.sin(spread) * o.r * 0.95]];
}

const widthOf = (w, full = 20) => 1.4 + 9 * Math.min(1, Math.abs(w) / full) ** 0.75;

export default function Network({ t, weights, prox, motors, base, hit, now, changed, selected, onSelect, vertical = false, showTips = true }) {
  const geo = useMemo(() => layout(vertical), [vertical]);
  const reduced = usePrefersReducedMotion();
  const wheels = t.net.wheels;
  const hitFresh = hit && now - hit.t < 2200;

  // the 16 connections
  const conns = [];
  for (let j = 0; j < 2; j++) {
    const row = j === 0 ? weights.left : weights.right;
    for (let i = 0; i < 8; i++) {
      const bias = i === 7;
      const w = bias ? base : row[i];
      const reading = bias ? 1 : prox[i] || 0;
      const c = bias ? base : contribution(reading, w);
      const [p0, p1] = ends(geo, i, j);
      const cv = curve(p0, p1, vertical);
      conns.push({ i, j, bias, w, reading, c, cv, pos: w > 0, neg: w < 0, key: `${j}-${i}`, tip: bezierAt(cv.c, 1), tail: bezierAt(cv.c, 0.97) });
    }
  }

  const sel = selected ? selected.sensor : null;
  const speedFor = (j) => motors[j] || 0;

  return (
    <svg className={`network ${vertical ? 'vertical' : ''}`} viewBox={`0 0 ${geo.W} ${geo.H}`} role="group" aria-label={t.net.title}>
      <RobotTop {...geo.robot} prox={prox} hit={hitFresh ? hit.sensors : null} motors={motors} title={t.net.title} />

      {/* connections */}
      <g className="conns">
        {conns.map((k) => {
          const isSel = sel === k.i && (selected.wheel == null || selected.wheel === k.j);
          const wpx = k.bias ? widthOf(k.w, 120) : widthOf(k.w);
          const zero = Math.abs(k.w) < 0.05;
          const flow = !zero && Math.abs(k.c) >= 0.4;
          const dur = clamp(1.5 - Math.abs(k.c) / 90, 0.3, 1.5);
          const tone = zero ? 'zero' : k.pos ? 'pos' : 'neg';
          const [cx, cy] = bezierAt(k.cv.c, k.j === 0 ? 0.3 : 0.44);
          const label = k.bias ? num(k.w, 0) : num(k.w);
          const tw = 9 + label.length * 6.6;
          const flash = !k.bias && changed && now - (changed[`${k.j}-${k.i}`] || -1e9) < 1400;
          const dx = k.tip[0] - k.tail[0];
          const dy = k.tip[1] - k.tail[1];
          const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
          const cap = 5 + wpx * 0.85;
          const name = k.bias ? t.net.bias : t.net.sensors[k.i];
          const tip = k.bias
            ? fmt(t.net.tipBias, { wheel: wheels[k.j], c: num(k.c, 0) })
            : fmt(t.net.tip, { sensor: name, wheel: wheels[k.j], w: num(k.w), p: Math.round(k.reading), c: num(k.c) });
          return (
            <g key={k.key} className={`conn ${tone} ${isSel ? 'selected' : ''} ${flash ? 'changed' : ''} ${k.bias ? 'bias' : ''}`}>
              {showTips && <title>{tip}</title>}
              {isSel && <path d={k.cv.d} className="underlay" style={{ strokeWidth: wpx + 9 }} />}
              <path d={k.cv.d} className="line" style={{ strokeWidth: zero ? 1 : wpx }} />
              {flow && !reduced && <path d={k.cv.d} className="flow" style={{ '--dur': `${dur}s`, strokeWidth: Math.min(wpx, 4.5), opacity: clamp(0.35 + Math.abs(k.c) / 40, 0.35, 1) }} />}
              {!zero && (
                <g transform={`translate(${k.tip[0]} ${k.tip[1]}) rotate(${ang})`} className="cap">
                  {k.pos || k.bias ? <path d={`M${-cap * 1.3},${-cap * 0.8} L0,0 L${-cap * 1.3},${cap * 0.8} Z`} /> : <path d={`M${-1.5},${-cap * 1.1} L${-1.5},${cap * 1.1}`} className="bar" style={{ strokeWidth: 4 }} />}
                </g>
              )}
              {/* a wide invisible line to touch */}
              <path d={k.cv.d} className="hit" onClick={() => !k.bias && onSelect?.(k.i, k.j)} />
              {(!zero || isSel) && !k.bias && (
                <g className="chip" transform={`translate(${cx} ${cy})`} onClick={() => onSelect?.(k.i, k.j)}>
                  <rect x={-tw / 2} y="-10" width={tw} height="20" rx="10" />
                  <text textAnchor="middle" dominantBaseline="central" y="0.5">{label}</text>
                </g>
              )}
              {k.bias && (
                <g className="chip bias-chip" transform={`translate(${cx} ${cy})`}>
                  <rect x={-tw / 2} y="-10" width={tw} height="20" rx="10" />
                  <text textAnchor="middle" dominantBaseline="central" y="0.5">{label}</text>
                </g>
              )}
            </g>
          );
        })}
      </g>

      {/* sensors */}
      {geo.inputs.map((n, i) => {
        const bias = i === 7;
        const reading = bias ? PROX_MAX : prox[i] || 0;
        const level = clamp(reading / PROX_MAX, 0, 1);
        const over = !bias && i < 5 && reading > COLLISION;
        const hot = !bias && hitFresh && hit.sensors[i];
        const name = bias ? t.net.bias : t.net.sensors[i];
        const picked = sel === i;
        const clipId = `clip-in-${i}-${vertical ? 'v' : 'h'}`;
        const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!bias) onSelect?.(i, null); } };
        const lx = vertical ? n.x : 222;
        return (
          <g key={i} className={`neuron in ${over ? 'over' : ''} ${hot ? 'hot' : ''} ${picked ? 'picked' : ''} ${bias ? 'bias' : ''}`} transform={`translate(${n.x} ${n.y})`}
            tabIndex={bias ? -1 : 0} role={bias ? undefined : 'button'} aria-label={bias ? undefined : fmt(t.net.neuron, { sensor: name, p: Math.round(reading) })} aria-pressed={bias ? undefined : picked}
            onClick={() => !bias && onSelect?.(i, null)} onKeyDown={onKey}>
            {showTips && <title>{bias ? t.net.formula : fmt(t.net.neuron, { sensor: name, p: Math.round(reading) })}</title>}
            <defs><clipPath id={clipId}><circle r={n.r - 1} /></clipPath></defs>
            <circle r={n.r} className="shell" />
            <g clipPath={`url(#${clipId})`}>
              <rect x={-n.r} y={-n.r} width={2 * n.r} height={2 * n.r} className="gauge" style={{ transform: `scaleY(${bias ? 1 : level})`, transformOrigin: 'center bottom', transformBox: 'fill-box' }} />
            </g>
            {!bias && i < 5 && <line className="threshold" x1={-n.r} x2={n.r} y1={n.r - 2 * n.r * (COLLISION / PROX_MAX)} y2={n.r - 2 * n.r * (COLLISION / PROX_MAX)} />}
            <circle r={n.r} className="rim" />
            {bias && <text className="one" textAnchor="middle" dominantBaseline="central" y="1">1</text>}
            {!vertical && (
              <>
                {!bias && (
                  <g transform={`translate(${lx - n.x - 18} 0)`}>
                    <circle r="9" className="badge" style={{ fill: sensorColor(i) }} />
                    <text className="badge-n" textAnchor="middle" dominantBaseline="central" y="0.5" style={i === 3 ? { fill: '#0b0b0b' } : undefined}>{i + 1}</text>
                  </g>
                )}
                <text className="n-name" x={lx - n.x} y="-3" dominantBaseline="central">{name}</text>
                <text className="n-val" x={lx - n.x} y="14" dominantBaseline="central">{bias ? num(base, 0) : Math.round(reading)}</text>
              </>
            )}
            {vertical && (
              <>
                {!bias && (
                  <g transform="translate(0 -39)">
                    <circle r="9" className="badge" style={{ fill: sensorColor(i) }} />
                    <text className="badge-n" textAnchor="middle" dominantBaseline="central" y="0.5" style={i === 3 ? { fill: '#0b0b0b' } : undefined}>{i + 1}</text>
                  </g>
                )}
                <text className="n-name small" y="-24" textAnchor="middle" dominantBaseline="central">{bias ? t.net.biasShort : t.net.short[i]}</text>
                <text className="n-val" y={n.r + 14} textAnchor="middle" dominantBaseline="central">{bias ? num(base, 0) : Math.round(reading)}</text>
              </>
            )}
          </g>
        );
      })}

      {/* wheels */}
      {geo.outputs.map((o, j) => {
        const v = speedFor(j);
        const level = clamp(v / 300, -1, 1);
        const barH = 130;
        const barW = 9;
        return (
          <g key={j} className="neuron out" transform={`translate(${o.x} ${o.y})`}>
            {showTips && <title>{fmt(t.net.wheelTip, { wheel: wheels[j], v: num(v, 0) })}</title>}
            <circle r={o.r} className="shell" />
            <circle r={o.r} className="rim" />
            <text className="speed" textAnchor="middle" dominantBaseline="central" y="4">{num(v, 0)}</text>
            <path className="dir" d={v > 0 ? 'M-6,-14 L0,-21 L6,-14' : v < 0 ? 'M-6,-21 L0,-14 L6,-21' : 'M-5,-17 L5,-17'} />
            <text className="n-name wheel" y={o.r + 20} textAnchor="middle">{wheels[j]}</text>
            {!vertical ? (
              <g transform={`translate(${o.r + 24} 0)`} className="speed-bar" aria-hidden="true">
                <rect x={-barW / 2} y={-barH / 2} width={barW} height={barH} rx="4" className="track" />
                <rect x={-barW / 2} y={level >= 0 ? -level * (barH / 2) : 0} width={barW} height={Math.abs(level) * (barH / 2)} rx="3" className="fill" />
                <line x1={-barW} x2={barW} y1="0" y2="0" className="zero" />
              </g>
            ) : (
              <g transform={`translate(0 ${o.r + 44})`} className="speed-bar" aria-hidden="true">
                <rect x="-65" y={-barW / 2} width="130" height={barW} rx="4" className="track" />
                <rect x={level >= 0 ? 0 : level * 65} y={-barW / 2} width={Math.abs(level) * 65} height={barW} rx="3" className="fill" />
                <line y1={-barW} y2={barW} x1="0" x2="0" className="zero" />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
