import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap } from './recap.js';

const hit = (name, side, leagues, est) => ({ uid: side + name, name, side, leagues, est });
const play = (id, period, hits) => ({ id, period, clock: '5:00', text: id, hits });
const plays = [
  play('a', 1, [hit('Allen', 'mine', ['Alpha', 'Beta'], 4)]),
  play('b', 1, [hit('Cook', 'opp', ['Alpha'], 7.2)]),
  play('c', 2, [hit('Allen', 'mine', ['Alpha', 'Beta'], -2), hit('Cook', 'opp', ['Beta'], 0.5)]),
  play('d', 4, [hit('Lamb', 'mine', ['Beta'], 6)])
];

test('totals what you got and what you gave up, per league and quarter', () => {
  const [alpha, beta] = buildRecap(plays, ['Alpha', 'Beta']);
  assert.equal(alpha.league, 'Alpha');
  assert.deepEqual(alpha.quarters.map(q => [q.forPts, q.againstPts]), [[4, 7.2], [-2, 0], [0, 0], [0, 0]]);
  assert.deepEqual([alpha.forPts, alpha.againstPts], [2, 7.2]);
  assert.deepEqual(beta.quarters.map(q => [q.forPts, q.againstPts]), [[4, 0], [-2, 0.5], [0, 0], [6, 0]]);
});

test('each league only sees its own side of a play, in the order the plays happened', () => {
  const [alpha, beta] = buildRecap(plays, ['Alpha', 'Beta']);
  assert.deepEqual(alpha.quarters[0].plays.map(p => p.id), ['a', 'b']);
  assert.deepEqual(alpha.quarters[1].plays[0].hits.map(h => h.name), ['Allen']);   // Cook is only against you in Beta
  assert.deepEqual(beta.quarters[1].plays[0].hits.map(h => h.name + ':' + h.side), ['Allen:mine', 'Cook:opp']);
  assert.deepEqual(beta.quarters[1].plays[0].hits[0].leagues, ['Beta']);
});

test('follows the league order, leaves quiet quarters at zero and adds overtime when it was played', () => {
  assert.deepEqual(buildRecap(plays, ['Beta', 'Alpha']).map(r => r.league), ['Beta', 'Alpha']);
  const ot = buildRecap([...plays, play('e', 5, [hit('Allen', 'mine', ['Alpha'], 1)])], ['Alpha']);
  assert.equal(ot[0].quarters.length, 5);
  assert.equal(ot[0].quarters[2].plays.length, 0);
  assert.deepEqual(buildRecap([], []), []);
});
