import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export const MINUS = '−';
const clean = (v) => (Object.is(v, -0) ? 0 : v);

// A weight or a speed for the screen: one decimal at most, a real minus sign.
export function num(v, digits = 1) {
  const x = clean(Number(v) || 0);
  const s = Math.abs(x).toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  return (x < 0 && s !== '0' ? MINUS : '') + s;
}
export const signed = (v, digits = 1) => (v > 0 ? '+' : '') + num(v, digits);

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Sensor i has the colour of the i-th categorical slot (CSS variables --s1..--s8, see styles.css).
export const sensorColor = (i) => `var(--s${i + 1})`;

// The size of an element, kept up to date.
export function useSize(initial = { width: 600, height: 300 }) {
  const ref = useRef(null);
  const [size, setSize] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.width - r.width) < 0.5 && Math.abs(s.height - r.height) < 0.5 ? s : { width: r.width, height: r.height }));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

// A value that stays what the person set while they are changing it, and goes back to the robot's after `holdMs` of quiet.
export function useHeld(value, holdMs = 700) {
  const [held, setHeld] = useState(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hold = (v) => {
    setHeld({ v });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHeld(null), holdMs);
  };
  return [held ? held.v : value, hold];
}

// Whether a media query matches, kept up to date.
export function useMedia(query) {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const change = () => setOn(mq.matches);
    change();
    mq.addEventListener?.('change', change);
    return () => mq.removeEventListener?.('change', change);
  }, [query]);
  return on;
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

// A bezier of the network: from (x0, y0) to (x1, y1), leaving along the main axis and arriving along it too, or, with `dir`
// (a unit vector, the way back along the curve at its end), arriving from that side.
export function curve([x0, y0], [x1, y1], vertical, dir = vertical ? [0, -1] : [-1, 0]) {
  const m = vertical ? (y1 - y0) * 0.5 : (x1 - x0) * 0.5;
  const c1 = vertical ? [x0, y0 + m] : [x0 + m, y0];
  const c2 = [x1 + dir[0] * m, y1 + dir[1] * m];
  return { d: `M${x0},${y0} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${x1},${y1}`, c: [[x0, y0], c1, c2, [x1, y1]] };
}

// A point of that bezier.
export function bezierAt(c, t) {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [0, 1].map((k) => w[0] * c[0][k] + w[1] * c[1][k] + w[2] * c[2][k] + w[3] * c[3][k]);
}

// The end of a connection, cut short for an arrow: the tip stops `gap` px before the end of the bezier (the wheel's edge),
// the line stops `head` px before the tip, where the arrow head starts. Returns the tip, the base of the head and the line.
export function arrowEnds(c, gap, head) {
  const N = 60;
  const pts = Array.from({ length: N + 1 }, (_, k) => bezierAt(c, k / N));
  const len = [0];
  for (let k = 1; k <= N; k++) len.push(len[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const tAt = (dist) => {
    const target = Math.max(0, len[N] - dist);
    let k = 1;
    while (k < N && len[k] < target) k++;
    return (k - 1 + (target - len[k - 1]) / (len[k] - len[k - 1] || 1)) / N;
  };
  const tTip = tAt(gap);
  const tBase = tAt(gap + head);
  // de Casteljau: the part of the bezier up to tBase
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const [p0, p1, p2, p3] = c;
  const q0 = lerp(p0, p1, tBase);
  const q1 = lerp(p1, p2, tBase);
  const q2 = lerp(p2, p3, tBase);
  const r0 = lerp(q0, q1, tBase);
  const r1 = lerp(q1, q2, tBase);
  const s0 = lerp(r0, r1, tBase);
  const line = `M${p0[0]},${p0[1]} C${q0[0]},${q0[1]} ${r0[0]},${r0[1]} ${s0[0]},${s0[1]}`;
  const tip = bezierAt(c, tTip);
  const base = bezierAt(c, tBase);
  return { tip, base, line, angle: (Math.atan2(tip[1] - base[1], tip[0] - base[0]) * 180) / Math.PI };
}
