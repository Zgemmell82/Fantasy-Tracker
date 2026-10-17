import test from 'node:test';
import assert from 'node:assert/strict';
import { isLateOrPrimetime, winPath, winPaths, showWinPath } from './winpath.js';

const x = (name, who, mean, f = 0.5) => ({ p: { name }, who, mean, f });
const o = (extra = {}) => ({ name: 'L', me: 70, them: 80, diff: -10, wp: 0.4, done: false, approx: false, mine: [], opp: [], ...extra });

test('late Sunday, Thursday and Monday games count as primetime; early Sunday does not', () => {
  assert.equal(isLateOrPrimetime({ t: '2026-10-11T17:00:00Z' }), false);   // Sun 1 pm ET
  assert.equal(isLateOrPrimetime({ t: '2026-10-11T20:25:00Z' }), true);    // Sun 4:25 pm ET
  assert.equal(isLateOrPrimetime({ t: '2026-10-12T00:20:00Z' }), true);    // Sun 8:20 pm ET (Monday UTC)
  assert.equal(isLateOrPrimetime({ t: '2026-10-13T00:15:00Z' }), true);    // Mon 8:15 pm ET
  assert.equal(isLateOrPrimetime({ t: '2026-10-09T00:15:00Z' }), true);    // Thu 8:15 pm ET
});

test('shows once the week has started and a primetime game is unfinished', () => {
  assert.equal(showWinPath(5, {}, Date.parse('2026-10-06T12:00:00Z')), false);          // before the week
  assert.equal(showWinPath(5, {}, Date.parse('2026-10-11T18:00:00Z')), true);           // Sunday afternoon
  assert.equal(showWinPath(5, {}, Date.parse('2026-10-14T12:00:00Z')), false);          // everything final
});

test('says how many points are needed and which players supply them', () => {
  const w = winPath(o({ mine: [x('Brock Purdy', 'mine', 11), x('Cooper Kupp', 'mine', 8), x('Bench Guy', 'mine', 2)], opp: [x('Their Guy', 'opp', 4)] }));
  assert.equal(w.need, 14);
  assert.deepEqual(w.picks.map(p => p.name), ['Brock Purdy', 'Cooper Kupp']);
  assert.match(w.line, /^Need 14 more\. Purdy \(proj 11 left\) \+ Kupp \(proj 8 left\) gets you there/);
  assert.equal(w.status, 'bubble');
});

test('opponent finished: control when ahead, a target when behind', () => {
  assert.match(winPath(o({ me: 90, them: 80, diff: 10, wp: 0.97, mine: [x('A', 'mine', 5)] })).line, /no one left to play. You're in control/);
  const w = winPath(o({ mine: [x('Kupp', 'mine', 12)], wp: 0.3 }));
  assert.match(w.line, /Opponent is done at 80\. You need 10\.1 more/);
});

test('marks decided leagues locked and sorts them last', () => {
  const list = winPaths([o({ name: 'Done', done: true, wp: 1, me: 100, them: 90, diff: 10 }), o({ name: 'Close', wp: 0.5 }), o({ name: 'Far', wp: 0.1 }), o({ name: 'Hand', approx: true })]);
  assert.deepEqual(list.map(w => w.name), ['Close', 'Far', 'Done']);
  assert.equal(list[2].locked, true);
  assert.equal(list[1].status, 'miracle');
});
