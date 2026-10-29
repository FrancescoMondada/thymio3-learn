import React from 'react';
import RobotBody, { WHEEL } from './RobotBody.jsx';
import { SENSORS, PROX_MAX, COLLISION, SENSE_RANGE_MM, distanceFromProx } from '../spec.js';
import { sensorColor } from '../util.js';

// The robot seen from above, front at the top, with its seven proximity sensors numbered, lit by what they read, each with its cone.
// Same numbers and colours as the sensors of the network and the lines of the charts. The two back sensors are drawn on the tail,
// the others at the edge of the nose.
const DRAWN = { 5: [-20, 56], 6: [20, 56] };
const HALF = (17 * Math.PI) / 180;                // half the opening of a cone
const SIN = Math.sin(HALF);
const COS = Math.cos(HALF);

// Each sensor sees a cone, as long as the distance its reading stands for: low reading = far = a long cone (the whole range when it
// sees nothing, faint), high reading = near = a short, strong one; its far end is where the object is. `range` is how long, in
// millimetres of the drawing, the cone of "nothing seen" is (the drawing is about 1 unit to a millimetre).
export default function RobotTop({ prox = [], hit = null, motors = null, size = 150, labels = true, range = 90, className = '', title, ...place }) {
  const spot = (s) => DRAWN[s.id] || [s.x, -s.y];
  return (
    <svg className={`robot-top ${className}`} viewBox="-72 -74 144 144" width={size} height={size} role="img" aria-label={title || 'Thymio'} {...place}>
      {SENSORS.map((s) => {
        const reading = prox[s.id] || 0;
        const v = Math.max(0, Math.min(1, reading / PROX_MAX));
        const L = Math.max(3, (distanceFromProx(reading) / SENSE_RANGE_MM) * range);
        const [cx, cy] = spot(s);
        return (
          <g key={s.id} transform={`translate(${cx} ${cy}) rotate(${-s.angle})`} className="cone" style={{ color: sensorColor(s.id) }}>
            <path d={`M0,0 L${-L * SIN},${-L * COS} A${L},${L} 0 0 1 ${L * SIN},${-L * COS} Z`} className="wedge" style={{ fillOpacity: 0.11 + 0.3 * v }} />
            <path d={`M${-L * SIN},${-L * COS} A${L},${L} 0 0 1 ${L * SIN},${-L * COS}`} className="far" style={{ strokeOpacity: 0.28 + 0.7 * v }} />
          </g>
        );
      })}
      <RobotBody />
      {SENSORS.map((s) => {
        const reading = prox[s.id] || 0;
        const v = Math.max(0, Math.min(1, reading / PROX_MAX));
        const over = reading > COLLISION && s.id < 5;
        const [cx, cy] = spot(s);
        return (
          <g key={s.id} transform={`translate(${cx} ${cy})`}>
            <circle r="6.6" className={`sensor ${over ? 'over' : ''}`} style={{ fill: sensorColor(s.id), fillOpacity: 0.3 + 0.7 * v, stroke: sensorColor(s.id) }} />
            {hit?.[s.id] && <circle r="10" className="hit-ring" />}
            {labels && <text className="sensor-n" y="0.5" textAnchor="middle" dominantBaseline="middle" style={s.id === 3 ? { fill: '#0b0b0b' } : undefined}>{s.id + 1}</text>}
          </g>
        );
      })}
      {motors && (
        <>
          <WheelArrow x={-(WHEEL.x + WHEEL.w / 2 + 6)} v={motors[0]} />
          <WheelArrow x={WHEEL.x + WHEEL.w / 2 + 6} v={motors[1]} />
        </>
      )}
    </svg>
  );
}

// An arrow from the wheel, forwards (up) or backwards (down), as long as the wheel is fast.
function WheelArrow({ x, v }) {
  if (!v) return null;
  const up = v > 0;
  const h = Math.min(34, 7 + Math.abs(v) / 7);
  const y0 = WHEEL.y;
  const y1 = up ? y0 - h : y0 + h;
  const k = up ? 5 : -5;
  return <path className="wheel-arrow" d={`M${x},${y0} L${x},${y1} M${x - 4},${y1 + k} L${x},${y1} L${x + 4},${y1 + k}`} />;
}
