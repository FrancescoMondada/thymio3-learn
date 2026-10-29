import React, { useEffect, useMemo, useRef, useState } from 'react';
import RobotTop from './RobotTop.jsx';
import { MinusIcon, PlusIcon } from '../icons.jsx';
import { PROX_MAX, COLLISION, W_LIMIT, contribution } from '../spec.js';
import { MINUS, arrowEnds, bezierAt, clamp, curve, num, sensorColor, usePrefersReducedMotion } from '../util.js';
import { fmt } from '../i18n.js';

// The network, drawn as a diagram: 7 sensors and the constant "base" on the left, 2 wheels on the right, 16 connections.
// A connection is as thick as its weight is large; blue (positive weight) and red (negative) both end in an arrow, a little
// before the wheel; what flows along it is the speed that this sensor adds to this wheel right now. The number on a connection
// is its weight: touch it to type another one.
// A sensor is a bar that fills with its reading (a red tick marks the collision threshold) and ends in a small dot where its
// connections start. A wheel is a "+": it adds up the base speed and what each sensor brings, and the result goes out on its right
// (below it, turned), to the wheel itself, whose tyre stripes move in proportion to its speed, and the number.
// `vertical` turns the diagram a quarter turn for narrow screens: sensors on top, wheels at the bottom.

const WHEEL_R = 44;
const BAR = 112;                // the length of a sensor's reading bar (horizontal diagram)
const BAR_V = 52;               // and its height (vertical diagram)
const PORT = 5;                 // the dot where the connections of a sensor start
const TREAD = 0.5;              // the stripes of a tyre move 0.5 px a second for one unit of wheel speed (12 px between two stripes)
const GAP = 11;                 // between the tip of an arrow and the wheel

function layout(vertical) {
  if (!vertical) {
    const W = 900, H = 540;
    const top = 52, step = (H - 104) / 7;
    const outputs = [{ x: 670, y: 178, r: WHEEL_R }, { x: 670, y: 362, r: WHEEL_R }];
    return {
      W, H, vertical,
      inputs: Array.from({ length: 8 }, (_, i) => ({ x: 400, y: top + i * step })),
      outputs,
      tyre: { w: 36, h: 104 },
      robot: { x: 60, y: H / 2 - 80, size: 160, range: 90 },
    };
  }
  const W = 420, H = 700;
  const outputs = [{ x: 112, y: 514, r: WHEEL_R }, { x: 308, y: 514, r: WHEEL_R }];
  return {
    W, H, vertical,
    inputs: Array.from({ length: 8 }, (_, i) => ({ x: 34 + i * 50.3, y: 305 })),
    outputs,
    tyre: { w: 30, h: 72 },
    robot: { x: 160, y: 44, size: 100, range: 70 },
  };
}

// Where a connection leaves its sensor and arrives at its wheel: the arrivals are spread over the wheel's edge, and each one
// comes in leaning towards the wheel's centre (`dir`, the way back along the curve) so that the arrow heads do not pile up.
function ends(geo, i, j) {
  const a = geo.inputs[i];
  const o = geo.outputs[j];
  const spread = ((i - 3.5) / 3.5) * (Math.PI / 2.8);
  const n = geo.vertical ? [Math.sin(spread), -Math.cos(spread)] : [-Math.cos(spread), Math.sin(spread)];
  const back = geo.vertical ? [0, -1] : [-1, 0];
  const lean = 0.4;
  const d = [back[0] * (1 - lean) + n[0] * lean, back[1] * (1 - lean) + n[1] * lean];
  const len = Math.hypot(d[0], d[1]);
  const p0 = geo.vertical ? [a.x, a.y + PORT] : [a.x + PORT, a.y];
  return [p0, [o.x + n[0] * o.r, o.y + n[1] * o.r], [d[0] / len, d[1] / len]];
}

const widthOf = (w, full = 20) => 1.4 + 9 * Math.min(1, Math.abs(w) / full) ** 0.75;

