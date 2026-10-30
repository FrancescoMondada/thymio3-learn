// The JavaScript twin of src/py/ann_mode.py: the same states, the same arithmetic, the same lines on stdout, one
// call of tick() for each 20 ms tick of the robot. It runs the virtual robot of the interface, and tests/ann.test.js
// feeds it the inputs of a scenario that the Python mode has run (tests/golden-ann.json) and compares tick by tick.
import { FrameReceiver, isFrame, CMD } from '../protocol.js';

export const TICK_MS = 20;
const NET_TICKS = 5;
const COLLISION = 3300;
const SENSOR_SCALE = 20;
const MOTOR_SCALE = 30;
const BIAS = 2000;
// the bias weight that gives a wheel this speed (in tenths) with nothing in front: speed * 30
const biasOf = (base10) => (base10 === 667 ? BIAS : base10 * 3);
const BACK_SPEED = -200;
const BACK_MS = 1000;
const LEARN_MS = 300;
const W_LIMIT = 100;
const MAX_SPEED = 500;
const MAXB = 16;
const SND_COLLISION = 50;
const SND_LEARN = 3;
const HEARTBEAT_TICKS = 150;

export const ST = { DRIVE: 0, BACK: 1, LEARN: 2, FREEZE: 4, PAUSE: 5 };
const NAMES = { 0: 'drive', 1: 'back', 2: 'learn', 4: 'freeze', 5: 'pause' };

const clampW = (v) => (v > W_LIMIT ? W_LIMIT : v < -W_LIMIT ? -W_LIMIT : v);
const tenths = (v) => (v >= 0 ? Math.trunc(v * 10 + 0.5) : -Math.trunc(-v * 10 + 0.5));
const led16 = (v) => Math.min(16, Math.trunc(v));

class Edge {
  constructor() { this.prev = 0; }
  call(cond) { const c = cond ? 1 : 0; const r = c && !this.prev; this.prev = c; return r; }
}

export class AnnMode {
  // step10: the learning step in tenths, base10: the speed with nothing in front, in tenths (667 = the firmware's
  // 2000 / 30; the left wheel's, and the right wheel's too unless base10r is given), forgetS: seconds between two
  // forgettings (0: never), weights: the 14 weights in tenths, as the string "l0,...,l6,r0,...,r6" or an array, or ''.
  constructor({ step10 = 30, base10 = 667, forgetS = 16, weights = '', base10r = null } = {}) {
    this.lr = step10 / 10;
    this.forgetMs = forgetS * 1000;
    this.wl = new Array(8).fill(0);
    this.wr = new Array(8).fill(0);
    this.wl[7] = biasOf(base10);
    this.wr[7] = biasOf(base10r ?? base10);
    const v = Array.isArray(weights) ? weights : String(weights || '').split(',').filter((s) => s !== '');
    if (v.length > 13) {
      for (let i = 0; i < 7; i++) {
        this.wl[i] = clampW(Number(v[i]) / 10);
        this.wr[i] = clampW(Number(v[i + 7]) / 10);
      }
    }
    this.state = ST.DRIVE;
    this.prevState = ST.DRIVE;
    this.timer = 0;
    this.forgetTimer = 0;
    this.learnt = 0;
    this.collision = new Array(7).fill(0);
    this.ml = 0;
    this.mr = 0;
    this.ticks = 0;
    this.quit = false;
    this.pulse = 0;
    this.dirty = true;
    this.beat = 0;
    this.p = new Array(7).fill(0);
    this.rx = new FrameReceiver();
    this.eBack = new Edge();
    this.eFwd = new Edge();
    this.eSide = new Edge();
    this.eCenter = new Edge();
    this.lines = [];                // what the mode said during the current call
    this.sounds = [];
    this.body = [0, 0, 0];          // the colour of the body LEDs (0..16)
    this.circle = new Array(8).fill(0);
    this.started = false;
  }

  say(...parts) { this.lines.push(`@@${parts.join(' ')}`); }

  // ---- the network ----------------------------------------------------------------------------
  compute() {
    let l = 0;
    let r = 0;
    for (let i = 0; i < 7; i++) {
      const x = this.p[i] / SENSOR_SCALE;
      l += x * this.wl[i];
      r += x * this.wr[i];
    }
    l += this.wl[7];
    r += this.wr[7];
    l /= MOTOR_SCALE;
    r /= MOTOR_SCALE;
    this.ml = l > MAX_SPEED ? MAX_SPEED : l < -MAX_SPEED ? -MAX_SPEED : Math.trunc(l);
    this.mr = r > MAX_SPEED ? MAX_SPEED : r < -MAX_SPEED ? -MAX_SPEED : Math.trunc(r);
  }

