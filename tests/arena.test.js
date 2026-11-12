import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena, proxFromDistance, MM_PER_UNIT, ROBOT_RADIUS } from '../src/sim/arena.js';
import { VirtualRobot } from '../src/sim/virtual-robot.js';
import { COLLISION, PRESETS } from '../src/spec.js';
import { CMD } from '../src/protocol.js';
import { SimBackend } from '../src/sim/sim-backend.js';

const golden = JSON.parse((await import('node:fs')).readFileSync(new URL('./golden-ann.json', import.meta.url), 'utf8'));

test('the sensor curve is the one the Python test uses for its wall', () => {
  for (const [d, v] of golden.prox_curve) assert.equal(proxFromDistance(d), v, `${d} mm`);
  assert.ok(proxFromDistance(15) > COLLISION && proxFromDistance(17) < COLLISION, 'the threshold is at about 16 mm');
  assert.equal(proxFromDistance(110), 0);
});

test('a robot facing a wall reads it with its front sensors and nothing behind', () => {
  const a = new Arena({ noise: 0 });
  a.obstacles = [];
  a.pose = { x: a.width - ROBOT_RADIUS - 30, y: a.height / 2, h: 0 };
  const p = a.sense();
  assert.ok(p[2] > 1000, `front ${p[2]}`);
  assert.ok(p[1] > 0 && p[3] > 0);
  assert.equal(p[5], 0);
  assert.equal(p[6], 0);
  a.pose.h = Math.PI;                                                    // turned around: the back sensors see the wall, the front ones the far wall
  const q = a.sense();
  assert.ok(q[5] > 1000 && q[6] > 1000);
});

test('the wheels move the body as the factory numbers say, and the body stays in the arena', () => {
  const a = new Arena({ noise: 0 });
  a.obstacles = [];
  a.pose = { x: 200, y: 230, h: 0 };
  for (let i = 0; i < 50; i++) a.step(300, 300, 20);                     // 1 s at 300
  assert.ok(Math.abs(a.pose.x - 200 - 300 * MM_PER_UNIT) < 1, `moved ${a.pose.x - 200} mm`);
  assert.ok(Math.abs(a.pose.y - 230) < 0.01);
  for (let i = 0; i < 50 * 20; i++) a.step(300, 300, 20);                // into the wall
  assert.ok(a.pose.x <= a.width - ROBOT_RADIUS + 0.001);
  const h0 = a.pose.h;
  for (let i = 0; i < 50; i++) a.step(-100, 100, 20);                    // turns left on the spot
  assert.ok(a.pose.h > h0);
});

test('an obstacle is felt, and cannot be crossed', () => {
  const a = new Arena({ noise: 0 });
  a.obstacles = [];
  a.add({ kind: 'disc', x: 300, y: 230, r: 30 });
  a.add({ kind: 'box', x: 500, y: 230, w: 40, h: 120, a: 0 });
  a.pose = { x: 150, y: 230, h: 0 };
  for (let i = 0; i < 50 * 40; i++) a.step(200, 200, 20);
  assert.ok(a.pose.x <= 300 - 30 - ROBOT_RADIUS + 0.01, `stopped at ${a.pose.x}`);
  a.move(1, 5000, 5000);                                                 // dragged away, kept inside
  assert.ok(a.obstacles[0].x < a.width && a.obstacles[0].y < a.height);
});

test('the virtual robot learns from a wall, deterministically', () => {
  const run = () => {
    const events = [];
    const sim = new SimBackend((e) => events.push(e), { robot: new VirtualRobot({ noise: 0 }) });
    sim.robot.arena.obstacles = [];
    sim.start();
    for (let i = 0; i < 40 * 50; i++) sim.advance(20);
    return events;
  };
  const a = run();
  assert.ok(a.some((e) => e.type === 'hit'), 'it hits the wall');
  assert.ok(a.some((e) => e.type === 'learn'));
  const w = a.filter((e) => e.type === 'w').at(-1);
  assert.ok(w.left.some((v) => v !== 0), 'the weights changed');
  assert.deepEqual(run().filter((e) => e.type === 'w').at(-1).left, w.left, 'same world, same weights');
});

