import React from 'react';
import { SENSORS, PROX_MAX, COLLISION } from '../spec.js';
import { sensorColor } from '../util.js';

// The robot seen from above, front at the top, with its seven proximity sensors numbered and lit by what they read.
// Same numbers and colours as the neurons of the network and the lines of the charts.
const BODY = 'M-50,-40 Q-50,-54 -36,-54 L36,-54 Q50,-54 50,-40 L50,34 Q50,54 28,54 L-28,54 Q-50,54 -50,34 Z';

export default function RobotTop({ prox = [], hit = null, motors = null, size = 150, labels = true, className = '', title, ...place }) {
  return (
    <svg className={`robot-top ${className}`} viewBox="-72 -74 144 144" width={size} height={size} role="img" aria-label={title || 'Thymio'} {...place}>
      <rect x="-57" y="-14" width="8" height="30" rx="3" className="wheel" />
      <rect x="49" y="-14" width="8" height="30" rx="3" className="wheel" />
      <path d={BODY} className="body" />
      <path d="M-30,52 Q0,66 30,52" className="back-line" />
      {SENSORS.map((s) => {
        const v = Math.max(0, Math.min(1, (prox[s.id] || 0) / PROX_MAX));
        const over = (prox[s.id] || 0) > COLLISION && s.id < 5;
        const cx = s.x;
        const cy = -s.y;
        const rot = -s.angle;
        return (
          <g key={s.id} transform={`translate(${cx} ${cy})`}>
            {v > 0.02 && (
              <path d={`M0,0 L${-9 - 4 * v},${-12 - 26 * v} Q0,${-16 - 30 * v} ${9 + 4 * v},${-12 - 26 * v} Z`}
                transform={`rotate(${rot})`} style={{ fill: sensorColor(s.id), opacity: 0.18 + 0.6 * v }} className="beam" />
            )}
            <circle r="7.5" className={`sensor ${over ? 'over' : ''}`} style={{ fill: sensorColor(s.id), fillOpacity: 0.28 + 0.72 * v, stroke: sensorColor(s.id) }} />
            {hit?.[s.id] && <circle r="11" className="hit-ring" />}
            {labels && <text className="sensor-n" y="0.5" textAnchor="middle" dominantBaseline="middle" style={s.id === 3 ? { fill: '#0b0b0b' } : undefined}>{s.id + 1}</text>}
          </g>
        );
      })}
      {motors && (
        <>
          <WheelArrow x={-53} v={motors[0]} />
          <WheelArrow x={53} v={motors[1]} />
        </>
      )}
    </svg>
  );
}

function WheelArrow({ x, v }) {
  if (!v) return null;
  const up = v > 0;
  const h = Math.min(26, 6 + Math.abs(v) / 8);
  const y0 = 1;
  const y1 = up ? y0 - h : y0 + h;
  return <path className="wheel-arrow" d={`M${x},${y0} L${x},${y1} M${x - 4},${y1 + (up ? 5 : -5)} L${x},${y1} L${x + 4},${y1 + (up ? 5 : -5)}`} />;
}