  stop() { this.ml = 0; this.mr = 0; }

  // ---- reports --------------------------------------------------------------------------------
  reportWeights() { this.say('w', ...this.wl.slice(0, 7).map(tenths), ...this.wr.slice(0, 7).map(tenths)); }
  reportParams() { this.say('p', tenths(this.lr), tenths(this.wl[7] / MOTOR_SCALE), tenths(this.wr[7] / MOTOR_SCALE), Math.floor(this.forgetMs / 1000)); }
  reportAll() { this.reportWeights(); this.reportParams(); this.beat = 0; }

  setState(state) {
    if (state !== this.state) {
      this.state = state;
      this.say('state', NAMES[state]);
    }
  }

  // ---- learning (the end of state 1) ---------------------------------------------------------------
  learn() {
    if (this.learnt < 16) this.learnt += 1;
    const lr = this.lr;
    const half = lr / 2;
    for (let i = 0; i < 7; i++) {
      if (this.collision[i] >= 1) {
        if (i <= 1) {
          this.wl[i] = clampW(this.wl[i] + lr);
          this.wr[i] = clampW(this.wr[i] - lr);
        } else if (i === 3 || i === 4) {
          this.wr[i] = clampW(this.wr[i] + lr);
          this.wl[i] = clampW(this.wl[i] - lr);
        } else if (i === 2) {
          if (this.collision[i] === 1) this.wr[i] = clampW(this.wr[i] - half);
          else this.wl[i] = clampW(this.wl[i] - half);
        }
      }
    }
    this.collision = new Array(7).fill(0);
    this.dirty = true;
    this.say('learn', this.learnt);
    this.reportWeights();
  }

  forget() {
    for (const w of [this.wl, this.wr]) {
      for (let i = 0; i < 7; i++) {
        if (w[i] > 0) w[i] = w[i] > 1 ? w[i] - 1 : 0;
        else if (w[i] < 0) w[i] = w[i] < -1 ? w[i] + 1 : 0;
      }
    }
    if (this.learnt > 0) this.learnt -= 1;
    this.dirty = true;
    this.say('forget', this.learnt);
    this.reportWeights();
  }

  reset() {
    for (let i = 0; i < 7; i++) { this.wl[i] = 0; this.wr[i] = 0; }
    this.learnt = 0;
    this.forgetTimer = 0;
    this.collision = new Array(7).fill(0);
    this.dirty = true;
    this.reportWeights();
  }

  // ---- the interface's messages --------------------------------------------------------------------
  command(code) {
    if (code === CMD.RESET) this.reset();
    else if (code === CMD.PAUSE) this.pause();
    else if (code === CMD.RESUME) this.resume();
    else if (code === CMD.FREEZE) {
      if (this.state !== ST.PAUSE) { this.collision = new Array(7).fill(0); this.setState(ST.FREEZE); }
      this.prevState = ST.FREEZE;
    } else if (code === CMD.LEARN) {
      if (this.state !== ST.PAUSE) { this.collision = new Array(7).fill(0); this.setState(ST.DRIVE); }
      this.prevState = ST.DRIVE;
    } else if (code === CMD.QUIT) {
      this.say('exit');
      this.quit = true;
    }
  }

  item(key, v) {
    if (key < 7) this.wl[key] = clampW(v / 10);
    else if (key < 14) this.wr[key - 7] = clampW(v / 10);
    else if (key === 14) this.wl[7] = biasOf(v > 0 ? v : 0);
    else if (key === 15) this.wr[7] = biasOf(v > 0 ? v : 0);
    else if (key === 16) this.lr = (v > 0 ? v : 0) / 10;
    else if (key === 18) {
      this.forgetMs = (v > 0 ? v : 0) * 1000;
      this.forgetTimer = 0;
    } else if (key === 19) this.command(v);
    this.dirty = true;
  }

  rxPoll(frame) {
    if (!isFrame(frame)) return;
    this.dirty = true;              // the frame has set the circle and the Lego LEDs too: they are drawn again
    const got = this.rx.push(frame);
    if (!got) return;
    for (const [key, v] of got.items) this.item(key, v);
    this.say('ack', got.msg);
    this.reportAll();
  }

  // ---- buttons and states ----------------------------------------------------------------------
  pause() {
    if (this.state !== ST.PAUSE) {
      this.prevState = this.state;
      this.setState(ST.PAUSE);
      this.stop();
    }
  }

  resume() {
    if (this.state === ST.PAUSE) {
      this.collision = new Array(7).fill(0);
      this.timer = 0;
      this.setState(this.prevState === ST.FREEZE ? ST.FREEZE : ST.DRIVE);
    }
  }

