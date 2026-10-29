// Small helpers for the charts (src/components/WeightChart.jsx, Activity.jsx): scales, paths, readings at a time.
import { MINUS } from '../util.js';

// The next "round" bound above v: 6, 10, 15, 20, 30, 50, 100, ...
export function niceMax(v, floor = 6) {
  const steps = [6, 10, 15, 20, 30, 50, 100, 200, 400];
  const target = Math.max(v, floor);
  return steps.find((s) => s >= target) || Math.ceil(target / 100) * 100;
}

// The last point at or before t (points sorted by t): its index, or -1.
export function indexAt(points, t) {
  let lo = 0;
  let hi = points.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

// The nearest point to t.
export function nearest(points, t) {
  const i = indexAt(points, t);
  if (i < 0) return points.length ? 0 : -1;
  if (i + 1 < points.length && points[i + 1].t - t < t - points[i].t) return i + 1;
  return i;
}

// "−30 s", "−2 min" for a time before now, in ms.
export function ago(ms) {
  const s = Math.round(Math.abs(ms) / 1000);
  if (s === 0) return '0';
  if (s < 90) return `${MINUS}${s} s`;
  const m = s / 60;
  return `${MINUS}${Number.isInteger(m) ? m : m.toFixed(1)} min`;
}

export const line = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');

// A value that changes at some instants (a weight): drawn as steps, from x0 to x1.
export function stepLine(points, valueOf, x, y, t0, t1) {
  if (!points.length) return '';
  const first = indexAt(points, t0);
  const out = [];
  let v = valueOf(points[Math.max(0, first)]);
  out.push([x(t0), y(v)]);
  for (let k = first + 1; k < points.length; k++) {
    const p = points[k];
    if (p.t > t1) break;
    if (p.t < t0) continue;
    out.push([x(p.t), y(v)]);
    v = valueOf(p);
    out.push([x(p.t), y(v)]);
  }
  out.push([x(t1), y(v)]);
  return line(out);
}

// Round instants for the time axis of a window that ends now: [{ t, label }] from the oldest to "now" (label '').
const STEPS_S = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800];
export function timeTicks(from, now, maxTicks = 5) {
  const span = (now - from) / 1000;
  const step = STEPS_S.find((s) => span / s <= maxTicks) || STEPS_S[STEPS_S.length - 1];
  const out = [];
  for (let k = Math.floor(span / step); k >= 1; k--) out.push({ t: now - k * step * 1000, label: ago(-k * step * 1000) });
  out.push({ t: now, label: '' });
  return out;
}
