import test from 'node:test';
import assert from 'node:assert/strict';
import { PREFIX, MAX_TEXT, encodeConfig, decodeConfig, configChange } from '../src/share.js';
import { itemsFor, MAX_ITEMS } from '../src/protocol.js';

const brain = (left, right) => ({ left, right });
const sample = {
  lang: 'fr', step: 3, baseLeft: 67, baseRight: 67, forget: 16,
  weights: brain([9, 6, 0, -6, -9, 0, 0], [-9, -6, 0, 6, 9, 0, 0]),
};

test('a configuration is a short text of the numbers of the protocol (tenths)', () => {
  assert.equal(encodeConfig(sample), `${PREFIX};l=fr;s=30;b=670,670;f=16;w=90,60,0,-60,-90,0,0,-90,-60,0,60,90,0,0`);
});

test('what a code holds comes back the same, in the units of the page', () => {
  assert.deepEqual(decodeConfig(encodeConfig(sample)), sample);
  const odd = { lang: 'de', step: 0.5, baseLeft: 66.7, baseRight: 72.3, forget: 0, weights: brain([0.5, -4.5, 100, -100, 0, 33.3, -0.1], [1, 2, 3, 4, 5, 6, 7]) };
  assert.deepEqual(decodeConfig(encodeConfig(odd)), odd);
});

test('the biggest configuration stays far below the limit of a text', () => {
  const big = { lang: 'en', step: 10, baseLeft: 200, baseRight: 200, forget: 120, weights: brain(new Array(7).fill(-100), new Array(7).fill(-100)) };
  const text = encodeConfig(big);
  assert.ok(text.length < 130, `${text.length} characters`);
  assert.ok(text.length < MAX_TEXT);
  assert.deepEqual(decodeConfig(text), big);
});

test('a part that is missing is left out, and a code that has only that part leaves the rest of the page alone', () => {
  assert.equal(encodeConfig({ lang: 'it', step: 2 }), `${PREFIX};l=it;s=20`);
  assert.deepEqual(decodeConfig(`${PREFIX};s=20`), { step: 2 });
  assert.equal(encodeConfig({ baseLeft: 50 }), PREFIX);                      // one of the two speeds alone is not a pair
  assert.equal(decodeConfig(PREFIX), null, 'nothing in it');
});

test('values that are out of range are kept inside when written', () => {
  const text = encodeConfig({ step: 99, baseLeft: -5, baseRight: 999, forget: 9999, weights: brain(new Array(7).fill(500), new Array(7).fill(-500)) });
  assert.deepEqual(decodeConfig(text), { step: 10, baseLeft: 0, baseRight: 200, forget: 120, weights: brain(new Array(7).fill(100), new Array(7).fill(-100)) });
});

test('a code is read strictly: what is not valid is dropped, never run', () => {
  assert.equal(decodeConfig('T3C1;l=fr;s=1'), null, 'the code of the cards application is not ours');
  assert.equal(decodeConfig('https://example.com'), null);
  assert.equal(decodeConfig(null), null);
  assert.equal(decodeConfig(42), null);
  assert.equal(decodeConfig(`${PREFIX};${'s=1;'.repeat(200)}`), null, 'too long');
  assert.deepEqual(decodeConfig(`${PREFIX};l=xx;s=31;b=670;f=-1;w=1,2,3`), { step: 3.1 }, 'only the valid field');
  assert.deepEqual(decodeConfig(`${PREFIX};s=101;f=121;b=2001,0;w=${new Array(14).fill(1001).join(',')}`), null, 'every number out of range');
  assert.deepEqual(decodeConfig(`${PREFIX};s=1.5;f=1e2;b=0x10,5`), null, 'only whole numbers');
  assert.deepEqual(decodeConfig(`${PREFIX};b=100,200,300;w=${new Array(15).fill(0).join(',')}`), null, 'wrong counts');
  assert.deepEqual(decodeConfig(`${PREFIX};z=1;s=5;;=3;x`), { step: 0.5 }, 'unknown and empty fields are ignored');
  assert.deepEqual(decodeConfig(`${PREFIX};f=16;s=30`), { forget: 16, step: 3 }, 'the order does not matter');
  assert.deepEqual(decodeConfig(`  ${PREFIX};s=30\n`), { step: 3 }, 'spaces around the text');
});

test('a scanned configuration asks the robot for what the sliders and the chips ask, in two messages', () => {
  const change = configChange(decodeConfig(encodeConfig(sample)));
  assert.deepEqual(Object.keys(change).sort(), ['baseLeft', 'baseRight', 'forget', 'left', 'right', 'step']);
  assert.equal(Object.keys(change.left).length, 7);
  assert.equal(change.step, 3);
  const messages = itemsFor(change);
  assert.equal(messages.length, 2);
  assert.ok(messages.every((m) => m.length <= MAX_ITEMS));
  assert.equal(messages.flat().length, 14 + 4);
  assert.deepEqual(configChange({ lang: 'fr' }), {}, 'the language is the page\'s own business');
});
