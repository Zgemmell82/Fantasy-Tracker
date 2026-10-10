import test from 'node:test';
import assert from 'node:assert/strict';
import { gameState, leagueRemaining, mondayGames } from './remaining.js';

const sun = Date.parse('2026-10-11T23:00:00Z');      // Sunday evening of week 5
const tue = Date.parse('2026-10-13T12:00:00Z');      // after Monday night
const lineup = {
  mine: [{ name: 'A', pos: 'QB', team: 'WAS' }, { name: 'B', pos: 'WR', team: 'LA' }, { name: 'Bye', pos: 'RB', team: 'ZZZ' }],
  opp: [{ name: 'C', pos: 'WR', team: 'BUF' }, { name: 'D', pos: 'TE', team: 'NYG' }]
};

test('finds the Monday night game from the Eastern-time weekday', () => {
  assert.deepEqual(mondayGames(5).map(g => g.a + '@' + g.h), ['BUF@LA']);
  assert.deepEqual(mondayGames(18), []);
});

test('counts who is left to play: unfinished games only, byes excluded', () => {
  const r = leagueRemaining(5, lineup, {}, sun);
  assert.equal(r.mine.left, 1);   // WAS game is over by Sunday night; only LA (Monday) is left
  assert.equal(r.opp.left, 1);    // NYG done, BUF still to play
  assert.equal(r.mine.total, 3);
});

test('lists who is left in the Monday night game for and against', () => {
  const r = leagueRemaining(5, lineup, {}, sun);
  assert.deepEqual(r.monday.mine.map(p => p.name), ['B']);
  assert.deepEqual(r.monday.opp.map(p => p.name), ['C']);
});

test('nobody is left once everything is final', () => {
  const r = leagueRemaining(5, lineup, {}, tue);
  assert.equal(r.mine.left + r.opp.left, 0);
  assert.deepEqual(r.monday, { mine: [], opp: [] });
});

test('ESPN\'s game state wins over the clock and live players are counted', () => {
  const board = { 'BUF@LA': { state: 'in' }, 'NYG@WAS': { state: 'post' } };
  const r = leagueRemaining(5, lineup, board, sun);
  assert.equal(r.mine.live, 1);
  assert.equal(gameState({ a: 'NYG', h: 'WAS', t: '2026-10-11T17:00:00Z' }, board, 0), 'post');
});
