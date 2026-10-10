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

test('lines up the two lineups group by group and pads the shorter side', () => {
  const mine = [P('d1', 'DEF'), P('w1', 'WR'), P('q1', 'QB'), P('r1', 'RB'), P('w2', 'WR'), P('k1', 'K'), P('t1', 'TE')];
  const opp = [P('r2', 'RB'), P('q2', 'QB'), P('r3', 'RB'), P('w3', 'WR'), P('t2', 'TE'), P('l1', 'LB')];
  const rows = alignByPosition(mine, opp).map(([a, b]) => [a && a.name, b && b.name]);
  assert.deepEqual(rows, [
    ['q1', 'q2'], ['r1', 'r2'], [undefined, 'r3'], ['w1', 'w3'], ['w2', undefined],
    ['t1', 't2'], ['k1', undefined], ['d1', undefined], [undefined, 'l1']
  ]);
});

test('keeps players whose position is unknown, at the end', () => {
  const rows = alignByPosition([P('a', 'QB'), P('x', '')], [P('b', 'QB')]);
  assert.deepEqual(rows.map(([a, b]) => [a && a.name, b && b.name]), [['a', 'b'], ['x', undefined]]);
});
