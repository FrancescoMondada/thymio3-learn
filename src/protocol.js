// The words between the interface and the mode that runs on the robot (src/py/ann_mode.py).
// Pure helpers, no import of the browser: Node can test them.
import { STATES } from './spec.js';

// ---- robot -> interface: "@@word ..." lines on stdout -------------------------------------------
// stdout arrives in BLE notifications cut anywhere: rebuild complete lines. A line ends with a newline,
// or with \x1e (record separator): the mode pads its lines to 100 bytes and ends them that way so that
// the firmware sends them at once (see say() in ann_mode.py).
export class LineAssembler {
  constructor() { this.rest = ''; }
  push(text) {
    const parts = (this.rest + text).split(/[\r\n\x1e]+/);
    this.rest = parts.pop();
    return parts.filter((l) => l.trim());           // blank lines go; the others keep their indentation (a Traceback has some)
  }
}

const ints = (a, n) => a.slice(0, n).map(Number);
const finite = (a) => a.every(Number.isFinite);

// One line of stdout -> an event, or null for anything else (print() of other scripts, noise).
//   @@n state p0..p6 left right learnt   every 100 ms
//   @@w l0..l6 r0..r6                    the weights, in tenths, when they change (and every 3 s)
//   @@p step speed forget                the settings: learning step and speed in tenths, forgetting in seconds
//   @@hit mask                           a collision: bit i = sensor i was over the threshold
//   @@learn n / @@forget n               the weights were just changed by a lesson / by forgetting; n lessons held
//   @@ack msg                            the message of the interface was applied
export function parseRobotLine(line) {
  const l = line.trim();
  // (a Traceback is several lines: the robot backend reads it as a whole)
  if (/^\w*(Error|Exception)\b/.test(l)) return { type: 'error', message: l };
  const m = /^@@(\w+)\s*(.*)$/.exec(l);
  if (!m) return null;
  const [, word, rest] = m;
  const a = rest.split(/\s+/).filter(Boolean);
  switch (word) {
    case 'hello': return { type: 'hello', version: Number(a[0]) || 1 };
    case 'bat': { const v = Number(a[0]); return { type: 'battery', volts: v > 100 ? v / 1000 : v }; }
    case 'state': return Object.values(STATES).includes(a[0]) ? { type: 'state', state: a[0] } : null;
    case 'n': {
      const v = ints(a, 11);
      if (v.length < 11 || !finite(v)) return null;
      return { type: 'n', state: STATES[v[0]] || 'drive', prox: v.slice(1, 8), motors: [v[8], v[9]], learnt: v[10] };
    }
    case 'w': {
      const v = ints(a, 14);
      if (v.length < 14 || !finite(v)) return null;
      return { type: 'w', left: v.slice(0, 7).map((x) => x / 10), right: v.slice(7, 14).map((x) => x / 10) };
    }
    case 'p': {
      const v = ints(a, 3);
      if (v.length < 3 || !finite(v)) return null;
      return { type: 'p', step: v[0] / 10, base: v[1] / 10, forget: v[2] };
    }
    case 'hit': { const mask = Number(a[0]) || 0; return { type: 'hit', mask, sensors: Array.from({ length: 7 }, (_, i) => !!(mask & (1 << i))) }; }
    case 'learn': return { type: 'learn', count: Number(a[0]) || 0 };
    case 'forget': return { type: 'forget', count: Number(a[0]) || 0 };
    case 'ack': return { type: 'ack', msg: Number(a[0]) };
    case 'exit': return { type: 'exit' };
    case 'bye': return { type: 'bye' };
    default: return null;
  }
}

// ---- interface -> robot: messages written in the four body LEDs ------------------------------------
// The firmware stores the LEDs it is given by the Bluetooth command and the mode reads them back (see
// rx_poll in ann_mode.py, which is the other end of this). A frame is twelve 4-bit values, one per colour
// channel of the four body LEDs: 0 message number, 1 always 15 (the mode never writes 15 on that channel),
// 2 last-frame flag (8) + frame number, 3..10 eight nibbles of the message, 11 checksum. The message: the
// number of items (two nibbles), then the items, five nibbles each: a key (two) and a value (three, signed
// 12 bits). At most eight frames: 12 items.
export const KEY = { LEFT: 0, RIGHT: 7, STEP: 16, SPEED: 17, FORGET: 18, COMMAND: 19 };
export const CMD = { RESET: 1, PAUSE: 2, RESUME: 3, FREEZE: 4, LEARN: 5, QUIT: 6, REPORT: 7 };
export const LIVE_MARK = 15;
export const MAX_FRAMES = 8;
export const MAX_ITEMS = 12;

export const frameSum = (n) => { let t = 5; for (let i = 0; i < 11; i++) t += (i + 1) * n[i]; return t & 15; };
export const isFrame = (n) => !!n && n.length === 12 && n[1] === LIVE_MARK && frameSum(n) === n[11];

// The items that say a weight, a setting or a command. A weight is in the firmware's unit, sent in tenths.
export const weightItem = (side, sensor, w) => [(side === 'right' ? KEY.RIGHT : KEY.LEFT) + sensor, Math.max(-1000, Math.min(1000, Math.round(w * 10)))];
export const stepItem = (step) => [KEY.STEP, Math.max(0, Math.min(200, Math.round(step * 10)))];
export const speedItem = (base) => [KEY.SPEED, Math.max(0, Math.min(500, Math.round(base)))];
export const forgetItem = (seconds) => [KEY.FORGET, Math.max(0, Math.min(2000, Math.round(seconds)))];
export const commandItem = (code) => [KEY.COMMAND, code];

