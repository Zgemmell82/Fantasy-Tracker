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

import { idpPoints } from './pbp.js';
import { IDP_RULES, isIdp } from './scoring.js';
test('individual defensive players score tackles, sacks, takeaways and more', () => {
  const pl = (text, extra = {}) => ({ text, offense: 'HST', scoredBy: '', yards: null, ...extra });
  const re = n => nameRe(n);
  // solo and assisted tackles
  assert.equal(idpPoints(pl('(Shotgun) T.Lawrence pass short right to B.Strange for 6 yards (D.Stingley; A.Al-Shaair).'), re('Derek Stingley')), 0.75);
  assert.equal(idpPoints(pl('J.Mixon right guard for 3 yards (A.Al-Shaair).'), re('Azeez Al-Shaair')), 1.5);
  // tackle for loss adds .5
  assert.equal(idpPoints(pl('J.Mixon right guard for -2 yards (A.Al-Shaair).', { yards: -2 }), re('Azeez Al-Shaair')), 2);
  // sacks: full for one name, split between two
  assert.equal(idpPoints(pl('C.Stroud sacked at HST 20 for -8 yards (A.Donald).', { yards: -8 }), re('Aaron Donald')), 2.5);
  assert.equal(idpPoints(pl('C.Stroud sacked at HST 20 for -8 yards (A.Donald; V.Epenesa).', { yards: -8 }), re('Aaron Donald')), 1.25);
  // pass defensed, interception, touchdown
  assert.equal(idpPoints(pl('T.Lawrence pass incomplete deep left to B.Strange, defended by K.Lassiter.'), re('Kamari Lassiter')), 2);
  assert.equal(idpPoints(pl('C.Stroud pass INTERCEPTED by D.Lamb at JAX 40 for 40 yards, TOUCHDOWN', { scoredBy: 'JAX', offense: 'HST' }), re('Dane Lamb')), 11);
  // forced fumble and recovery
  const fum = 'J.Mixon right guard for 3 yards (D.Lloyd). FUMBLES (D.Lloyd), RECOVERED by JAX-A.Smith at HST 41.';
  assert.equal(idpPoints(pl(fum), re('Devin Lloyd')), 4);
  assert.equal(idpPoints(pl(fum), re('Andre Smith')), 3);
  assert.equal(idpPoints(pl('nothing about him'), re('Zed Nobody')), 0);
  assert.equal(isIdp('LB'), true);
  assert.equal(isIdp('WR'), false);
  assert.equal(IDP_RULES.sack, 2.5);
});

test('a linebacker in your lineup earns points from the plays he is in', async () => {
  const { matchPlays: mp } = await import('./pbp.js');
  const tracked = [{ uid: 'lb', name: 'Azeez Al-Shaair', pos: 'LB', team: 'HST', side: 'mine', leagues: ['A'] }];
  const play = { id: '1', seq: 1, text: 'J.Mixon right guard for 3 yards (A.Al-Shaair).', type: '', offense: 'JAX', scoredBy: '', yards: 3 };
  const [m] = mp([play], tracked);
  assert.deepEqual([m.hits[0].role, m.hits[0].est], ['defender', 1.5]);
});
