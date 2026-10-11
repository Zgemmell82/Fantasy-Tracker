import test from 'node:test';
import assert from 'node:assert/strict';
import { fractionLeft, hotRoute, leagueOutlook, phi } from './hotroute.js';

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
  assert.ok(r.rootAgainst[0].net < -0.2);
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