  toggleFreeze() {
    const frozen = this.state === ST.FREEZE || (this.state === ST.PAUSE && this.prevState === ST.FREEZE);
    this.command(frozen ? CMD.LEARN : CMD.FREEZE);
    this.resume();
  }

  // ---- one tick of the mode (ANN_Run) ----------------------------------------------------------------
  lights() {
    const s = this.state;
    if (s === ST.DRIVE) {
      this.pulse += 1;
      let b;
      if (this.pulse > 0) {
        b = this.pulse >> 2;
        if (this.pulse >= (MAXB << 2)) this.pulse = -(MAXB << 3);
      } else {
        b = -(this.pulse >> 3);
      }
      this.body = [b, b, b];
    } else if (s === ST.BACK) this.body = [MAXB, 0, 0];
    else if (s === ST.LEARN) this.body = [0, MAXB, 0];
    else if (s === ST.FREEZE) this.body = [MAXB / 2, MAXB / 2, 0];
    else this.body = [2, 2, 6];
  }

  draw() {
    const a = Math.abs;
    const { wl, wr } = this;
    const v = [a(wr[2]) + a(wl[2]), a(wr[3]) + a(wr[4]), a(wl[3]) + a(wl[4]), a(wr[5]) + a(wl[5]),
      0, a(wr[6]) + a(wl[6]), a(wl[0]) + a(wl[1]), a(wr[0]) + a(wr[1])];
    this.circle = v.map(led16);
    this.dirty = false;
  }

  collide() {
    const p = this.p;
    let hit = false;
    for (let i = 0; i < 5; i++) if (p[i] > COLLISION) hit = true;
    if (!hit) return;
    this.sounds.push(SND_COLLISION);
    this.setState(ST.BACK);
    this.timer = 0;
    this.ml = BACK_SPEED;
    this.mr = BACK_SPEED;
    let mask = 0;
    for (let j = 0; j < 7; j++) {
      if (p[j] > COLLISION) {
        mask |= 1 << j;
        this.collision[j] = j === 2 ? (p[1] > p[3] ? 1 : 2) : 1;
      }
    }
    this.say('hit', mask);
  }

  netStep() {
    this.timer += 100;
    this.forgetTimer += 100;
    const s = this.state;
    if (s === ST.DRIVE || s === ST.FREEZE) this.compute();
    if (s === ST.BACK && this.timer >= BACK_MS) {
      this.stop();
      this.setState(ST.LEARN);
      this.timer = 0;
      this.sounds.push(SND_LEARN);
      this.learn();
    } else if (s === ST.LEARN && this.timer >= LEARN_MS) {
      this.stop();
      this.setState(ST.DRIVE);
    }
    if (this.forgetMs > 0 && this.forgetTimer >= this.forgetMs && this.state !== ST.FREEZE && this.state !== ST.PAUSE) {
      this.forgetTimer = 0;
      this.forget();
    }
    if (this.state === ST.PAUSE) {
      this.forgetTimer = 0;
      this.stop();
    }
    this.say('n', this.state, ...this.p, this.ml, this.mr, this.learnt);
  }

  // What the mode says when it starts (run() in the Python): hello, battery, state, weights, settings.
  start() {
    this.lines = [];
    this.sounds = [];
    this.lights();
    this.draw();
    this.say('hello', 1);
    this.say('bat', 4012);
    this.say('state', NAMES[this.state]);
    this.reportAll();
    this.started = true;
    return this.output();
  }

  // One tick (after start()). `prox`: the 7 readings, `buttons`: [BACKWARD, LEFT, CENTER, FORWARD, RIGHT] (0/1), `frame`: the
  // twelve values the body LEDs hold when the interface has just written them, or null.
  tick({ prox, buttons = [0, 0, 0, 0, 0], frame = null }) {
    this.lines = [];
    this.sounds = [];
    if (this.eCenter.call(buttons[2])) {
      this.say('exit');
      this.quit = true;
      return this.output();
    }
    this.rxPoll(frame);
    for (let i = 0; i < 7; i++) this.p[i] = prox[i];
    if (this.state === ST.DRIVE) this.collide();
    this.ticks += 1;
    if (this.ticks % NET_TICKS === 0) this.netStep();
    if (this.eBack.call(buttons[0])) this.pause();
    if (this.eFwd.call(buttons[3])) this.resume();
    if (this.eSide.call(buttons[1] || buttons[4])) this.toggleFreeze();
    this.beat += 1;
    if (this.beat >= HEARTBEAT_TICKS) this.reportAll();
    this.lights();
    if (this.dirty) this.draw();
    return this.output();
  }

  output() {
    return { lines: this.lines, speed: [this.ml, this.mr], sounds: this.sounds, body: this.body, circle: this.circle, learnt: this.learnt };
  }
}
