import test from 'node:test';
import assert from 'node:assert/strict';
import { LORE, pickLore } from './lore.js';

test('every storyline is checkable: an id, a finished week, plain text with digits, and at least two sources', () => {
  const ids = new Set();
  LORE.forEach(i => {
    assert.ok(i.id && !ids.has(i.id), 'unique id ' + i.id); ids.add(i.id);
    assert.ok(i.week >= 1 && i.week <= 4, i.id);
    assert.ok(i.teams.length >= 1 && i.teams.every(t => /^[A-Z]{2,3}$/.test(t)), i.id);
    assert.match(i.text, /^In week (one|two|three|four)/, i.id);
    assert.match(i.text, /\d/, i.id);
    assert.ok(i.sources.length >= 2 && i.sources.every(s => /^https:\/\//.test(s)), i.id + ' needs two sources');
    assert.doesNotMatch(i.text, /injur|questionable|out for|benched|depth chart/i, i.id + ' must not state things that go stale');
  });
  assert.ok(LORE.length >= 10);
});

test('picks a storyline about a team or player in your leagues, once, and only for weeks that have happened', () => {
  const used = new Set();
  const f = { week: 5, teams: ['JAX'], names: ['trevor lawrence'] };
  const a = pickLore(f, used, () => 0);
  assert.equal(a.item.id, 'w3-jax-ne');
  assert.deepEqual(a.mention, ['Trevor Lawrence']);
  assert.equal(a.relevant, true);
  used.add(a.item.id);
  const b = pickLore(f, used, () => 0);                          // nothing else about JAX, so any unused one
  assert.notEqual(b.item.id, 'w3-jax-ne');
  assert.equal(b.relevant, false);
  assert.equal(pickLore({ week: 1, teams: [], names: [] }, new Set(), () => 0), null);       // nothing has happened before week 1
  assert.ok(pickLore({ week: 3, teams: ['KC'], names: [] }, new Set(), () => 0).item.week < 3);
});

test('runs out gracefully', () => {
  const used = new Set(LORE.map(i => i.id));
  assert.equal(pickLore({ week: 9, teams: ['KC'], names: [] }, used), null);
});
