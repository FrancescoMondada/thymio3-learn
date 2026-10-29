import test from 'node:test';
import assert from 'node:assert/strict';
import { I18N, LANGS, detectLang } from '../src/i18n.js';

const leaves = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
const words = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('four languages are offered, in this order, each under its own name', () => {
  assert.deepEqual(LANGS.map((l) => l.id), ['it', 'fr', 'de', 'en']);
  assert.deepEqual(LANGS.map((l) => l.label), ['Italiano', 'Français', 'Deutsch', 'English']);
  for (const l of LANGS) assert.ok(I18N[l.id], l.id);
});

test('every language has the same keys and the same {words} to fill in as French', () => {
  const fr = Object.fromEntries(leaves(I18N.fr));
  for (const { id } of LANGS) {
    const dict = Object.fromEntries(leaves(I18N[id]));
    assert.deepEqual(Object.keys(dict).sort(), Object.keys(fr).sort(), `${id}: same keys`);
    for (const [key, text] of Object.entries(dict)) {
      assert.ok(String(text).trim() !== '', `${id}.${key} is empty`);
      assert.equal(words(text), words(fr[key]), `${id}.${key}: {words}`);
    }
  }
});

test('the lists have the same length in every language (sensors, wheels, steps, shortcuts)', () => {
  for (const { id } of LANGS) {
    const t = I18N[id];
    assert.equal(t.net.sensors.length, 7, id);
    assert.equal(t.net.short.length, 7, id);
    assert.equal(t.net.wheels.length, 2, id);
    assert.equal(t.help.steps.length, I18N.fr.help.steps.length, id);
    assert.equal(t.diag.shortcuts.length, I18N.fr.diag.shortcuts.length, id);
  }
});

test('the language of the browser is used when it is one of the four, French otherwise', () => {
  const nav = (language) => { Object.defineProperty(globalThis, 'navigator', { value: { language }, configurable: true }); return detectLang(); };
  assert.equal(nav('it-CH'), 'it');
  assert.equal(nav('de-AT'), 'de');
  assert.equal(nav('en-GB'), 'en');
  assert.equal(nav('fr-FR'), 'fr');
  assert.equal(nav('es-ES'), 'fr');
});
