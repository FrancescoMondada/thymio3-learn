import React, { useEffect, useMemo, useRef, useState } from 'react';
import RobotBody, { WHEEL } from './RobotBody.jsx';
import { MinusIcon, PlusIcon } from '../icons.jsx';
import { PROX_MAX, COLLISION, SENSORS, SENSE_RANGE_MM, W_LIMIT, contribution, distanceFromProx } from '../spec.js';
import { MINUS, arrowEnds, bezierAt, clamp, num, sensorColor, usePrefersReducedMotion } from '../util.js';
import { fmt } from '../i18n.js';

// The robot and its network in one picture: the robot seen from above, and inside it the network that drives it. The seven sensors
// are on its nose, each with its cone (as long as the distance its reading stands for), the base speed on its tail, the two "+" neurons
// beside the two wheels, and the 16 connections between them, as thick as their weights are large. Blue (positive weight) and red
// (negative) both end in an arrow, a little before the neuron; what flows along a connection is the speed that this sensor adds to this
// wheel right now. The number on a connection is its weight: touch it to type another one. A neuron adds up the base speed and what each
// sensor brings, and sends the result to its wheel, whose tyre stripes move in proportion to the speed.
// The robot is turned to face left on a wide screen (wheels at the top and the bottom), and faces up on a narrow one (`vertical`).

const GAP = 9;                              // between the tip of an arrow and the neuron, px
const RAD = Math.PI / 180;
const NEURON = { x: 20, y: 26, r: 10.5 };   // mm, in the robot's drawing (x to the right, y to the back): inside the body, beside the wheel
const SENSOR_R = 6;                         // mm
const BASE_AT = [0, 46];                    // mm: where the base speed (the constant 1) sits, on the tail
const DRAWN = { 5: [-20, 56], 6: [20, 56] };    // the back sensors, on the tail; the others are at SENSORS[i] (x, -y)
const TREAD_MM = 0.2;                       // the stripes of a tyre move 0.2 mm a second for one unit of wheel speed
const LEFT = 0;
const RIGHT = 1;

// The picture: where the robot's drawing (millimetres, front up) goes on the screen. `at` puts a point there, `dir` turns a direction.
function layout(vertical) {
  const s = vertical ? 2.4 : 4.4;
  const W = vertical ? 420 : 830;
  const H = vertical ? 510 : 670;
  const cx = vertical ? 210 : 415;
  const cy = vertical ? 255 : 335;
  const at = vertical ? (x, y) => [cx + x * s, cy + y * s] : (x, y) => [cx + y * s, cy - x * s];
  const dir = vertical ? (dx, dy) => [dx, dy] : (dx, dy) => [dy, -dx];
  return { W, H, s, cx, cy, at, dir, rot: vertical ? 0 : -90, range: vertical ? 45 : 33, vertical };
}

const unit = ([x, y]) => { const n = Math.hypot(x, y) || 1; return [x / n, y / n]; };
const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];

// The way a connection comes into a neuron, as a direction in the robot's drawing: from the nose side for the five front sensors (in the
// order of their positions across the robot, so that the lines do not cross each other), from the tail for the back ones and the base.
function arrival(i) {
  if (i < 5) { const a = ((i - 2) / 2) * 52 * RAD; return [Math.sin(a), -Math.cos(a)]; }
  const a = (i === 5 ? -40 : i === 6 ? 40 : 0) * RAD;
  return [Math.sin(a), Math.cos(a)];
}

const widthOf = (w, full = 20) => 1.4 + 9 * Math.min(1, Math.abs(w) / full) ** 0.75;

