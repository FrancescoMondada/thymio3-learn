// The virtual Thymio: the arena (sim/arena.js) with the JavaScript twin of the mode in it (sim/ann-mode.js).
// One tick() is 20 ms of the robot's life: the wheels move the body, the sensors read the world, the mode decides.
import { Arena } from './arena.js';
import { AnnMode, TICK_MS } from './ann-mode.js';

export class VirtualRobot {
  constructor(options = {}) {
    this.arena = options.arena || new Arena(options);
    this.mode = null;
    this.queue = [];                  // frames that the interface wrote, one is read at each tick
    this.buttons = [0, 0, 0, 0, 0];
    this.speed = [0, 0];              // what the wheels are told
    this.prox = new Array(7).fill(0);
    this.clock = 0;                   // ms of virtual time
    this.body = [0, 0, 0];
  }

  // Start the mode: returns what it says at once. `init`: { step10, base10, base10r, forgetS, weights } as for AnnMode.
  start(init = {}) {
    this.mode = new AnnMode(init);
    this.speed = [0, 0];
    this.queue = [];
    const out = this.mode.start();
    this.body = out.body;
    return out;
  }

  stop() {
    this.mode = null;
    this.speed = [0, 0];
    this.queue = [];
  }

  get running() { return !!this.mode; }

  pushFrames(frames) { this.queue.push(...frames); }

  // The Bluetooth command of the interface also sets the wheels, to the speeds in it; the mode sets them again at its next tick.
  poke(left, right) { this.speed = [left, right]; }

  tick() {
    this.arena.step(this.speed[0], this.speed[1], TICK_MS);
    this.prox = this.arena.sense();
    this.clock += TICK_MS;
    if (!this.mode) return null;
    const frame = this.queue.length ? this.queue.shift() : null;
    const out = this.mode.tick({ prox: this.prox, buttons: this.buttons, frame });
    this.speed = out.speed;
    this.body = out.body;
    return out;
  }
}
