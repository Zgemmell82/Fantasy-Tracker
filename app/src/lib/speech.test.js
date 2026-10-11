import test from 'node:test';
import assert from 'node:assert/strict';
import { pickVoices } from './speech.js';

const v = (name, lang = 'en-US') => ({ name, lang });

test('picks one female-sounding and one male-sounding English voice when it can', () => {
  const r = pickVoices([v('Amélie', 'fr-FR'), v('Daniel', 'en-GB'), v('Samantha'), v('Zarvox')]);
  assert.equal(r.a.name, 'Samantha');
  assert.equal(r.b.name, 'Daniel');
  assert.equal(r.shared, false);
});

test('uses two different voices if the names are unfamiliar, and tells you when it only has one', () => {
  const two = pickVoices([v('Foo'), v('Bar')]);
  assert.notEqual(two.a, two.b);
  const one = pickVoices([v('Foo')]);
  assert.equal(one.shared, true);
  assert.deepEqual(pickVoices([v('Amélie', 'fr-FR')]), { a: null, b: null, shared: true });
  assert.deepEqual(pickVoices([]), { a: null, b: null, shared: true });
});

test('prefers the premium or neural voices when the device has them', () => {
  const r = pickVoices([v('Samantha'), v('Ava (Premium)'), v('Daniel'), v('Evan (Enhanced)'), v('Microsoft Aria Online (Natural)'), v('Microsoft Guy Online (Natural)')]);
  assert.match(r.a.name, /Premium|Aria/);
  assert.match(r.b.name, /Enhanced|Guy/);
  assert.notEqual(r.a, r.b);
});
