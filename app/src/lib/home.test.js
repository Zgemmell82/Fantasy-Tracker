import test from 'node:test';
import assert from 'node:assert/strict';
import { leagueGlance } from './home.js';

const o = (extra = {}) => ({ me: 50, them: 40, diff: 10, wp: 0.5, done: false, approx: false, mine: [{ mean: 20 }], opp: [{ mean: 30 }], ...extra });

test('projected totals add what is left to the score so far', () => {
  const g = leagueGlance(o(), true);
  assert.deepEqual([g.myProj, g.themProj], [70, 70]);
  assert.equal(g.tone, 'close');
});

test('winning, losing and close follow the win chance', () => {
  assert.equal(leagueGlance(o({ wp: 0.8 }), true).label, 'Winning');
  assert.equal(leagueGlance(o({ wp: 0.2 }), true).label, 'Projected loss');   // ahead now, expected to fall behind
  assert.equal(leagueGlance(o({ wp: 0.2, diff: -5 }), true).label, 'Losing');
  assert.equal(leagueGlance(o({ wp: 0.8, diff: -5 }), true).label, 'Projected win');
  assert.equal(leagueGlance(o({ wp: 0.5 }), true).label, 'Close');
});

test('finished, scoreless and empty leagues are labelled plainly', () => {
  assert.equal(leagueGlance(o({ done: true, diff: -3, mine: [], opp: [] }), true).label, 'Lost');
  assert.equal(leagueGlance(o({ approx: true }), true).label, 'No scores yet');
  assert.equal(leagueGlance(o(), false).label, 'No matchup yet');
});
