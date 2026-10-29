import test from 'node:test';
import assert from 'node:assert/strict';
import { envelope, indexAt } from '../src/components/chartkit.js';

const series = (n, valueOf) => Array.from({ length: n }, (_, i) => ({ t: i * 100, v: valueOf(i) }));

test('envelope: a short series is returned as it is', () => {
  const out = envelope(series(50, (i) => i), (p) => p.v, 0, 5000, 600);
  assert.equal(out.length, 50);
  assert.deepEqual(out[3], [300, 3]);
});

test('envelope: a long series is thinned, and a peak survives', () => {
  const pts = series(9000, (i) => (i === 4321 ? 4000 : 100));
  const out = envelope(pts, (p) => p.v, 0, 900000, 300);
  assert.ok(out.length <= 300 * 2 + 2, `${out.length} points`);
  assert.ok(out.some(([, v]) => v === 4000), 'the peak is kept');
  assert.ok(out.every(([t], k) => k === 0 || t >= out[k - 1][0]), 'in time order');
});

test('envelope: nothing is drawn before the left edge, thinned or not', () => {
  const pts = series(2000, (i) => i % 7);
  for (const buckets of [60, 5000]) {
    const out = envelope(pts, (p) => p.v, 50050, 150000, buckets);
    assert.ok(out.length > 0);
    assert.ok(out.every(([t]) => t >= 50050), `buckets ${buckets}`);
  }
  assert.equal(indexAt(pts, 50050), 500);
});
