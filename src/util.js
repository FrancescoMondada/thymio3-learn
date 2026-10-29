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

// A bezier of the network: from (x0, y0) to (x1, y1), leaving and arriving along the main axis.
export function curve([x0, y0], [x1, y1], vertical) {
  if (vertical) {
    const m = (y1 - y0) * 0.5;
    return { d: `M${x0},${y0} C${x0},${y0 + m} ${x1},${y1 - m} ${x1},${y1}`, c: [[x0, y0], [x0, y0 + m], [x1, y1 - m], [x1, y1]] };
  }
  const m = (x1 - x0) * 0.5;
  return { d: `M${x0},${y0} C${x0 + m},${y0} ${x1 - m},${y1} ${x1},${y1}`, c: [[x0, y0], [x0 + m, y0], [x1 - m, y1], [x1, y1]] };
}

// A point of that bezier.
export function bezierAt(c, t) {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [0, 1].map((k) => w[0] * c[0][k] + w[1] * c[1][k] + w[2] * c[2][k] + w[3] * c[3][k]);
}
