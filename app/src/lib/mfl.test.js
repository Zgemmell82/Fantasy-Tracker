import test from 'node:test';
import assert from 'node:assert/strict';
import { flipName, parseMfl } from './mfl.js';

const roster = {
  '1': { name: 'Allen, Josh', position: 'QB', team: 'BUF' },
  '2': { name: 'Kelce, Travis', position: 'TE', team: 'KCC' },
  '3': { name: 'Miami, Dolphins', position: 'Def', team: 'MIA' },
  '4': { name: 'Bench, Guy', position: 'WR', team: 'DAL' },
  '5': { name: 'Lamb, CeeDee', position: 'WR', team: 'DAL' }
};
const live = { liveScoring: { week: '4', matchup: [
  { franchise: [
    { id: '0003', score: '21.5', players: { player: [{ id: '1', status: 'starter', score: '18.2' }, { id: '2', status: 'starter', score: '3.3' }, { id: '4', status: 'nonstarter', score: '9' }] } },
    { id: '0007', score: '10', players: { player: [{ id: '3', status: 'starter', score: '' }, { id: '5', status: 'starter', score: '10' }] } }
  ] }
] } };

test('flips "Last, First" names', () => {
  assert.equal(flipName('Allen, Josh'), 'Josh Allen');
  assert.equal(flipName('Madden Jr., Sam'), 'Sam Madden Jr.');
});

test('reads starters, opponent, positions, teams and scores', () => {
  const r = parseMfl(live, roster, '3');
  assert.deepEqual(r.mine.map(p => p.n), ['Josh Allen', 'Travis Kelce']);
  assert.equal(r.mine[1].t, 'KC');
  assert.equal(r.mine[0].pts, 18.2);
  assert.deepEqual(r.opp.map(p => [p.n, p.p]), [['Dolphins D/ST', 'DEF'], ['CeeDee Lamb', 'WR']]);
  assert.equal(r.opp[0].pts, undefined);
  assert.deepEqual(r.score, { mine: 21.5, opp: 10 });
});

test('works from the other franchise and with a single matchup object', () => {
  const single = { liveScoring: { week: '4', matchup: live.liveScoring.matchup[0] } };
  assert.equal(parseMfl(single, roster, '7').mine.length, 2);
});

test('says so when the franchise has no matchup', () => {
  assert.throws(() => parseMfl(live, roster, '9'), /No week 4 matchup/);
});
