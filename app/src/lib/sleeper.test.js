import test from 'node:test';
import assert from 'node:assert/strict';
import { leagueScore, pickLeague } from './sleeper.js';

test('matches short names in the ways Sleeper leagues tend to be named', () => {
  for (const name of ['DFL', 'DFL 2026', '🏈 DFL Dynasty', 'Dynasty Football League', 'The Dynasty Football League',
    'Dynasty Fantasy League 2026', 'DynastyFootballLeague', 'D.F.L.', 'Degens of Fantasy League']) {
    assert.ok(leagueScore(name, 'DFL') > 0, name);
  }
  assert.equal(leagueScore('Rivals Dynasty League', 'DFL'), 0);
  assert.ok(leagueScore('Rivals Dynasty League', 'RDL') > 0);
});

test('prefers the closest match and skips leagues already linked', () => {
  const list = [
    { league_id: '1', name: 'Rivals Dynasty League' },
    { league_id: '2', name: 'Dynasty Football League' },
    { league_id: '3', name: 'Work Pickem' }
  ];
  assert.equal(pickLeague(list, 'DFL').league_id, '2');
  assert.equal(pickLeague(list, 'RDL').league_id, '1');
  assert.equal(pickLeague(list, 'DFL', ['2']), null);
});

test('refuses to guess between two equally good matches', () => {
  const list = [{ league_id: '1', name: 'DFL' }, { league_id: '2', name: 'DFL Keeper' }];
  assert.equal(pickLeague(list, 'DFL'), null);
});