export default function Network({ t, weights, prox, motors, base, hit, now, changed, enabled = false, onSetWeight, vertical = false, showTips = true }) {
  const geo = useMemo(() => layout(vertical), [vertical]);
  const { s, at, dir } = geo;
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

  // where everything is, on the screen
  const sensors = SENSORS.map((sensor) => {
    const [x, y] = DRAWN[sensor.id] || [sensor.x, -sensor.y];
    return { id: sensor.id, angle: sensor.angle, pos: at(x, y), r: SENSOR_R * s, d0: dir(0, sensor.id < 5 ? 1 : -1), axis: dir(-Math.sin(sensor.angle * RAD), -Math.cos(sensor.angle * RAD)) };
  });
  const baseNode = { pos: at(...BASE_AT), r: 11 };
  const neurons = [LEFT, RIGHT].map((j) => {
    const side = j === LEFT ? -1 : 1;
    return { j, pos: at(side * NEURON.x, NEURON.y), r: NEURON.r * s, out: dir(side, 0), wheelAt: at(side * WHEEL.x, WHEEL.y) };
  });

  // the 16 connections
  const conns = [];
  for (const N of neurons) {
    const row = N.j === LEFT ? weights.left : weights.right;
    for (let i = 0; i < 8; i++) {
      const bias = i === 7;
      const key = `${N.j}-${i}`;
      const w = bias ? base : held[key] ?? row[i];
      const reading = bias ? 1 : prox[i] || 0;
      const c = bias ? base : contribution(reading, w);
      const from = bias ? baseNode : sensors[i];
      const d0 = bias ? unit([N.pos[0] - from.pos[0], N.pos[1] - from.pos[1]]) : from.d0;
      const n = dir(...arrival(i));
      const p0 = add(from.pos, d0, from.r);
      const p1 = add(N.pos, n, N.r);
      const k = clamp(0.4 * Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), 24, 170);
      const cp = [p0, add(p0, d0, k), add(p1, n, k), p1];
      const wpx = bias ? widthOf(w, 120) : widthOf(w);
      const zero = Math.abs(w) < 0.05;
      const head = 8 + wpx * 0.7;
      const stop = arrowEnds(cp, GAP, zero ? 0 : head);
      const chipT = i > 4 ? 0.5 : N.j === LEFT ? 0.27 : 0.43;
      conns.push({ i, j: N.j, bias, w, reading, c, cp, d: `M${p0[0]},${p0[1]} C${cp[1][0]},${cp[1][1]} ${cp[2][0]},${cp[2][1]} ${p1[0]},${p1[1]}`, wpx, zero, head, hw: 4 + wpx * 0.4, stop, pos: w > 0, neg: w < 0, key, chipT });
    }
  }

  const editingConn = editing ? conns.find((k) => k.i === editing.i && k.j === editing.j) : null;
  const open = (k) => { if (enabled && !k.bias) setEditing({ i: k.i, j: k.j }); };
  const chipAt = (k) => bezierAt(k.cp, k.chipT);

  return (
    <div className={`net-box ${vertical ? 'vertical' : ''}`} style={{ '--ar': geo.W / geo.H }}>
      <svg className={`network ${vertical ? 'vertical' : ''}`} viewBox={`0 0 ${geo.W} ${geo.H}`} role="group" aria-label={t.net.title}>
        {/* the cones of the sensors, under the robot: long and faint when nothing is close, short and strong when something is */}
        <g className="cones">
          {sensors.map((sn) => {
            const reading = prox[sn.id] || 0;
            const v = clamp(reading / PROX_MAX, 0, 1);
            const L = Math.max(4, (distanceFromProx(reading) / SENSE_RANGE_MM) * geo.range * s);
            const sin = Math.sin(17 * RAD) * L;
            const cos = Math.cos(17 * RAD) * L;
            const tip = add(sn.pos, sn.axis, L + 13);
            return (
              <g key={sn.id} className="cone" style={{ color: sensorColor(sn.id) }}>
                <g transform={`translate(${sn.pos[0]} ${sn.pos[1]}) rotate(${geo.rot - sn.angle})`}>
                  <path d={`M0,0 L${-sin},${-cos} A${L},${L} 0 0 1 ${sin},${-cos} Z`} className="wedge" style={{ fillOpacity: 0.11 + 0.3 * v }} />
                  <path d={`M${-sin},${-cos} A${L},${L} 0 0 1 ${sin},${-cos}`} className="far" style={{ strokeOpacity: 0.28 + 0.7 * v }} />
                </g>
                <text className="s-read" x={tip[0]} y={tip[1]} textAnchor="middle" dominantBaseline="central">{Math.round(reading)}</text>
              </g>
            );
          })}
        </g>

        {/* the robot */}
        <g className="net-robot" transform={`translate(${geo.cx} ${geo.cy}) rotate(${geo.rot}) scale(${s})`}>
          <RobotBody wheels={false} hit={!!hitFresh} />
        </g>

        {/* the tyres: the stripes move up when the wheel goes forward, in proportion to its speed */}
        {neurons.map((N) => <Tyre key={N.j} x={N.wheelAt[0]} y={N.wheelAt[1]} w={WHEEL.w * s} h={WHEEL.h * s} v={motors[N.j] || 0} rot={geo.rot} pxPerUnit={TREAD_MM * s} />)}

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
                <path d={k.d} className="hit" onClick={() => open(k)} />
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
              </g>
            );
          })}
        </g>

        {/* the arrows: they stop short of the neuron, and the line stops where the head starts */}
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

        {/* the base speed: the constant 1 */}
        <g className="base-node" transform={`translate(${baseNode.pos[0]} ${baseNode.pos[1]})`}>
          {showTips && <title>{t.net.formula}</title>}
          <rect x="-14" y="-10" width="28" height="20" rx="10" className="one-pill" />
          <text className="one" textAnchor="middle" dominantBaseline="central" y="1">1</text>
          <text className="n-name small" x={vertical ? 0 : 22} y={vertical ? 21 : 0} textAnchor={vertical ? 'middle' : 'start'} dominantBaseline="central">{t.net.biasShort} {num(base, 0)}</text>
        </g>

        {/* the sensors, on the nose: numbered, filled by what they read */}
        {sensors.map((sn) => {
          const reading = prox[sn.id] || 0;
          const v = clamp(reading / PROX_MAX, 0, 1);
          const over = sn.id < 5 && reading > COLLISION;
          const hot = hitFresh && hit.sensors[sn.id];
          const name = t.net.sensors[sn.id];
          return (
            <g key={sn.id} transform={`translate(${sn.pos[0]} ${sn.pos[1]})`} role="img" aria-label={fmt(t.net.neuron, { sensor: name, p: Math.round(reading) })}>
              {showTips && <title>{fmt(t.net.neuron, { sensor: name, p: Math.round(reading) })}</title>}
              <circle r={sn.r} className="s-back" />
              <circle r={sn.r} className={`s-disc ${over ? 'over' : ''}`} style={{ fill: sensorColor(sn.id), fillOpacity: 0.3 + 0.7 * v, stroke: sensorColor(sn.id) }} />
              {hot && <circle r={sn.r + 6} className="hit-ring" />}
              <text className="s-num" textAnchor="middle" dominantBaseline="central" y="0.5" style={sn.id === 3 ? { fill: '#0b0b0b' } : undefined}>{sn.id + 1}</text>
            </g>
          );
        })}

        {/* the two neurons: a "+" beside each wheel; the result goes out to the wheel, with its speed */}
        {neurons.map((N) => {
          const v = motors[N.j] || 0;
          const o = N.out;
          const a = add(N.pos, o, N.r + 3);
          const b = add(N.pos, o, N.r + 17);
          const perp = [-o[1], o[0]];
          const tipP = add(N.pos, o, N.r + 24);
          const baseP = add(N.pos, o, N.r + 11);
          const l = add(baseP, perp, 6);
          const rgt = add(baseP, perp, -6);
          const head = `M${tipP[0]},${tipP[1]} L${l[0]},${l[1]} L${rgt[0]},${rgt[1]} Z`;
          // the speed and the name of the wheel, outside the robot beside the wheel (the short name on a narrow screen)
          const numAt = add(N.wheelAt, o, WHEEL.w * s / 2 + (vertical ? 30 : 22));
          const nameAt = vertical ? add(numAt, [0, 1], 22) : add(numAt, o, 24);
          const r = N.r;
          return (
            <g key={N.j} className="neuron out">
              {showTips && <title>{fmt(t.net.wheelTip, { wheel: wheels[N.j], v: num(v, 0) })}</title>}
              <circle cx={N.pos[0]} cy={N.pos[1]} r={r} className="shell" />
              <circle cx={N.pos[0]} cy={N.pos[1]} r={r} className="rim" />
              <path className="plus" d={`M${N.pos[0] - r * 0.45},${N.pos[1]} H${N.pos[0] + r * 0.45} M${N.pos[0]},${N.pos[1] - r * 0.45} V${N.pos[1] + r * 0.45}`} />
              <path className="out-wire" d={`M${a[0]},${a[1]} L${b[0]},${b[1]}`} />
              <path className="out-head" d={head} />
              <text className="speed" x={numAt[0]} y={numAt[1]} textAnchor="middle" dominantBaseline="central">{num(v, 0)}</text>
              <text className="n-name wheel" x={nameAt[0]} y={nameAt[1]} textAnchor="middle" dominantBaseline="central">{vertical ? t.net.wheelsShort[N.j] : wheels[N.j]}</text>
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

// A wheel, seen from above, front up (turned by `rot` on the screen): the stripes of its tyre move forward when it goes forward and
// backward when it backs up, at a rate exactly proportional to the wheel's speed (`pxPerUnit` px a second for each unit; still at 0).
function Tyre({ x, y, w, h, v, rot, pxPerUnit }) {
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
        offset = (offset - speed.current * pxPerUnit * (Math.min(now - last, 250) / 1000)) % 12;
        tread.current.style.strokeDashoffset = offset;
      }
      last = now;
    };
    const frame = (now) => { step(now); raf = requestAnimationFrame(frame); };
    raf = requestAnimationFrame(frame);
    // a page that gets no animation frames (in the background) keeps the stripes going on a timer
    const timer = setInterval(() => { const now = performance.now(); if (now - last > 120) step(now); }, 100);
    return () => { cancelAnimationFrame(raf); clearInterval(timer); };
  }, [reduced, pxPerUnit]);
  return (
    <g className="wheel-glyph" transform={`translate(${x} ${y}) rotate(${rot})`}>
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
