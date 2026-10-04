import test from 'node:test';
import assert from 'node:assert/strict';
import { espnStarters } from './espn.js';
import { syncSleeper } from './sleeper.js';
import { fmtPts, groupByGame } from './games.js';

test('ESPN starters carry their points for the week', () => {
  const side = { rosterForCurrentScoringPeriod: { entries: [
    { lineupSlotId: 0, playerPoolEntry: { appliedStatTotal: 21.36, player: { id: 1, fullName: 'Jaxson Dart', defaultPositionId: 1, proTeamId: 19 } } },
    { lineupSlotId: 2, playerPoolEntry: { player: { id: 2, fullName: 'Breece Hall', defaultPositionId: 2, proTeamId: 20,
      stats: [{ statSourceId: 1, statSplitTypeId: 1, scoringPeriodId: 3, appliedTotal: 99 }, { statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: 3, appliedTotal: 14.2 }] } } },
    { lineupSlotId: 4, playerPoolEntry: { player: { id: 3, fullName: 'No Stats', defaultPositionId: 3, proTeamId: 1 } } }
  ] } };
  const res = espnStarters(side, 3);
  assert.equal(res[0].pts, 21.36);
  assert.equal(res[1].pts, 14.2);
  assert.equal(res[2].pts, undefined);
});

test('Sleeper sync returns player points, defenses included, and both totals', async () => {
  const data = {
    'user/me': { user_id: 'u1' },
    'league/L/rosters': [{ roster_id: 1, owner_id: 'u1' }, { roster_id: 2, owner_id: 'x' }],
    'league/L/matchups/3': [
      { roster_id: 1, matchup_id: 9, starters: ['4984', 'PIT', '0'], players_points: { '4984': 24.5, PIT: 7, '999': 3 }, points: 31.5, custom_points: null },
      { roster_id: 2, matchup_id: 9, starters: ['6794'], players_points: { '6794': 12.1 }, points: 12.1 }
    ],
    'players/nfl': { '4984': { first_name: 'Josh', last_name: 'Allen', position: 'QB', team: 'BUF' }, '6794': { first_name: 'Justin', last_name: 'Jefferson', position: 'WR', team: 'MIN' } }
  };
  globalThis.fetch = async url => {
    const key = url.replace('https://api.sleeper.app/v1/', '');
    return new Response(JSON.stringify(data[key]), { status: data[key] ? 200 : 404 });
  };
  const res = await syncSleeper('me', 'L', 3);
  assert.deepEqual(res.mine.map(p => [p.n, p.pts]), [['Josh Allen', 24.5], ['Steelers D/ST', 7]]);
  assert.deepEqual(res.opp.map(p => [p.n, p.pts]), [['Justin Jefferson', 12.1]]);
  assert.deepEqual(res.score, { mine: 31.5, opp: 12.1 });
});

test('a player started in two leagues keeps each league\'s points', () => {
  const wk = {
    RDL: { mine: [{ name: 'CeeDee Lamb', pos: 'WR', team: 'DAL', pts: 18.4 }], opp: [] },
    DFL: { mine: [{ name: 'CeeDee Lamb', pos: 'WR', team: 'DAL', pts: 22.1 }], opp: [] }
  };
  const p = groupByGame(1, wk, 0).games[0].mine[0];
  assert.deepEqual(p.pts, { RDL: 18.4, DFL: 22.1 });
});

test('points format like the fantasy apps', () => {
  assert.equal(fmtPts(18), '18');
  assert.equal(fmtPts(18.4), '18.4');
  assert.equal(fmtPts(18.416), '18.42');
  assert.equal(fmtPts(-1.5), '-1.5');
});
