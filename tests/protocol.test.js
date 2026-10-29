import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseRobotLine, LineAssembler, encodeMessage, FrameReceiver, itemsFor, liveActuator, liveNibbles, weightItem, stepItem, speedItem, forgetItem, commandItem,
  KEY, CMD, MAX_ITEMS, frameSum, isFrame,
} from '../src/protocol.js';
import { minify, hash32, moduleNameFor, buildModuleFrom } from '../src/script-core.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('the lines of the robot become events', () => {
  assert.deepEqual(parseRobotLine('@@n 0 0 0 3400 0 0 0 0 66 -66 5'), { type: 'n', state: 'drive', prox: [0, 0, 3400, 0, 0, 0, 0], motors: [66, -66], learnt: 5 });
  assert.deepEqual(parseRobotLine('@@n 1 4095 0 0 0 0 0 0 -200 -200 16').state, 'back');
  assert.equal(parseRobotLine('@@n 5 0 0 0 0 0 0 0 0 0 0').state, 'pause');
  const w = parseRobotLine('@@w 30 -30 0 0 0 0 5 -30 30 0 0 0 0 -15');
  assert.deepEqual(w.left, [3, -3, 0, 0, 0, 0, 0.5]);
  assert.deepEqual(w.right, [-3, 3, 0, 0, 0, 0, -1.5]);
  assert.deepEqual(parseRobotLine('@@p 30 667 16'), { type: 'p', step: 3, base: 66.7, forget: 16 });
  assert.deepEqual(parseRobotLine('@@hit 5'), { type: 'hit', mask: 5, sensors: [true, false, true, false, false, false, false] });
  assert.deepEqual(parseRobotLine('@@learn 3'), { type: 'learn', count: 3 });
  assert.deepEqual(parseRobotLine('@@ack 7'), { type: 'ack', msg: 7 });
  assert.deepEqual(parseRobotLine('@@state freeze'), { type: 'state', state: 'freeze' });
  assert.equal(parseRobotLine('@@state dancing'), null);
  assert.equal(parseRobotLine('@@n 0 1 2'), null, 'a line cut short is not an event');
  assert.equal(parseRobotLine('@@w 1 2 3'), null);
  assert.equal(parseRobotLine('hello world'), null);
  assert.equal(parseRobotLine('ValueError: bad').type, 'error');
});

test('stdout cut anywhere gives whole lines', () => {
  const a = new LineAssembler();
  const line = '@@n 0 1 2 3 4 5 6 7 8 9 10';
  const padded = `${line}${' '.repeat(99 - line.length)}\x1e`;
  const out = [];
  for (let i = 0; i < padded.length; i += 11) out.push(...a.push(padded.slice(i, i + 11)));
  out.push(...a.push('@@bye\r\n'));
  assert.deepEqual(out.map((l) => l.trim()), [line, '@@bye']);
});

test('a message is encoded in frames and decoded back, whatever the values', () => {
  for (const items of [[], [[0, 45]], [[11, -25], [16, 50], [17, 100], [18, 0], [19, 3]], Array.from({ length: MAX_ITEMS }, (_, k) => [k, k * 170 - 1000])]) {
    const frames = encodeMessage(items, 9);
    assert.ok(frames.length >= 1 && frames.length <= 8);
    const rx = new FrameReceiver();
    let got = null;
    for (const f of frames) { assert.ok(isFrame(f)); got = rx.push(f) || got; }
    assert.deepEqual(got.items, items);
    assert.equal(got.msg, 9);
  }
  assert.equal(encodeMessage(Array.from({ length: 13 }, (_, k) => [k, 0])), null, '13 items do not fit in 8 frames');
});

test('frames that are wrong or incomplete apply nothing', () => {
  const frames = encodeMessage([[0, 1], [1, 2], [2, 3], [3, 4]], 2);
  assert.equal(frames.length, 3);
  const rx = new FrameReceiver();
  assert.equal(rx.push(frames[0]), null);
  const bad = [...frames[1]];
  bad[11] = (bad[11] + 1) & 15;
  assert.equal(rx.push(bad), null);
  assert.equal(rx.push(frames[2]), null, 'the frame in the middle is missing');
  assert.equal(rx.push(frames[1]).items.length, 4, 'and here it comes');
  const notAFrame = new Array(12).fill(3);
  assert.equal(isFrame(notAFrame), false);
  assert.equal(rx.push(notAFrame), null);
  assert.equal(frameSum(frames[0]), frames[0][11]);
});

test('what the interface asks for becomes items: weights first, then the settings, then the command', () => {
  assert.deepEqual(itemsFor({ left: { 2: -3.5 }, right: { 0: 12 }, step: 4.5, base: 90, forget: 0, command: CMD.RESET }), [[[2, -35], [7, 120], [KEY.STEP, 45], [KEY.SPEED, 90], [KEY.FORGET, 0], [KEY.COMMAND, CMD.RESET]]]);
  const all = { left: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, i])), right: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, -i])) };
  const messages = itemsFor(all);
  assert.deepEqual(messages.map((m) => m.length), [12, 2], '14 weights are two messages');
  assert.deepEqual(weightItem('right', 6, -100), [13, -1000]);
  assert.deepEqual(weightItem('left', 0, 500), [0, 1000], 'a weight is limited to 100');
  assert.deepEqual(stepItem(-1), [KEY.STEP, 0]);
  assert.deepEqual(speedItem(999), [KEY.SPEED, 500]);
  assert.deepEqual(forgetItem(16.4), [KEY.FORGET, 16]);
  assert.deepEqual(commandItem(CMD.PAUSE), [KEY.COMMAND, 2]);
});

test('the Bluetooth command carries the frame in the body LEDs and keeps the wheels where they are', () => {
  const frame = encodeMessage([[0, 45]], 3)[0];
  const a = liveActuator(frame, { motors: [66.4, -66.6] });
  assert.deepEqual(liveNibbles(a), frame);
  assert.equal(a.motorLeft, 66);
  assert.equal(a.motorRight, -67);
  assert.equal(a.sound, 0);
  assert.ok(liveNibbles(a).every((v) => v >= 0 && v <= 15), 'every LED value fits the API (0..15)');
});

test('the mode as the interface sends it (minified) does exactly what the source does', () => {
  const source = fs.readFileSync(path.join(here, '..', 'src', 'py', 'ann_mode.py'), 'utf8');
  const mini = buildModuleFrom(source);
  assert.ok(mini.length < source.length * 0.8, `${mini.length} bytes against ${source.length}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-mini-'));
  try {
    const file = path.join(dir, 'ann_mode_min.py');
    fs.writeFileSync(file, mini);
    const out = execFileSync('python3', ['-I', path.join(here, 'test_ann_mode.py'), '--same-as', file], { encoding: 'utf8' });
    assert.match(out, /same/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.match(moduleNameFor(mini), /^ann_[0-9a-f]{8}$/);
  assert.ok(`${moduleNameFor(mini)}.py`.length <= 30);
  assert.equal(hash32('a'), hash32('a'));
  assert.notEqual(hash32('a'), hash32('b'));
  assert.equal(minify('x = 1  # c\n\n# only a comment\n    y = "#"  # keep\n'), 'x = 1\n y = "#"  # keep\n');
});
