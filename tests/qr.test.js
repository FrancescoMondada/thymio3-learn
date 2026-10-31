import test from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, qrPath, readQr } from '../src/qr.js';
import { encodeConfig } from '../src/share.js';

// The matrix as the image a camera would see: dark modules black on white, a quiet zone of 4 modules, `k` pixels a module
function picture(code, k = 6, quiet = 4) {
  const side = (code.size + 2 * quiet) * k;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let r = 0; r < code.size; r++) {
    for (let c = 0; c < code.size; c++) {
      if (!code.dark(r, c)) continue;
      for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) {
        const i = (((r + quiet) * k + y) * side + (c + quiet) * k + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  }
  return { data, width: side, height: side };
}

const biggest = encodeConfig({ lang: 'en', step: 10, baseLeft: 200, baseRight: 200, forget: 120, weights: { left: new Array(7).fill(-100), right: new Array(7).fill(-100) } });

test('a code is read back as the text it was made for', async () => {
  for (const text of [encodeConfig({ lang: 'fr', step: 3, baseLeft: 67, baseRight: 67, forget: 16 }), biggest, 'T3L1;s=30']) {
    const code = qrMatrix(text);
    assert.ok(code, text);
    assert.equal(await readQr(picture(code)), text);
  }
});

test('the code of a whole configuration is a small one, easy to scan across a room', () => {
  assert.ok(qrMatrix(biggest).size <= 45, `${qrMatrix(biggest).size} modules a side`);
});

test('a text that does not fit gives no code, and an image without a code gives no text', async () => {
  assert.equal(qrMatrix('x'.repeat(5000)), null);
  const blank = { data: new Uint8ClampedArray(100 * 100 * 4).fill(255), width: 100, height: 100 };
  assert.equal(await readQr(blank), null);
});

test('the path draws exactly the dark modules', () => {
  const code = qrMatrix('T3L1;s=30');
  const path = qrPath(code);
  let area = 0;
  for (const m of path.matchAll(/h(\d+)v1/g)) area += Number(m[1]);
  let dark = 0;
  for (let r = 0; r < code.size; r++) for (let c = 0; c < code.size; c++) if (code.dark(r, c)) dark++;
  assert.equal(area, dark);
});
