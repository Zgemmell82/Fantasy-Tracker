import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByGame } from './games.js';
import { currentWeek, seedWeek } from './season.js';
import { espnStarters } from './espn.js';

test('groups the same player across leagues into one line', () => {
  const p = { name: 'CeeDee Lamb', pos: 'WR', team: 'DAL' };
  const wk = { RDL: { mine: [], opp: [] }, DFL: { mine: [p], opp: [] }, Deloitte: { mine: [p], opp: [] } };
  const { games } = groupByGame(1, wk, 0);
  assert.equal(games.length, 1);
  assert.equal(games[0].mine.length, 1);
  assert.deepEqual(games[0].mine[0].leagues, ['DFL', 'Deloitte']);
  assert.equal(games[0].status, 'Upcoming');
});

test('players whose team has no game go to the bye bucket', () => {
  const wk = { RDL: { mine: [{ name: 'X', pos: 'WR', team: 'ZZZ' }], opp: [] } };
  const { games, bye } = groupByGame(1, wk, 0);
  assert.equal(games.length, 0);
  assert.equal(bye.mine.length, 1);
});

test('current week follows the schedule', () => {
  assert.equal(currentWeek(Date.parse('2026-09-01T00:00:00Z')), 1);
  assert.equal(currentWeek(Date.parse('2026-09-25T00:00:00Z')), 3);
  assert.equal(currentWeek(Date.parse('2027-03-01T00:00:00Z')), 18);
});

test('a new week carries over my starters but not the opponent', () => {
  const w1 = seedWeek(1, {}, undefined, true);
  assert.ok(w1.RDL.opp.length > 0);
  const w2 = seedWeek(2, { 1: w1 }, undefined, true);
  assert.equal(w2.RDL.mine.length, w1.RDL.mine.length);
  assert.equal(w2.RDL.opp.length, 0);
  assert.equal(w2.Breezewood.mine.length, w1.Breezewood.mine.length);
});

test('ESPN starters skip bench and IR and name defenses', () => {
  const side = { rosterForCurrentScoringPeriod: { entries: [
    { lineupSlotId: 0, playerPoolEntry: { player: { fullName: 'Jaxson Dart', defaultPositionId: 1, proTeamId: 19 } } },
    { lineupSlotId: 20, playerPoolEntry: { player: { fullName: 'Bench Guy', defaultPositionId: 2, proTeamId: 1 } } },
    { lineupSlotId: 21, playerPoolEntry: { player: { fullName: 'IR Guy', defaultPositionId: 2, proTeamId: 1 } } },
    { lineupSlotId: 16, playerPoolEntry: { player: { fullName: 'Steelers D/ST', defaultPositionId: 16, proTeamId: 23 } } }
  ] } };
  assert.deepEqual(espnStarters(side), [
    { n: 'Jaxson Dart', p: 'QB', t: 'NYG' },
    { n: 'Steelers D/ST', p: 'DEF', t: 'PIT' }
  ]);
});

import { nameId, playerKey } from './identity.js';
test('the same player spelled differently across sites is one record', () => {
  assert.equal(nameId('Luther Burden III'), nameId('Luther Burden'));
  assert.equal(nameId('D.J. Moore'), nameId('DJ Moore'));
  assert.equal(nameId('Marvin Harrison Jr.'), nameId('Marvin Harrison'));
  assert.equal(nameId('Jaxon Smith-Njigba'), nameId('Jaxon Smith-Njigba'));
  assert.equal(playerKey('Puka Nacua', 'LAR'), playerKey('Puka Nacua', 'LA'));
  assert.notEqual(playerKey('Josh Allen', 'BUF'), playerKey('Josh Allen', 'JAX'));
  const wk = { ESPN: { mine: [{ name: 'Luther Burden III', pos: 'WR', team: 'CHI', eid: 7 }], opp: [] }, Sleeper: { mine: [{ name: 'Luther Burden', pos: 'WR', team: 'CHI', sid: '99' }], opp: [] } };
  const { games } = groupByGame(5, wk, 0, ['ESPN', 'Sleeper']);
  const all = games.flatMap(g => g.mine);
  assert.equal(all.length, 1);
  assert.deepEqual([all[0].name, all[0].sid, all[0].eid, all[0].leagues], ['Luther Burden III', '99', 7, ['ESPN', 'Sleeper']]);
});
