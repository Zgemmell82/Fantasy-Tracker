import test from 'node:test';
import assert from 'node:assert/strict';
import { alignByPosition, positionRank } from './lineup.js';

const P = (name, pos) => ({ name, pos });

test('ranks QB, RB, WR, TE, K, DEF, then IDP, then anything else', () => {
  const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'LB', ''].map(positionRank);
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(positionRank('PK'), positionRank('K'));
  assert.equal(positionRank('db'), positionRank('DL'));
});

test('lines up the two lineups group by group; extra RBs and WRs face each other as a FLX row after the TE', () => {
  const mine = [P('d1', 'DEF'), P('w1', 'WR'), P('q1', 'QB'), P('r1', 'RB'), P('w2', 'WR'), P('k1', 'K'), P('t1', 'TE'), P('r4', 'RB')];
  const opp = [P('r2', 'RB'), P('q2', 'QB'), P('r3', 'RB'), P('w3', 'WR'), P('t2', 'TE'), P('l1', 'LB')];
  const rows = alignByPosition(mine, opp).map(([a, b, f]) => [a && a.name, b && b.name, f]);
  assert.deepEqual(rows, [
    ['q1', 'q2', undefined],
    ['r1', 'r2', undefined], ['r4', 'r3', undefined],     // two RBs each
    ['w1', 'w3', undefined],                              // one WR faces one WR
    ['t1', 't2', undefined],
    ['w2', undefined, 'FLX'],                             // my extra WR has no extra on their side
    ['k1', undefined, undefined], ['d1', undefined, undefined], [undefined, 'l1', undefined]
  ]);
});

test('a flex RB faces the other side\'s flex WR', () => {
  const mine = [P('r1', 'RB'), P('r2', 'RB'), P('r3', 'RB'), P('w1', 'WR'), P('w2', 'WR'), P('t1', 'TE')];
  const opp = [P('r4', 'RB'), P('r5', 'RB'), P('w3', 'WR'), P('w4', 'WR'), P('w5', 'WR'), P('t2', 'TE')];
  const rows = alignByPosition(mine, opp).map(([a, b, f]) => [a.name, b.name, f]);
  assert.deepEqual(rows, [
    ['r1', 'r4', undefined], ['r2', 'r5', undefined],
    ['w1', 'w3', undefined], ['w2', 'w4', undefined],
    ['t1', 't2', undefined],
    ['r3', 'w5', 'FLX']
  ]);
});

test('no FLX row when both sides have the same number at every position', () => {
  const rows = alignByPosition([P('a', 'RB'), P('b', 'RB'), P('c', 'WR')], [P('d', 'RB'), P('e', 'RB'), P('f', 'WR')]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(r => r.length === 2));
});

test('keeps players whose position is unknown, at the end', () => {
  const rows = alignByPosition([P('a', 'QB'), P('x', '')], [P('b', 'QB')]);
  assert.deepEqual(rows.map(([a, b]) => [a && a.name, b && b.name]), [['a', 'b'], ['x', undefined]]);
});
