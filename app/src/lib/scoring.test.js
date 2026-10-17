import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES, espnRules, formatOf, leagueRules, rulesFor, sleeperRules } from './scoring.js';
import { estimate, matchPlays, nameRe } from './pbp.js';

test('reads Sleeper scoring settings, falling back to defaults for what is missing', () => {
  const r = sleeperRules({ rec: 1, pass_td: 6, rush_yd: 0.1, bonus_rec_te: 0.5, fum_lost: -1 });
  assert.deepEqual([r.rec, r.passTd, r.fumLost, r.teRec, r.rushTd], [1, 6, -1, 0.5, 6]);
  assert.equal(formatOf(r), 'ppr');
  assert.equal(rulesFor(r, 'TE').rec, 1.5);
  assert.equal(rulesFor(r, 'WR').rec, 1);
  assert.equal(sleeperRules(null), null);
});

test('reads ESPN scoring items by stat id', () => {
  const r = espnRules([{ statId: 53, points: 0.5 }, { statId: 4, points: 6 }, { statId: 20, points: -1 }, { statId: 99, points: 5 }]);
  assert.deepEqual([r.rec, r.passTd, r.passInt, r.rushTd], [0.5, 6, -1, 6]);
  assert.equal(formatOf(r), 'half');
  assert.equal(espnRules([]), null);
});

test('play estimates follow the league\'s rules', () => {
  const play = { text: 'J.Allen pass short right to K.Coleman for 20 yards, TOUCHDOWN', yards: 20, scoring: true, scoredBy: 'BUF', offense: 'BUF', type: '' };
  const re = nameRe('Josh Allen'), reRec = nameRe('Keon Coleman');
  assert.equal(estimate(play, re, 'passer'), 4.8);                                      // 20 x .04 + 4
  assert.equal(estimate(play, re, 'passer', { ...DEFAULT_RULES, passTd: 6 }), 6.8);     // 6-point passing TDs
  assert.equal(estimate(play, reRec, 'receiver'), 8.5);                                 // .5 + 2 + 6
  assert.equal(estimate(play, reRec, 'receiver', { ...DEFAULT_RULES, rec: 1 }), 9);     // full PPR
  assert.equal(estimate(play, reRec, 'receiver', { ...DEFAULT_RULES, rec: 0 }), 8);     // standard
});

test('a player in two leagues is scored under each league\'s rules', () => {
  const play = { id: '1', text: 'J.Allen pass short right to K.Coleman for 20 yards, TOUCHDOWN', yards: 20, scoring: true, scoredBy: 'BUF', offense: 'BUF', type: '' };
  const tracked = [{ uid: 'c', name: 'Keon Coleman', pos: 'WR', team: 'BUF', side: 'mine', leagues: ['Half', 'Ppr'] }];
  const [m] = matchPlays([play], tracked, { Half: { ...DEFAULT_RULES, rec: 0.5 }, Ppr: { ...DEFAULT_RULES, rec: 1 } });
  assert.deepEqual(m.hits[0].byLeague, { Half: 8.5, Ppr: 9 });
  assert.equal(m.hits[0].mixed, true);
});

test('a format chosen under Source overrides detected receptions only', () => {
  const lineup = { rules: { ...DEFAULT_RULES, rec: 0.5, passTd: 6 } };
  assert.deepEqual([leagueRules(lineup, { scoring: 'ppr' }).rec, leagueRules(lineup, { scoring: 'ppr' }).passTd], [1, 6]);
  assert.equal(leagueRules({ scoring: 'std' }, null).rec, 0);
  assert.equal(leagueRules({}, null), undefined);
});