export default function Network({ t, weights, prox, motors, base, hit, now, changed, enabled = false, onSetWeight, vertical = false, showTips = true }) {
  const geo = useMemo(() => layout(vertical), [vertical]);
  const reduced = usePrefersReducedMotion();
  const wheels = t.net.wheels;
  const hitFresh = hit && now - hit.t < 2200;
  const [editing, setEditing] = useState(null);                  // { i, j }: the weight whose chip is being typed in
  const [held, setHeld] = useState({});                          // weights just set by hand, shown until the robot has confirmed them
  const timers = useRef({});
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const setWeight = (i, j, v) => {
    const key = `${j}-${i}`;
    setHeld((h) => ({ ...h, [key]: v }));
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => setHeld((h) => { const n = { ...h }; delete n[key]; return n; }), 1200);
    onSetWeight?.(i, j, v);
  };

  // the 16 connections
  const conns = [];
  for (let j = 0; j < 2; j++) {
    const row = j === 0 ? weights.left : weights.right;
    for (let i = 0; i < 8; i++) {
      const bias = i === 7;
      const key = `${j}-${i}`;
      const w = bias ? base : held[key] ?? row[i];
      const reading = bias ? 1 : prox[i] || 0;
      const c = bias ? base : contribution(reading, w);
      const [p0, p1, dir] = ends(geo, i, j);
      const cv = curve(p0, p1, vertical, dir);
      const wpx = bias ? widthOf(w, 120) : widthOf(w);
      const zero = Math.abs(w) < 0.05;
      const head = 9 + wpx * 0.9;
      const stop = arrowEnds(cv.c, GAP, zero ? 0 : head);
      conns.push({ i, j, bias, w, reading, c, cv, wpx, zero, head, hw: 5.1 + wpx * 0.51, stop, pos: w > 0, neg: w < 0, key });
    }
  }

  const speedFor = (j) => motors[j] || 0;
  const editingConn = editing ? conns.find((k) => k.i === editing.i && k.j === editing.j) : null;
  const open = (k) => { if (enabled && !k.bias) setEditing({ i: k.i, j: k.j }); };
  const chipAt = (k) => bezierAt(k.cv.c, k.j === 0 ? 0.3 : 0.44);

  return (
    <div className="net-box">
      <svg className={`network ${vertical ? 'vertical' : ''}`} viewBox={`0 0 ${geo.W} ${geo.H}`} role="group" aria-label={t.net.title}>
        <RobotTop {...geo.robot} prox={prox} hit={hitFresh ? hit.sensors : null} motors={motors} title={t.net.title} />

        {/* connections */}
        <g className="conns">
          {conns.map((k) => {
            const isEd = editing && editing.i === k.i && editing.j === k.j;
            const { wpx, zero } = k;
            const flow = !zero && Math.abs(k.c) >= 0.4;
            const dur = clamp(1.5 - Math.abs(k.c) / 90, 0.3, 1.5);
            const tone = zero ? 'zero' : k.pos ? 'pos' : 'neg';
            const [cx, cy] = chipAt(k);
            const label = k.bias ? num(k.w, 0) : num(k.w);
            const tw = 9 + label.length * 6.6;
            const flash = !k.bias && changed && now - (changed[`${k.j}-${k.i}`] || -1e9) < 1400;
            const name = k.bias ? t.net.bias : t.net.sensors[k.i];
            const tip = k.bias
              ? fmt(t.net.tipBias, { wheel: wheels[k.j], c: num(k.c, 0) })
              : fmt(t.net.tip, { sensor: name, wheel: wheels[k.j], w: num(k.w), p: Math.round(k.reading), c: num(k.c) });
            const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(k); } };
            return (
              <g key={k.key} className={`conn ${tone} ${isEd ? 'selected' : ''} ${flash ? 'changed' : ''} ${k.bias ? 'bias' : ''}`}>
                {showTips && <title>{tip}</title>}
                {isEd && <path d={k.stop.line} className="underlay" style={{ strokeWidth: wpx + 9 }} />}
                <path d={k.stop.line} className="line" style={{ strokeWidth: zero ? 1 : wpx }} />
                {flow && !reduced && <path d={k.stop.line} className="flow" style={{ '--dur': `${dur}s`, strokeWidth: Math.min(wpx, 4.5), opacity: clamp(0.35 + Math.abs(k.c) / 40, 0.35, 1) }} />}
                {/* a wide invisible line to touch */}
                <path d={k.cv.d} className="hit" onClick={() => open(k)} />
                {!k.bias && (
                  <g
                    className={`chip ${enabled ? 'editable' : ''}`} transform={`translate(${cx} ${cy})`} style={isEd ? { visibility: 'hidden' } : undefined}
                    role="button" tabIndex={enabled ? 0 : -1} aria-disabled={!enabled} aria-label={`${name} → ${wheels[k.j]} : ${label}`}
                    onClick={() => open(k)} onKeyDown={onKey}
                  >
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

        {/* the arrows: they stop short of the wheel, and the line stops where the head starts */}
        <g className="heads">
          {conns.map((k) => {
            if (k.zero) return null;
            const [x, y] = k.stop.tip;
            const shape = `M${-k.head},${-k.hw} L0,0 L${-k.head},${k.hw} Z`;
            return (
              <g key={k.key} className={`conn ${k.pos ? 'pos' : 'neg'} ${k.bias ? 'bias' : ''}`}>
                <g transform={`translate(${x} ${y}) rotate(${k.stop.angle})`} className="head">
                  <path d={shape} className="halo" />
                  <path d={shape} className="tri" />
                </g>
              </g>
            );
          })}
        </g>

        {/* sensors: a bar that fills with the reading, and the dot where the connections start */}
        {geo.inputs.map((n, i) => {
          const bias = i === 7;
          const reading = bias ? PROX_MAX : prox[i] || 0;
          const level = clamp(reading / PROX_MAX, 0, 1);
          const front = !bias && i < 5;
          const over = front && reading > COLLISION;
          const hot = !bias && hitFresh && hit.sensors[i];
          const name = bias ? t.net.bias : t.net.sensors[i];
          const thr = COLLISION / PROX_MAX;
          const shown = bias ? num(base, 0) : Math.round(reading);
          const badge = (
            <>
              <circle r="9" className="badge" style={{ fill: sensorColor(i) }} />
              <text className="badge-n" textAnchor="middle" dominantBaseline="central" y="0.5" style={i === 3 ? { fill: '#0b0b0b' } : undefined}>{i + 1}</text>
            </>
          );
          return (
            <g key={i} className={`sensor-in ${over ? 'over' : ''} ${hot ? 'hot' : ''} ${bias ? 'bias' : ''}`} transform={`translate(${n.x} ${n.y})`}
              role={bias ? undefined : 'img'} aria-label={bias ? undefined : fmt(t.net.neuron, { sensor: name, p: Math.round(reading) })}>
              {showTips && <title>{bias ? t.net.formula : fmt(t.net.neuron, { sensor: name, p: Math.round(reading) })}</title>}
              {!vertical ? (
                <>
                  {!bias && <g transform="translate(-178 0)">{badge}</g>}
                  <text className="n-name" x="-162" y="-9" dominantBaseline="central">{name}</text>
                  {bias ? (
                    <>
                      <rect x="-162" y="-2" width="26" height="17" rx="8.5" className="one-pill" />
                      <text className="one" x="-149" y="7" textAnchor="middle" dominantBaseline="central">1</text>
                    </>
                  ) : (
                    <>
                      <rect x="-162" y="2" width={BAR} height="11" rx="5.5" className="track" />
                      <rect x="-162" y="2" width={Math.max(level * BAR, level > 0 ? 6 : 0)} height="11" rx="5.5" className="fill" style={over ? undefined : { fill: sensorColor(i) }} />
                      {front && <line x1={-162 + BAR * thr} x2={-162 + BAR * thr} y1="-1" y2="16" className="tick" />}
                      <text className="n-val" x="-42" y="8" dominantBaseline="central">{shown}</text>
                    </>
                  )}
                </>
              ) : (
                <>
                  {!bias && <g transform="translate(0 -111)">{badge}</g>}
                  <text className="n-name small" y="-94" textAnchor="middle" dominantBaseline="central">{bias ? t.net.biasShort : t.net.short[i]}</text>
                  {bias ? (
                    <>
                      <rect x="-10" y="-68" width="20" height="26" rx="10" className="one-pill" />
                      <text className="one" y="-54" textAnchor="middle" dominantBaseline="central">1</text>
                    </>
                  ) : (
                    <>
                      <rect x="-7" y={-31 - BAR_V} width="14" height={BAR_V} rx="7" className="track" />
                      <rect x="-7" y={-31 - Math.max(level * BAR_V, level > 0 ? 7 : 0)} width="14" height={Math.max(level * BAR_V, level > 0 ? 7 : 0)} rx="7" className="fill" style={over ? undefined : { fill: sensorColor(i) }} />
                      {front && <line x1="-11" x2="11" y1={-31 - BAR_V * thr} y2={-31 - BAR_V * thr} className="tick" />}
                      <text className="n-val" y="-15" textAnchor="middle" dominantBaseline="central">{shown}</text>
                    </>
                  )}
                </>
              )}
              <circle r={PORT} className="port" />
            </g>
          );
        })}

        {/* wheels: a "+" that adds up its inputs; the result goes out to the wheel itself, with its speed */}
        {geo.outputs.map((o, j) => {
          const v = speedFor(j);
          const { w, h } = geo.tyre;
          const out = !vertical
            ? { wire: `M${o.r + 2},0 H${o.r + 22}`, head: `M${o.r + 34},0 L${o.r + 21},-6.5 L${o.r + 21},6.5 Z`, tx: o.r + 58, ty: 0, nx: o.r + 88, ny: 1, name: [0, o.r + 30] }
            : { wire: `M0,${o.r + 2} V${o.r + 22}`, head: `M0,${o.r + 34} L-6.5,${o.r + 21} L6.5,${o.r + 21} Z`, tx: -26, ty: o.r + 76, nx: -2, ny: o.r + 76, name: [0, o.r + 124] };
          return (
            <g key={j} className="neuron out" transform={`translate(${o.x} ${o.y})`}>
              {showTips && <title>{fmt(t.net.wheelTip, { wheel: wheels[j], v: num(v, 0) })}</title>}
              <circle r={o.r} className="shell" />
              <circle r={o.r} className="rim" />
              <path className="plus" d="M-14,0 H14 M0,-14 V14" />
              <path className="out-wire" d={out.wire} />
              <path className="out-head" d={out.head} />
              <Tyre x={out.tx} y={out.ty} w={w} h={h} v={v} />
              <text className="speed" x={out.nx} y={out.ny} dominantBaseline="central">{num(v, 0)}</text>
              <text className="n-name wheel" x={out.name[0]} y={out.name[1]} textAnchor="middle">{wheels[j]}</text>
            </g>
          );
        })}
      </svg>
      {editingConn && (
        <ChipEditor
          key={editingConn.key} t={t} label={`${t.net.sensors[editingConn.i]} → ${wheels[editingConn.j]}`} value={editingConn.w}
          x={(chipAt(editingConn)[0] / geo.W) * 100} y={(chipAt(editingConn)[1] / geo.H) * 100}
          onSet={(v) => setWeight(editingConn.i, editingConn.j, v)} onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// The wheel, seen from above, front up: the stripes of its tyre move up when it goes forward and down when it backs up, at a rate
// that is exactly proportional to the wheel's speed (TREAD px a second for each unit; still when the speed is 0).
function Tyre({ x, y, w, h, v }) {
  const reduced = usePrefersReducedMotion();
  const tread = useRef(null);
  const speed = useRef(v);
  speed.current = v;
  useEffect(() => {
    if (reduced) return undefined;
    let raf = 0;
    let last = 0;
    let offset = 0;
    const step = (now) => {
      if (last && tread.current) {
        offset = (offset - speed.current * TREAD * (Math.min(now - last, 250) / 1000)) % 12;
        tread.current.style.strokeDashoffset = offset;
      }
      last = now;
    };
    const frame = (now) => { step(now); raf = requestAnimationFrame(frame); };
    raf = requestAnimationFrame(frame);
    // a page that gets no animation frames (in the background) keeps the stripes going on a timer
    const timer = setInterval(() => { const now = performance.now(); if (now - last > 120) step(now); }, 100);
    return () => { cancelAnimationFrame(raf); clearInterval(timer); };
  }, [reduced]);
  return (
    <g className="wheel-glyph" transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={w / 3} className="tire" />
      <path ref={tread} d={`M0,${h / 2 - 5} V${-h / 2 + 5}`} className="tread" style={{ strokeWidth: w - 10 }} />
    </g>
  );
}

// A weight typed in the chip: the number, one notch less, one notch more. Enter or a click elsewhere sets it, Esc forgets it.
function ChipEditor({ t, label, value, x, y, onSet, onClose }) {
  const [text, setText] = useState(num(value));
  const box = useRef(null);
  const input = useRef(null);
  const closed = useRef(false);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const read = (s) => { const v = Number(s.replace(MINUS, '-').replace(',', '.')); return s.trim() !== '' && Number.isFinite(v) ? v : null; };
  const rounded = (v) => clamp(Math.round(v * 2) / 2, -W_LIMIT, W_LIMIT);
  const close = () => { closed.current = true; onClose(); };
  const finish = () => {
    if (closed.current) return;
    const v = read(text);
    if (v != null && rounded(v) !== value) onSet(rounded(v));
    close();
  };
  const nudge = (d) => { const v = rounded((read(text) ?? value) + d); setText(num(v)); onSet(v); };
  const keep = (e) => e.preventDefault();                         // pressing a button must not take the focus from the number
  return (
    <div
      ref={box} className="chip-edit" role="group" aria-label={label}
      style={{ left: `clamp(88px, ${x}%, calc(100% - 88px))`, top: `${y}%` }}
      onBlur={(e) => { if (!box.current?.contains(e.relatedTarget)) finish(); }}
    >
      <span className="chip-edit-label">{label}</span>
      <div className="chip-edit-row">
        <button type="button" className="icon-btn small" onPointerDown={keep} onMouseDown={keep} onClick={() => nudge(-0.5)} aria-label={`${t.weights.less} (${MINUS}0,5)`} title={t.weights.less}><MinusIcon size={14} /></button>
        <input
          ref={input} type="text" inputMode="decimal" className="num" aria-label={`${t.weights.typed}, ${label}`} value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); finish(); }
            else if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0.5); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(-0.5); }
          }}
        />
        <button type="button" className="icon-btn small" onPointerDown={keep} onMouseDown={keep} onClick={() => nudge(0.5)} aria-label={`${t.weights.more} (+0,5)`} title={t.weights.more}><PlusIcon size={14} /></button>
      </div>
    </div>
  );
}
