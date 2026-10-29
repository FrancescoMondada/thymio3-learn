// The JavaScript twin of the mode (src/sim/ann-mode.js) against the Python mode: tests/golden-ann.json holds
// the inputs of two scenarios of 60 s (proximity readings, buttons, messages of the interface) and what
// src/py/ann_mode.py did with them on a virtual robot (python3 -I tests/test_ann_mode.py --golden tests/golden-ann.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AnnMode } from '../src/sim/ann-mode.js';
import { encodeMessage } from '../src/protocol.js';

const golden = JSON.parse(readFileSync(new URL('./golden-ann.json', import.meta.url), 'utf8'));

for (const sc of golden.scenarios) {
  test(`the JavaScript mode does what the Python mode did (scenario ${sc.seed})`, () => {
    const mode = new AnnMode();
    const buttons = new Map(sc.buttons.map(([t, b]) => [t, b]));
    const frames = new Map(sc.frames);
    const lines = [];
    const speeds = [];
    const sounds = [];
    const add = (tick, out) => {
      for (const l of out.lines) lines.push([tick, l]);
      for (const s of out.sounds) sounds.push([tick, s]);
    };
    add(0, mode.start());
    for (let t = 0; t < sc.ticks; t++) {
      const b = [0, 0, 0, 0, 0];
      if (buttons.has(t)) b[buttons.get(t)] = 1;
      const out = mode.tick({ prox: sc.prox[t], buttons: b, frame: frames.get(t) || null });
      add(t, out);
      speeds.push([t, out.speed[0], out.speed[1]]);
      if (mode.quit) break;
    }
    // (the Python lines of the cleanup, "@@bye", come after the last tick)
    const want = sc.lines.filter(([, l]) => !l.startsWith('@@bye'));
    assert.equal(lines.length, want.length, 'same number of lines');
    for (let i = 0; i < want.length; i++) assert.deepEqual(lines[i], want[i], `line ${i}`);
    assert.deepEqual(sounds, sc.sounds);
    assert.deepEqual(speeds, sc.speeds.slice(0, -1));          // (the last one is the cleanup's: motors off)
  });
}

test('the frames of a message are the same as the ones the Python test encodes', () => {
  for (const g of golden.frames) {
    assert.deepEqual(encodeMessage(g.items, g.msg), g.frames);
  }
});

test('the scenarios exercise what they are for', () => {
  const words = new Set();
  for (const sc of golden.scenarios) for (const [, l] of sc.lines) words.add(l.split(' ')[0]);
  for (const w of ['@@hit', '@@learn', '@@forget', '@@ack', '@@state', '@@w', '@@p', '@@n']) assert.ok(words.has(w), w);
});
