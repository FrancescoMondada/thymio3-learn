import test from 'node:test';
import assert from 'node:assert/strict';
import { Telemetry, KEEP_READINGS } from '../src/store.js';
import { I18N } from '../src/i18n.js';

const flush = () => new Promise((r) => setTimeout(r, 160));
const w = (left, right) => ({ type: 'w', left, right });

test('the readings, the weights and the settings are what the robot said last', async () => {
  const tele = new Telemetry();
  let published = 0;
  tele.subscribe(() => { published += 1; });
  tele.push({ type: 'hello', t: 100 });
  tele.push({ type: 'n', state: 'drive', prox: [1, 2, 3, 4, 5, 6, 7], motors: [66, 66], learnt: 0, t: 120 });
  tele.push(w([0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]));
  tele.push({ type: 'p', step: 3, baseLeft: 66.7, baseRight: 66.7, forget: 16 });
  await flush();
  const s = tele.getSnapshot();
  assert.equal(s.running, true);
  assert.deepEqual(s.prox, [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(s.params, { step: 3, baseLeft: 66.7, baseRight: 66.7, forget: 16 });
  assert.equal(s.t, 120);
  assert.equal(published, 1, 'one snapshot for a burst of events');
});

test('a weight is in the history when it changes, not when it is said again', () => {
  const tele = new Telemetry();
  const zero = [0, 0, 0, 0, 0, 0, 0];
  tele.push({ ...w(zero, zero), t: 1000 });
  tele.push({ ...w(zero, zero), t: 4000 });
  tele.push({ ...w([3, 0, 0, 0, 0, 0, 0], [-3, 0, 0, 0, 0, 0, 0]), t: 5000 });
  tele.push({ ...w([3, 0, 0, 0, 0, 0, 0], [-3, 0, 0, 0, 0, 0, 0]), t: 8000 });
  assert.equal(tele.s.hist.w.length, 2);
  assert.deepEqual(tele.s.changed, { '0-0': 5000, '1-0': 5000 });
});

test('hits and lessons are counted and kept as events', () => {
  const tele = new Telemetry();
  tele.push({ type: 'hit', mask: 4, sensors: [false, false, true, false, false, false, false], t: 10 });
  tele.push({ type: 'learn', count: 1, t: 1010 });
  tele.push({ type: 'forget', count: 0, t: 16000 });
  assert.equal(tele.s.hits, 1);
  assert.equal(tele.s.lessons, 1);
  assert.equal(tele.s.learnt, 0);
  assert.deepEqual(tele.s.hist.events.map((e) => e.kind), ['hit', 'learn', 'forget']);
  assert.equal(tele.s.lastHit.t, 10);
});

test('the history is bounded', () => {
  const tele = new Telemetry();
  for (let i = 0; i < KEEP_READINGS * 2; i++) tele.push({ type: 'n', state: 'drive', prox: new Array(7).fill(i), motors: [0, 0], learnt: 0, t: 100 + i });
  assert.ok(tele.s.hist.n.length <= KEEP_READINGS + 100);
  assert.equal(tele.s.hist.n.at(-1).prox[0], KEEP_READINGS * 2 - 1);
});

test('the mode ending, the link lost and a restart', () => {
  const tele = new Telemetry();
  tele.push({ type: 'conn', status: 'connected', device: 'Thymio-1', firmware: null });
  tele.push({ type: 'hello', t: 1 });
  assert.equal(tele.s.running, true);
  tele.push({ type: 'exit' });
  assert.equal(tele.s.running, false);
  tele.push({ type: 'hello', t: 2 });
  tele.push({ type: 'conn', status: 'disconnected', error: 'GATT failed' });
  assert.equal(tele.s.running, false);
  assert.equal(tele.s.link.error, 'GATT failed');
  tele.push({ type: 'conn', status: 'connected', device: 'Thymio-1', firmware: { v: 1 } });
  assert.equal(tele.s.link.error, '');
  assert.equal(tele.s.link.device, 'Thymio-1');
  tele.clear();
  assert.equal(tele.s.hits, 0);
  assert.equal(tele.s.link.status, 'connected', 'the link survives a new run');
});

test('every text of the interface exists in every language', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  const fr = keys(I18N.fr).sort();
  for (const [lang, dict] of Object.entries(I18N)) {
    assert.deepEqual(keys(dict).sort(), fr, `${lang} has the same keys as fr`);
  }
  assert.equal(I18N.fr.net.sensors.length, 7);
  assert.equal(I18N.en.net.sensors.length, 7);
  assert.equal(I18N.en.net.short.length, 7);
  assert.equal(I18N.en.help.steps.length, I18N.fr.help.steps.length);
});
