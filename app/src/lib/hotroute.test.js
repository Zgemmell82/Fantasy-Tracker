import test from 'node:test';
import assert from 'node:assert/strict';
import { boomOf, fractionLeft, hotRoute, leagueOutlook, overBy, phi } from './hotroute.js';

// Week 5: Sunday games are over by Monday morning; Monday night is BUF @ LA.
const MON = Date.parse('2026-10-12T14:00:00Z');
const star = { name: 'Star Wideout', pos: 'WR', team: 'LA' };       // plays Monday night
const done = { name: 'Already Played', pos: 'RB', team: 'WAS' };    // played Sunday

test('normal curve', () => {
  assert.ok(Math.abs(phi(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(phi(1) - 0.8413) < 1e-3);
  assert.ok(Math.abs(phi(-1.96) - 0.025) < 1e-3);
});

test('how much of a game is left', () => {
  const g = { a: 'BUF', h: 'LA', t: '2026-10-13T00:15:00Z' };
  assert.equal(fractionLeft(g, null, Date.parse('2026-10-12T20:00:00Z')), 1);
  assert.equal(fractionLeft(g, { state: 'post' }, MON), 0);
  assert.ok(Math.abs(fractionLeft(g, { state: 'in', period: 3, clock: 900 }, MON) - 0.5) < 1e-9);
  assert.ok(fractionLeft(g, { state: 'in', period: 5, clock: 400 }, MON) < 0.05);
});

test('win probability from the score and what is left', () => {
  const dead = leagueOutlook(5, { mine: [done], opp: [done], score: { mine: 100, opp: 90 } }, {}, MON);
  assert.equal(dead.wp, 1);
  assert.equal(dead.done, true);
  const even = leagueOutlook(5, { mine: [star], opp: [], score: { mine: 70, opp: 81 } }, {}, MON);   // down 11, a WR left (avg 11)
  assert.ok(Math.abs(even.wp - 0.5) < 0.02);
});

test('a player against you in a league you are cruising in is still a root-for if he helps you elsewhere', () => {
  const wk = {
    Down: { mine: [star], opp: [], score: { mine: 70, opp: 81 } },        // down 11, he is mine: a big game wins it
    Cruising: { mine: [done], opp: [star], score: { mine: 150, opp: 70 } } // up 80, he is theirs: it barely matters
  };
  const r = hotRoute(5, wk, ['Down', 'Cruising'], {}, MON);
  assert.equal(r.rootFor.length, 1);
  assert.equal(r.rootFor[0].player.name, 'Star Wideout');
  assert.ok(r.rootFor[0].net > 0.25);
  assert.equal(r.rootAgainst.length, 0);
  const lines = Object.fromEntries(r.rootFor[0].lines.map(l => [l.league, l]));
  assert.ok(lines.Down.swing > 0.25 && Math.abs(lines.Cruising.swing) < 0.01);
});

test('equal stakes on both sides cancel out', () => {
  const wk = {
    A: { mine: [star], opp: [], score: { mine: 70, opp: 81 } },
    B: { mine: [], opp: [star], score: { mine: 81, opp: 70 } }          // same spot from the other side
  };
  const r = hotRoute(5, wk, ['A', 'B'], {}, MON);
  assert.equal(r.rootFor.length + r.rootAgainst.length, 0);
  assert.equal(r.wash.length, 1);
});

test('against you in a dead-even matchup and nowhere else: root against', () => {
  const mine = { name: 'My WR', pos: 'WR', team: 'BUF' };           // also plays Monday night
  const r = hotRoute(5, { A: { mine: [mine], opp: [star], score: { mine: 80, opp: 80 } } }, ['A'], {}, MON);
  assert.equal(r.rootAgainst.length, 1);
  assert.equal(r.rootAgainst[0].player.name, 'Star Wideout');
  assert.ok(r.rootAgainst[0].net < -0.15);
  assert.equal(r.rootFor[0].player.name, 'My WR');
});

test('players whose games are over are left out, and by-hand leagues are marked approximate', () => {
  const r = hotRoute(5, { A: { mine: [done], opp: [done], score: { mine: 5, opp: 4 } }, H: { mine: [star], opp: [] } }, ['A', 'H'], {}, MON);
  assert.ok(r.rootFor.every(x => x.player.name !== 'Already Played'));
  assert.equal(r.leagues[1].approx, true);
  assert.equal(r.leagues[0].approx, false);
});

test('a strong projection makes a player matter more than the position average', () => {
  const wk = { A: { mine: [star], opp: [], score: { mine: 70, opp: 81 } } };      // down 11
  const avg = hotRoute(5, wk, ['A'], {}, MON);
  const lookup = { byId: {}, byTeam: {}, byName: {}, count: 1 };
  lookup.byName['star wideout|LA'] = [20, 22, 24];                               // projected well above the 11-point WR average
  const proj = hotRoute(5, wk, ['A'], {}, MON, lookup);
  assert.equal(proj.leagues[0].projectedLeft, 1);
  assert.equal(avg.leagues[0].projectedLeft, 0);
  assert.ok(proj.leagues[0].wp > avg.leagues[0].wp + 0.2);                       // he's expected to erase the deficit and then some
});

test('projections use the league scoring', () => {
  const lookup = { byId: {}, byTeam: {}, count: 1, byName: { 'star wideout|LA': [8, 10, 12] } };
  const mk = scoring => leagueOutlook(5, { mine: [star], opp: [], score: { mine: 0, opp: 0 }, scoring }, {}, MON, lookup).exp;
  assert.ok(mk('ppr') > mk('half') && mk('half') > mk('std'));
  assert.ok(Math.abs(mk(undefined) - mk('half')) < 1e-9);                        // no scoring recorded: half-PPR
});

test('boom: at least 120% of the projection and 5 points over it', () => {
  assert.equal(boomOf(25, 19.8), true);       // +26% and +5.2
  assert.equal(boomOf(24, 19.8), false);      // +21% but only +4.2
  assert.equal(boomOf(5, 3), false);          // +67% but only +2: low projections don't count
  assert.equal(boomOf(30, null), false);      // no projection, no boom
  assert.ok(Math.abs(overBy(22, 20) - 0.1) < 1e-9);
  assert.equal(overBy(null, 20), null);
});

test('each line carries the live score, the projection in that league\'s scoring, and the boom flag', () => {
  const lookup = { byId: {}, byTeam: {}, byName: { 'star wideout|LA': [8, 10, 12] } };
  const lg = scoring => ({ mine: [{ ...star, pts: 18 }], opp: [], score: { mine: 18, opp: 40 }, scoring });
  const live = { 'BUF@LA': { state: 'in', period: 3, clock: 900 } };      // his game is under way
  const hr = hotRoute(5, { Half: lg('half'), Ppr: lg('ppr') }, ['Half', 'Ppr'], live, MON, lookup);
  const row = hr.boom[0];
  const [half, ppr] = row.lines;
  assert.deepEqual([half.proj, half.boom], [10, true]);       // 18 vs 10: +80%
  assert.deepEqual([ppr.proj, ppr.boom], [12, true]);         // 18 vs 12: +50%, +6
  assert.ok(Math.abs(half.over - 0.8) < 1e-9);
});

test('the swing is what happens if he scores his boom number, and the boom number is 120% of projection or +5', async () => {
  const { boomPoints } = await import('./hotroute.js');
  assert.equal(boomPoints(20), 25);       // +5 beats 120% (24)
  assert.equal(boomPoints(30), 36);       // 120% beats +5
  const lookup = { byId: {}, byTeam: {}, byName: { 'star wideout|LA': [8, 10, 12] } };
  const half = hotRoute(5, { A: { mine: [star], opp: [], score: { mine: 70, opp: 81 }, scoring: 'half' }, B: { mine: [star], opp: [], score: { mine: 70, opp: 81 }, scoring: 'ppr' } }, ['A', 'B'], {}, MON, lookup);
  const [a, b] = half.forPool[0].lines;
  assert.deepEqual([a.boomPts, b.boomPts], [15, 17]);      // 10 -> 15, 12 -> 17: the higher one is what the row shows
  assert.ok(a.swing > 0 && b.swing > 0);
});

import { buildHistory, boomLean } from './history.js';
test('players who boomed more often earlier count a little more, never beyond +/-25%', () => {
  const h = new Map([['LA|star wideout', { games: 4, hits: 3 }], ['LA|dud', { games: 4, hits: 0 }], ['LA|new guy', { games: 1, hits: 1 }]]);
  assert.ok(boomLean(h, 'LA|star wideout').mult > 1.15);
  assert.ok(boomLean(h, 'LA|dud').mult < 0.9);
  assert.equal(boomLean(h, 'LA|new guy').mult, 1);          // one game isn't a pattern
  assert.equal(boomLean(null, 'x').mult, 1);
  assert.ok(boomLean(new Map([['k', { games: 10, hits: 10 }]]), 'k').mult <= 1.25);
});

test('earlier weeks\' Boom data: who beat that week\'s own projection by 120% and +5', () => {
  const wkData = pts => ({ A: { scoring: 'half', mine: [{ name: 'Star Wideout', team: 'LA', pts }], opp: [] } });
  const lookups = { 1: { byId: {}, byTeam: {}, byName: { 'star wideout|LA': [8, 10, 12] } }, 2: { byId: {}, byTeam: {}, byName: { 'star wideout|LA': [8, 10, 12] } } };
  const data = { 1: wkData(18), 2: wkData(11), 3: wkData(30), 5: wkData(99) };       // week 3 has no projections saved; week 5 is now
  const h = buildHistory(data, 5, ['A'], lookups);
  assert.deepEqual(h.get('LA|star wideout'), { games: 2, hits: 1 });                  // week 1: 18 vs 10 is a boom; week 2: 11 is not
});

test('a boom-prone player outranks an identical one without that history', () => {
  const lineup = { A: { mine: [star], opp: [], score: { mine: 70, opp: 81 } } };
  const plain = hotRoute(5, lineup, ['A'], {}, MON).forPool[0].net;
  const hot = hotRoute(5, lineup, ['A'], {}, MON, null, new Map([['LA|star wideout', { games: 4, hits: 4 }]])).forPool[0].net;
  assert.ok(hot > plain);
});

test('if he finishes at his boom number, the swing uses the spread left without his own uncertainty', () => {
  const r = hotRoute(5, { A: { mine: [star], opp: [], score: { mine: 70, opp: 81 } } }, ['A'], {}, MON);
  const l = r.forPool[0].lines[0];
  assert.ok(l.swing > 0.15 && l.swing < 0.5);                 // down 11 with one 11-point WR left: a 16-point game is a big swing
});
