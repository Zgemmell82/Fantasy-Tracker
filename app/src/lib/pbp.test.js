import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScoreboard, parsePlays, matchPlays, nameRe, roleOf, boardFor, nextPollMs, mergeBoards } from './pbp.js';

const team = (id, abbreviation, homeAway, score) => ({ homeAway, score, team: { id, abbreviation } });
let n = 0;
const play = (text, extra = {}) => ({ id: String(++n), sequenceNumber: String(n), text, period: { number: 1 }, clock: { displayValue: '10:00' }, start: { team: { id: '2' }, downDistanceText: '1st & 10 at BUF 25' }, homeScore: 0, awayScore: 0, ...extra });

const summary = { header: { competitions: [{ competitors: [team('2', 'BUF', 'home'), team('24', 'LAC', 'away')] }] }, drives: { previous: [{ team: { abbreviation: 'BUF' }, plays: [
  play('(Shotgun) J.Allen pass short right to K.Coleman to BUF 34 for 9 yards (D.James).', { statYardage: 9, type: { text: 'Pass Reception' } }),
  play('J.Cook up the middle to LAC 3 for 22 yards (J.Doe).', { statYardage: 22, type: { text: 'Rush' } }),
  play('J.Allen pass short left to D.Kincaid for 3 yards, TOUCHDOWN. T.Bass extra point is GOOD, Center-R.Ferguson, Holder-S.Martin.', { statYardage: 3, scoringPlay: true, homeScore: 7, type: { text: 'Passing Touchdown' } }),
  play('(Shotgun) J.Allen sacked at BUF 20 for -8 yards (K.Mack).', { statYardage: -8, homeScore: 7, type: { text: 'Sack' } }),
  play('J.Allen pass deep middle intended for K.Coleman INTERCEPTED by D.James at LAC 10.', { homeScore: 7, type: { text: 'Pass Interception Return' } }),
  play('T.Bass 52 yard field goal is GOOD, Center-R.Ferguson, Holder-S.Martin.', { scoringPlay: true, homeScore: 10, type: { text: 'Field Goal Good' } })
] }] } };

test('parses plays with scores and who scored', () => {
  const { plays, home, away } = parsePlays(summary);
  assert.equal(home, 'BUF'); assert.equal(away, 'LAC');
  assert.equal(plays.length, 6);
  assert.equal(plays[2].scoredBy, 'BUF');
  assert.equal(plays[3].scoredBy, '');
  assert.equal(plays[0].offense, 'BUF');
});

test('matches tracked players and estimates half-PPR points', () => {
  const { plays } = parsePlays(summary);
  const tracked = [
    { uid: 'f:allen', name: 'Josh Allen', pos: 'QB', team: 'BUF', side: 'mine', leagues: ['RDL'] },
    { uid: 'a:cook', name: 'James Cook III', pos: 'RB', team: 'BUF', side: 'opp', leagues: ['DFL'] },
    { uid: 'a:kincaid', name: 'Dalton Kincaid', pos: 'TE', team: 'BUF', side: 'opp', leagues: ['DFL'] },
    { uid: 'f:bass', name: 'Tyler Bass', pos: 'K', team: 'BUF', side: 'mine', leagues: ['RDL'] },
    { uid: 'f:lac', name: 'Chargers D/ST', pos: 'DEF', team: 'LAC', side: 'mine', leagues: ['DFL'] }
  ];
  const m = matchPlays(plays, tracked);
  const est = i => Object.fromEntries(m[i].hits.map(h => [h.uid, h.est]));
  assert.deepEqual(est(0), { 'f:allen': 0.4 });                         // 9 yd completion
  assert.deepEqual(est(1), { 'a:cook': 2.2 });                          // 22 yd rush
  assert.deepEqual(est(2), { 'f:allen': 4.1, 'a:kincaid': 6.8, 'f:bass': 1 }); // TD pass + XP
  assert.equal(m[2].badge, 'TD');
  assert.deepEqual(est(3), { 'f:allen': 0, 'f:lac': 1 });               // sack
  assert.deepEqual(est(4), { 'f:allen': -2, 'f:lac': 2 });              // interception
  assert.equal(m[4].badge, 'INT');
  assert.deepEqual(est(5), { 'f:bass': 5 });                            // 52 yd FG
  assert.equal(m[5].badge, 'FG');
});