test('the virtual robot starts with the interface\'s default base speed, 67 for both wheels', () => {
  const events = [];
  const sim = new SimBackend((e) => events.push(e));
  sim.start();
  assert.deepEqual(events.find((e) => e.type === 'p'), { type: 'p', step: 3, baseLeft: 67, baseRight: 67, forget: 16, t: events.find((e) => e.type === 'p').t });
  for (let i = 0; i < 20; i++) sim.advance(20);
  assert.deepEqual(events.filter((e) => e.type === 'n').at(-1).motors, [67, 67], 'nothing in front: each wheel runs at its base speed');
});

test('the interface changes a running virtual robot through the same messages as the real one', () => {
  const events = [];
  const sim = new SimBackend((e) => events.push(e));
  sim.start();
  sim.apply({ left: { 3: 7.5 }, step: 5, baseLeft: 120, baseRight: 90 });
  for (let i = 0; i < 100; i++) sim.advance(20);
  assert.equal(events.filter((e) => e.type === 'w').at(-1).left[3], 7.5);
  assert.deepEqual(events.filter((e) => e.type === 'p').at(-1), { type: 'p', step: 5, baseLeft: 120, baseRight: 90, forget: 16, t: events.filter((e) => e.type === 'p').at(-1).t });
  assert.ok(events.some((e) => e.type === 'ack'));
  sim.apply({ command: 7 });
  sim.stop();
  assert.equal(events.at(-1).type, 'bye');
});

test('distanceFromProx: the inverse of the sensor curve (low reading = far, high = near)', async () => {
  const { distanceFromProx } = await import('../src/spec.js');
  for (const d of [5, 16, 30, 60, 90]) assert.ok(Math.abs(distanceFromProx(proxFromDistance(d)) - d) < 1.2, `${d} mm`);
  assert.equal(distanceFromProx(0), 110);
  assert.ok(distanceFromProx(4095) < 6);
  assert.ok(distanceFromProx(1000) > distanceFromProx(3000));
});

test('the ready-made brain that avoids obstacles: slight turns on the sides, stronger ones between, the middle brakes on both wheels', () => {
  const avoid = PRESETS.find((p) => p.id === 'avoid');
  assert.deepEqual(avoid.left, [5, 10, -15, -10, -5, 0, 0]);
  assert.deepEqual(avoid.right, [-5, -10, -15, 10, 5, 0, 0]);
  // what a sensor on one side does to a wheel is the opposite of what the sensor on the other side does to the other wheel
  for (let i = 0; i < 5; i++) assert.equal(avoid.left[i], avoid.right[4 - i], `sensor ${i}`);
  assert.deepEqual(avoid.left.slice(5), [0, 0], 'the back sensors do nothing');
});

test('with that brain alone the virtual robot stays off the obstacles from starts where the empty brain runs into one', () => {
  const trial = (preset, pose, seconds = 40) => {
    const sim = new SimBackend(() => {});
    const w = PRESETS.find((p) => p.id === preset);
    sim.start({ weights: { left: w.left, right: w.right } });
    sim.apply({ command: CMD.FREEZE });                          // the brain alone: nothing is learnt
    const arena = sim.robot.arena;
    arena.pose = { ...pose };
    arena.bumped = 0;
    for (let t = 0; t < seconds * 10; t++) {
      sim.advance(100);
      if (arena.bumped > 0) return (t + 1) / 10;
    }
    return null;                                                 // no contact
  };
  for (const pose of [{ x: 357.78, y: 243.54, h: 3.745 }, { x: 98.35, y: 308.33, h: 1.899 }, { x: 177.07, y: 350.14, h: 4.822 }, { x: 167.14, y: 281.85, h: 2.2 }]) {
    assert.ok(trial('blank', pose) !== null, 'the empty brain drives into something');
    assert.equal(trial('avoid', pose), null, `the avoiding brain from ${JSON.stringify(pose)}`);
  }
});
