import test from 'node:test';
import assert from 'node:assert/strict';
import { statusOf, buildInjuryLookup, injuryFor } from './injuries.js';
import { alertKey, alertSummary, lineupAlerts } from './alerts.js';

const SAT = Date.parse('2026-10-10T15:00:00Z');                    // week 5, before Sunday's games
const sleeper = {
  '1': { first_name: 'Davante', last_name: 'Adams', team: 'LAR', position: 'WR', injury_status: 'Questionable', injury_body_part: 'Hamstring' },
  '2': { first_name: 'Cam', last_name: 'Skattebo', team: 'NYG', position: 'RB', injury_status: 'Out', injury_body_part: 'Knee' },
  '3': { first_name: 'Healthy', last_name: 'Guy', team: 'NYG', position: 'WR', injury_status: null },
  '4': { first_name: 'Retired', last_name: 'Guy', team: null, position: 'WR', injury_status: 'Out' },
  '5': { first_name: 'Lamar', last_name: 'Jackson', team: 'BAL', position: 'QB', injury_status: 'Doubtful' },
  '6': { first_name: 'Reserve', last_name: 'Back', team: 'DAL', position: 'RB', injury_status: 'IR' }
};
const inj = buildInjuryLookup(sleeper, SAT);

test('reads Sleeper statuses into out, doubtful and questionable', () => {
  assert.deepEqual(statusOf(sleeper['1']), { kind: 'questionable', label: 'Questionable', part: 'Hamstring' });
  assert.equal(statusOf(sleeper['2']).kind, 'out');
  assert.equal(statusOf(sleeper['5']).kind, 'doubtful');
  assert.equal(statusOf(sleeper['6']).label, 'IR');
  assert.equal(statusOf(sleeper['3']), null);
  assert.equal(statusOf({ injury_status: 'Sus' }).label, 'Suspended');
});

test('keeps only players with a status, and finds them by Sleeper id or by name and team', () => {
  assert.deepEqual(Object.keys(inj.byId).sort(), ['1', '2', '5', '6']);        // no healthy players, none without a team
  assert.equal(injuryFor(inj, { name: 'Davante Adams', pos: 'WR', team: 'LA' }).kind, 'questionable');   // LAR = LA
  assert.equal(injuryFor(inj, { name: 'x', pos: 'RB', team: 'NYG', sid: '2' }).label, 'Out');
  assert.equal(injuryFor(inj, { name: 'Giants D/ST', pos: 'DEF', team: 'NYG' }), null);
  assert.equal(injuryFor(null, { name: 'x', pos: 'WR', team: 'LA' }), null);
});

const wk = {
  Alpha: { mine: [{ name: 'Davante Adams', pos: 'WR', team: 'LA' }, { name: 'Cam Skattebo', pos: 'RB', team: 'NYG' }, { name: 'Bye Guy', pos: 'WR', team: 'ZZZ' }, { name: 'Healthy Guy', pos: 'WR', team: 'NYG' }],
           opp: [{ name: 'Lamar Jackson', pos: 'QB', team: 'BAL' }, { name: 'Davante Adams', pos: 'WR', team: 'LA' }] },
  Beta: { mine: [{ name: 'Cam Skattebo', pos: 'RB', team: 'NYG' }], opp: [] }
};

test('flags your out, doubtful and questionable starters and byes, worst first, with every league they are in', () => {
  const a = lineupAlerts(5, wk, ['Alpha', 'Beta'], inj, {}, SAT);
  const mine = a.filter(x => x.side === 'mine');
  assert.deepEqual(mine.map(x => x.kind), ['bye', 'out', 'questionable']);
  const skat = mine.find(x => x.player.name === 'Cam Skattebo');
  assert.deepEqual(skat.leagues, ['Alpha', 'Beta']);                          // one entry for two leagues
  assert.equal(skat.part, 'Knee');
  assert.match(skat.when, /^Sun /);
});

test('the same problems on your opponent\'s side are good news, but only the serious ones', () => {
  const a = lineupAlerts(5, wk, ['Alpha'], inj, {}, SAT);
  const theirs = a.filter(x => x.side === 'opp');
  assert.deepEqual(theirs.map(x => x.player.name), ['Lamar Jackson']);          // doubtful counts; a questionable opponent does not
  assert.equal(a.indexOf(theirs[0]) > a.indexOf(a.find(x => x.side === 'mine')), true);   // yours come first
});

test('skips games that are over and keys alerts the way the Games screen can look them up', () => {
  const later = Date.parse('2026-10-13T12:00:00Z');                               // Tuesday: everything is final
  assert.deepEqual(lineupAlerts(5, wk, ['Alpha'], inj, {}, later).filter(x => x.kind !== 'bye'), []);
  assert.equal(alertKey('mine', { name: 'Cam Skattebo', team: 'NYG' }), 'mine:NYG|cam skattebo');
});

test('summarizes your own problems per league', () => {
  const s = alertSummary(lineupAlerts(5, wk, ['Alpha', 'Beta'], inj, {}, SAT));
  assert.equal(s.mine, 3);
  assert.equal(s.serious, 2);
  assert.equal(s.theirs, 1);
  assert.deepEqual(s.byLeague, { Alpha: 3, Beta: 1 });
});

import { applyChecks } from './alerts.js';
test('checked-off alerts hide until they get worse', () => {
  const a = (key, severity) => ({ key, severity });
  const r = applyChecks([a('x', 1), a('y', 1), a('z', 3)], { x: 1, z: 1 });
  assert.deepEqual(r.checked.map(v => v.key), ['x']);          // still Questionable: stays checked
  assert.deepEqual(r.open.map(v => v.key), ['y', 'z']);        // z went Q -> Out: back on the list
});

test('drops a player from the list once his game has started', () => {
  const board = { 'BUF@LA': { state: 'in' } };
  const only = { Alpha: { mine: [{ name: 'Davante Adams', pos: 'WR', team: 'LA' }], opp: [] } };
  assert.equal(lineupAlerts(5, only, ['Alpha'], inj, {}, SAT).length, 1);
  const kicked = Date.parse('2026-10-13T00:30:00Z');                            // Monday night, just after kickoff
  const after = lineupAlerts(5, only, ['Alpha'], inj, board, kicked);
  assert.equal(after.length, 0);
});