test('name patterns cope with ESPN abbreviations', () => {
  const re = s => new RegExp(nameRe(s));
  assert.ok(re("Ja'Marr Chase").test('Ja.Chase 12 yard pass'));
  assert.ok(re('Amon-Ra St. Brown').test('pass to A.St. Brown for 8 yards'));
  assert.ok(re('A.J. Brown').test('pass to A.Brown for 8 yards'));
  assert.ok(!re('A.J. Brown').test('pass to A.Browning for 8 yards'));
  assert.equal(roleOf('B.Aubrey 45 yard field goal is GOOD', nameRe('Brandon Aubrey')), 'kicker');
});

test('scoreboard gives live score, clock and game id keyed like the schedule', () => {
  const sb = parseScoreboard({ events: [{ id: '401', competitions: [{
    competitors: [team('2', 'BUF', 'home', '21'), team('28', 'WSH', 'away', '17')],
    status: { type: { state: 'in', shortDetail: '4:12 - 3rd' } },
    situation: { downDistanceText: '2nd & 7 at WSH 30', possession: '28' }
  }] }] });
  assert.deepEqual(Object.keys(sb), ['WAS@BUF']);
  assert.equal(sb['WAS@BUF'].homeScore, 21);
  assert.equal(sb['WAS@BUF'].possession, 'WAS');
  assert.equal(sb['WAS@BUF'].state, 'in');
});

test('a game listed home/away the other way round is still found, with its teams and score turned around', () => {
  const board = { 'JAX@PHI': { id: '9', state: 'in', away: 'JAX', home: 'PHI', awayScore: 3, homeScore: 7 } };
  assert.equal(boardFor(board, 'JAX@PHI').id, '9');
  const swapped = boardFor(board, 'PHI@JAX');                       // the schedule says PHI at JAX
  assert.deepEqual([swapped.away, swapped.home, swapped.awayScore, swapped.homeScore], ['PHI', 'JAX', 7, 3]);
  assert.equal(boardFor(board, 'DAL@NYG'), undefined);
});

test('keeps polling the scoreboard before kickoff so a game that starts later is noticed', () => {
  const KICK = Date.parse('2026-10-11T13:30:00Z');                  // week 5, PHI at JAX
  const pre = { 'PHI@JAX': { state: 'pre' } };
  assert.equal(nextPollMs(pre, 5, KICK - 10 * 60000), 30000);       // about to start
  assert.equal(nextPollMs(pre, 5, KICK + 5 * 60000), 30000);        // started, scoreboard still says pre
  assert.equal(nextPollMs({ 'PHI@JAX': { state: 'in' } }, 5, KICK + 60000), 30000);
  assert.equal(nextPollMs(pre, 5, Date.parse('2026-10-09T12:00:00Z')), 300000);   // two days out
  assert.equal(nextPollMs({}, 5, Date.parse('2026-10-14T12:00:00Z')), null);      // week is over
});

test('merges in games a second scoreboard knows about, without duplicating swapped ones', () => {
  const out = mergeBoards({ 'A@B': { id: '1' } }, { 'B@A': { id: '2' }, 'C@D': { id: '3' } });
  assert.deepEqual(Object.keys(out).sort(), ['A@B', 'C@D']);
});

test('reads plays from a flat plays list when a live summary has no drives', () => {
  const r = parsePlays({
    header: { competitions: [{ competitors: [{ homeAway: 'home', team: { id: '30', abbreviation: 'JAX' } }, { homeAway: 'away', team: { id: '21', abbreviation: 'PHI' } }] }] },
    plays: [{ id: '1', sequenceNumber: '1', period: { number: 1 }, clock: { displayValue: '15:00' }, text: 'J.Hurts pass short left to D.Smith for 8 yards', team: { id: '21' } }]
  });
  assert.equal(r.plays.length, 1);
  assert.equal(r.plays[0].offense, 'PHI');
  assert.equal(r.home, 'JAX');
});