// The frames (1 to 8) that carry these [key, value] items, or null when they do not fit.
export function encodeMessage(items, msg = 1) {
  if (items.length > MAX_ITEMS) return null;
  const stream = [items.length >> 4, items.length & 15];
  for (const [key, value] of items) {
    const v = value & 0xfff;
    stream.push(key >> 4, key & 15, (v >> 8) & 15, (v >> 4) & 15, v & 15);
  }
  const count = Math.max(1, Math.ceil(stream.length / 8));
  if (count > MAX_FRAMES) return null;
  const frames = [];
  for (let i = 0; i < count; i++) {
    const data = stream.slice(i * 8, i * 8 + 8);
    while (data.length < 8) data.push(0);
    const frame = [msg & 15, LIVE_MARK, (i === count - 1 ? 8 : 0) | i, ...data, 0];
    frame[11] = frameSum(frame);
    frames.push(frame);
  }
  return frames;
}

// What the mode does with the frames it reads: the same as rx_poll. Returns { msg, items } when a message
// is complete, null otherwise (an incomplete message, a frame that is not one).
export class FrameReceiver {
  constructor() { this.msg = -1; this.got = new Map(); this.last = -1; }

  push(n) {
    if (n.length !== 12 || n[1] !== LIVE_MARK || frameSum(n) !== n[11]) return null;
    if (n[0] !== this.msg) { this.msg = n[0]; this.got = new Map(); this.last = -1; }
    this.got.set(n[2] & 7, n.slice(3, 11));
    if (n[2] & 8) this.last = n[2] & 7;
    if (this.last < 0) return null;
    let stream = [];
    for (let i = 0; i <= this.last; i++) {
      if (!this.got.has(i)) return null;
      stream = stream.concat(this.got.get(i));
    }
    this.got = new Map();
    this.last = -1;
    const count = stream[0] * 16 + stream[1];
    if (stream.length < 2 + 5 * count) return null;
    const items = [];
    for (let k = 0, pos = 2; k < count; k++, pos += 5) {
      let v = (stream[pos + 2] << 8) | (stream[pos + 3] << 4) | stream[pos + 4];
      if (v >= 2048) v -= 4096;
      items.push([stream[pos] * 16 + stream[pos + 1], v]);
    }
    return { msg: this.msg, items };
  }
}

// A frame as the Bluetooth command of the API wants it (thymio.setActuatorState). What the command also
// carries is set to what the mode shows anyway, or to nothing: the mode puts its own lights back at its
// next tick (20 ms). The motors are the exception: the firmware sets them to what the command says, so they
// are given the speeds the robot has just been told by the mode ("@@n"), and the mode gives them again at
// its next tick anyway.
const nib = (v) => Math.max(0, Math.min(15, Math.round(v)));
export const liveActuator = (frame, { circle = new Array(8).fill(0), lego = 0, motors = [0, 0] } = {}) => ({
  circleLEDs: circle.map(nib),
  frontLegoLEDs: Array.from({ length: 8 }, (_, i) => (i >= 8 - Math.min(lego, 8) ? 15 : 0)),
  rearLegoLEDs: Array.from({ length: 8 }, (_, i) => (i >= 16 - Math.min(lego, 16) ? 15 : 0)),
  flRGB: { r: frame[0], g: frame[1], b: frame[2] },
  frRGB: { r: frame[3], g: frame[4], b: frame[5] },
  blRGB: { r: frame[6], g: frame[7], b: frame[8] },
  brRGB: { r: frame[9], g: frame[10], b: frame[11] },
  motorLeft: Math.round(motors[0]) || 0, motorRight: Math.round(motors[1]) || 0, sound: 0,
  smallBottomRGB: { r: 0, g: 0, b: 0 }, smallBackRGB: { r: 0, g: 0, b: 0 },
  buttonLEDs: [0, 0, 0, 0], receiverLED: 0, microphoneLED: false,
});
export const liveNibbles = (a) => [a.flRGB, a.frRGB, a.blRGB, a.brRGB].flatMap((c) => [c.r, c.g, c.b]);

// What the interface asks for, as the items of one or more messages. `change` is any of
// { left: {i: w}, right: {i: w}, step, base, forget, command }; the weights come before the command, which
// applies to the state the mode is in once they are set. Returns arrays of at most MAX_ITEMS items.
export function itemsFor(change) {
  const items = [];
  for (const side of ['left', 'right']) {
    for (const [i, w] of Object.entries(change[side] || {})) items.push(weightItem(side, Number(i), w));
  }
  if (change.step != null) items.push(stepItem(change.step));
  if (change.base != null) items.push(speedItem(change.base));
  if (change.forget != null) items.push(forgetItem(change.forget));
  if (change.command != null) items.push(commandItem(change.command));
  const out = [];
  for (let i = 0; i < items.length; i += MAX_ITEMS) out.push(items.slice(i, i + MAX_ITEMS));
  return out;
}
