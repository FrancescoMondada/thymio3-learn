// The configuration of the page as a short text, for a QR code, and back. A teacher shows the code, the students scan it and
// end up with the same settings and the same weights: the language, the learning step, the speed of each wheel with nothing in
// front, the forgetting delay and the 14 weights of the network.
//
//   T3L1;l=fr;s=30;b=670,670;f=16;w=0,0,0,0,0,0,0,0,0,0,0,0,0,0
//
// The first word names the format and its version (the cards application writes T3C1: its codes are not ours). A field is
// `letter=value`; the order does not matter, a field that is missing leaves that part of the page as it is, and a field that is
// not valid is dropped: what comes from a scan is data, read strictly, never run. The numbers are the ones of the protocol with
// the robot: tenths for the step, the speeds and the weights (30 = 3, 670 = 67, -45 = -4.5), whole seconds for the forgetting.
// The first 7 weights go to the left wheel, the other 7 to the right one, sensor by sensor.
import { LANGS } from './i18n.js';
import { RANGES, W_LIMIT } from './spec.js';

export const PREFIX = 'T3L1';
export const APP_URL = 'https://francescomondada.github.io/thymio3-learn/';
export const MAX_TEXT = 400;                                   // a longer text is not ours (ours is about 120 characters at most)

const STEP_MAX = RANGES.step.max * 10;
const BASE_MAX = RANGES.base.max * 10;
const FORGET_MAX = RANGES.forget.max;
const WEIGHT_MAX = W_LIMIT * 10;

const INT = /^-?\d{1,4}$/;
const int = (s) => (INT.test(s) ? Number(s) : NaN);
const within = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const tenths = (v, lo, hi) => clamp(Math.round((Number(v) || 0) * 10), lo, hi);
const isSeven = (a) => Array.isArray(a) && a.length === 7;

// What the page holds -> the text. `c`: { lang, step, baseLeft, baseRight, forget, weights: { left: [7], right: [7] } }; a part that is
// missing is left out of the code.
export function encodeConfig(c) {
  const out = [PREFIX];
  if (LANGS.some((l) => l.id === c.lang)) out.push(`l=${c.lang}`);
  if (c.step != null) out.push(`s=${tenths(c.step, 0, STEP_MAX)}`);
  if (c.baseLeft != null && c.baseRight != null) out.push(`b=${tenths(c.baseLeft, 0, BASE_MAX)},${tenths(c.baseRight, 0, BASE_MAX)}`);
  if (c.forget != null) out.push(`f=${clamp(Math.round(Number(c.forget) || 0), 0, FORGET_MAX)}`);
  const w = c.weights;
  if (w && isSeven(w.left) && isSeven(w.right)) out.push(`w=${[...w.left, ...w.right].map((v) => tenths(v, -WEIGHT_MAX, WEIGHT_MAX)).join(',')}`);
  return out.join(';');
}

// The text of a code -> what it holds, field by field (only the valid ones, in the page's units), or null when it is not one of ours.
export function decodeConfig(text) {
  if (typeof text !== 'string' || text.length > MAX_TEXT) return null;
  const [head, ...fields] = text.trim().split(';');
  if (head !== PREFIX) return null;
  const out = {};
  for (const field of fields) {
    const i = field.indexOf('=');
    if (i < 1) continue;
    const key = field.slice(0, i), v = field.slice(i + 1);
    switch (key) {
      case 'l': if (LANGS.some((l) => l.id === v)) out.lang = v; break;
      case 's': { const n = int(v); if (within(n, 0, STEP_MAX)) out.step = n / 10; break; }
      case 'b': {
        const [l, r, ...rest] = v.split(',').map(int);
        if (!rest.length && within(l, 0, BASE_MAX) && within(r, 0, BASE_MAX)) { out.baseLeft = l / 10; out.baseRight = r / 10; }
        break;
      }
      case 'f': { const n = int(v); if (within(n, 0, FORGET_MAX)) out.forget = n; break; }
      case 'w': {
        const n = v.split(',').map(int);
        if (n.length === 14 && n.every((x) => within(x, -WEIGHT_MAX, WEIGHT_MAX))) out.weights = { left: n.slice(0, 7).map((x) => x / 10), right: n.slice(7).map((x) => x / 10) };
        break;
      }
      default: break;                                 // a field of a later version: ignored
    }
  }
  return Object.keys(out).length ? out : null;
}

// What to ask of the robot (or the virtual one) for a decoded configuration: the same change as the sliders and the chips make.
export function configChange(cfg) {
  const change = {};
  for (const k of ['step', 'baseLeft', 'baseRight', 'forget']) if (cfg[k] != null) change[k] = cfg[k];
  if (cfg.weights) {
    change.left = Object.fromEntries(cfg.weights.left.map((v, i) => [i, v]));
    change.right = Object.fromEntries(cfg.weights.right.map((v, i) => [i, v]));
  }
  return change;
}
