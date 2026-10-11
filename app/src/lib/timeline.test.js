import test from 'node:test';
import assert from 'node:assert/strict';
import { record, biggestSwings, biggestMover } from './timeline.js';

const o = (wp, me, them, mine = [], opp = [], name = 'L') => ({ name, wp, me, them, approx: false,
  mine: mine.map(([n, pts]) => ({ who: 'mine', p: { name: n, pts } })), opp: opp.map(([n, pts]) => ({ who: 'opp', p: { name: n, pts } })) });

test('saves a point when odds or score move, skips unchanged and too-soon small moves', () => {
  let s = record({}, [o(0.5, 0, 0)], 0);
  assert.equal(s.L.points.length, 1);
  assert.equal(record(s, [o(0.5, 0, 0)], 10 * 60e3), s);                      // nothing changed
  assert.equal(record(s, [o(0.51, 1, 0)], 60e3), s);                          // moved a little, too soon
  assert.equal(record(s, [o(0.51, 1, 0)], 10 * 60e3).L.points.length, 2);
});

test('tags a big jump with the player whose points rose most', () => {
  let s = record({}, [o(0.5, 0, 0, [['Allen', 0]], [['Lamb', 0]])], 0);
  s = record(s, [o(0.7, 12, 0, [['Allen', 12]], [['Lamb', 0]])], 60e3);
  assert.deepEqual(s.L.points[1].note, { n: 'Allen', who: 'mine', d: 12 });
  const sw = biggestSwings(s.L.points);
  assert.equal(sw.length, 1);
  assert.ok(sw[0].delta > 0.19);
});

test('ignores by-hand leagues with no scores, and finds no mover when nothing rose', () => {
  assert.deepEqual(record({}, [{ ...o(0.5, 0, 0), approx: true }], 0), {});
  assert.equal(biggestMover({ 'mine:A': 5 }, o(0.5, 5, 0, [['A', 5]])), null);
});
