import { VirtualRobot } from './virtual-robot.js';
import { parseRobotLine, encodeMessage, itemsFor } from '../protocol.js';
import { TICK_MS } from './ann-mode.js';
import { DEFAULT_STEP, DEFAULT_FORGET } from '../spec.js';

// The virtual robot as the interface sees it: the same events as the real one (see robot/robot-backend-core.js), the same
// messages to change the weights and the settings. The interface calls advance() with the real time that has passed;
// `speed` of the simulation says how much robot time a real second is worth.
export class SimBackend {
  constructor(emit, { robot = new VirtualRobot(), speed = 1 } = {}) {
    this.emit = emit;
    this.robot = robot;
    this.speed = speed;
    this.acc = 0;
    this.msg = 0;
    this.kind = 'virtual';
  }

  get connected() { return this.robot.running; }

  // The mode starts with these weights and settings (defaults: the firmware's).
  start(init = {}) {
    const out = this.robot.start({
      step10: Math.round((init.step ?? DEFAULT_STEP) * 10),
      base10: init.baseLeft != null ? Math.round(init.baseLeft * 10) : 667,
      base10r: init.baseRight != null ? Math.round(init.baseRight * 10) : null,
      forgetS: init.forget ?? DEFAULT_FORGET,
      weights: init.weights ? [...init.weights.left, ...init.weights.right].map((w) => Math.round(w * 10)) : '',
    });
    this.emitLines(out.lines);
  }

  stop() {
    if (!this.robot.running) return;
    this.robot.stop();
    this.emit({ type: 'bye', t: this.robot.clock });
  }

  emitLines(lines) {
    for (const line of lines) {
      const ev = parseRobotLine(line);
      if (ev) this.emit({ ...ev, t: this.robot.clock });
    }
  }

  // The messages to the mode go through the frames, as with the real robot (one frame at each tick).
  apply(change) {
    for (const items of itemsFor(change)) {
      this.msg = (this.msg % 15) + 1;
      this.robot.pushFrames(encodeMessage(items, this.msg));
    }
    return Promise.resolve();
  }

  advance(realMs) {
    if (!this.robot.running) return;
    this.acc = Math.min(this.acc + realMs * this.speed, 1000);
    while (this.acc >= TICK_MS && this.robot.running) {
      this.acc -= TICK_MS;
      const out = this.robot.tick();
      if (out) this.emitLines(out.lines);
      if (this.robot.mode?.quit) { this.stop(); break; }
    }
  }
}
