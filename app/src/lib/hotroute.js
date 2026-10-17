// Hot Route: the gist of the week across your leagues.
//
// For each league matchup we estimate your win probability from the score so far and what each side still has
// to play. A player's "swing" in a league is how much your win probability moves if he has a big game
// (one standard deviation above his average); it counts for you when he is yours and against you when he is
// your opponent's. Adding the swings across leagues is what makes a player a root-for or root-against: a player
// who is against you in a league you're winning by 80 barely counts there, so he can still be a root-for overall.
//
// With Sleeper's weekly projections each player's average comes from his projection (in the league's scoring);
// players without one, or when projections can't be loaded, use an average game for their position.
// Either way the odds are a guide, not a forecast.
import { SCHEDULE_ALL } from '../data.js';
import { projectionFor } from './projections.js';
import { gameState } from './remaining.js';
import { boardFor } from './pbp.js';
import { normTeam } from './teams.js';

// Average points and spread for one starter's whole game, by position (half-PPR-ish).
const MEAN = { QB: 18, RB: 11, WR: 11, TE: 7.5, K: 8, DEF: 7, IDP: 6 };
const SD = { QB: 7.5, RB: 6.5, WR: 7, TE: 5, K: 3.5, DEF: 4.5, IDP: 5 };
// How spread out a game is relative to the player's average, by position (used with a projection).
const CV = { QB: 0.42, RB: 0.6, WR: 0.62, TE: 0.67, K: 0.45, DEF: 0.65, IDP: 0.8 };
const KEY = { QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', K: 'K', PK: 'K', DEF: 'DEF' };
const posKey = pos => KEY[String(pos || '').toUpperCase()] || 'IDP';

// A player is "booming" in a league when his live score is at least 120% of his original projection in that
// league's scoring, and at least 5 points over it (so a 3-point projection that becomes 4 doesn't count).
export const BOOM_RATIO = 1.2, BOOM_MIN_GAIN = 5;
export const boomOf = (pts, proj) => typeof pts === 'number' && proj != null && proj > 0 && pts >= proj * BOOM_RATIO && pts - proj >= BOOM_MIN_GAIN;
// Live score against projection, as a fraction (0.1 = 10% over). null without both numbers.
export const overBy = (pts, proj) => typeof pts === 'number' && proj != null && proj > 0 ? (pts - proj) / proj : null;

// Win probability swing needed before a player counts as a root-for or root-against.
export const MIN_SWING = 0.02;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Standard normal distribution (Abramowitz-Stegun erf).
export function phi(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return 0.5 * (1 + (x < 0 ? -y : y));
}

// How much of a game is still to come: 1 before kickoff, 0 when final, in between from the clock.
export function fractionLeft(g, info, now = Date.now()) {
  const s = gameState(g, info ? { [g.a + '@' + g.h]: info } : {}, now);
  if (s === 'post') return 0;
  if (s === 'pre') return 1;
  if (info && info.period > 0) {
    if (info.period > 4) return 0.03;
    const secs = (4 - info.period) * 900 + (typeof info.clock === 'number' ? info.clock : 450);
    return clamp(secs / 3600, 0.02, 1);
  }
  return clamp(1 - (now - Date.parse(g.t)) / 60000 / 180, 0.05, 0.98);   // no clock: assume a three-hour game
}

const total = list => list.reduce((n, p) => n + (typeof p.pts === 'number' ? p.pts : 0), 0);
const hasPts = list => list.some(p => typeof p.pts === 'number');

// One league's matchup right now: scores, what's left on each side, win probability.
// lookup: Sleeper projections (optional). Players it has no number for use the position average.
export function leagueOutlook(week, lineup, board, now = Date.now(), lookup = null) {
  const l = lineup || { mine: [], opp: [] };
  const byTeam = {};
  SCHEDULE_ALL.filter(g => g.w === week).forEach(g => { byTeam[g.a] = g; byTeam[g.h] = g; });
  const side = (list, who) => list.map(p => {
    const g = byTeam[normTeam(p.team)];
    const f = g ? fractionLeft(g, boardFor(board, g.a + '@' + g.h), now) : 0;
    const k = posKey(p.pos);
    const proj = projectionFor(lookup, p, l.scoring);
    const full = proj != null ? proj : MEAN[k];                              // his whole-game average
    const spread = proj != null ? Math.max(2, CV[k] * proj) : SD[k];
    return { p, who, f, mean: full * f, sd: spread * Math.sqrt(f), projected: proj != null, proj, game: g || null };
  });
  const mine = side(l.mine, 'mine'), opp = side(l.opp, 'opp');
  const known = l.score && (l.score.mine != null || l.score.opp != null);
  const me = l.score && l.score.mine != null ? l.score.mine : total(l.mine);
  const them = l.score && l.score.opp != null ? l.score.opp : total(l.opp);
  const diff = me - them;
  const exp = diff + mine.reduce((n, x) => n + x.mean, 0) - opp.reduce((n, x) => n + x.mean, 0);
  const sd = Math.sqrt([...mine, ...opp].reduce((n, x) => n + x.sd * x.sd, 0));
  const wp = sd < 1e-9 ? (exp > 0 ? 1 : exp < 0 ? 0 : 0.5) : phi(exp / sd);
  return {
    me, them, diff, exp, sd, wp,
    done: sd < 1e-9,
    approx: !known && !hasPts(l.mine) && !hasPts(l.opp),     // no scores to go on (a by-hand league)
    mine, opp,
    leftMine: mine.filter(x => x.f > 0).length, leftOpp: opp.filter(x => x.f > 0).length,
    projectedLeft: [...mine, ...opp].filter(x => x.f > 0 && x.projected).length
  };
}

// Change in your win probability if this player outperforms his average by one standard deviation.
function boom(o, x) {
  if (o.done || x.sd <= 0) return 0;
  const base = phi(o.exp / o.sd);
  return x.who === 'mine' ? phi((o.exp + x.sd) / o.sd) - base : phi((o.exp - x.sd) / o.sd) - base;
}

// leagues: names in display order. Returns the leagues' outlooks and the players ranked into
// rootFor, rootAgainst and wash (for you in some leagues and against you in others, cancelling out).
export function hotRoute(week, wk, leagues, board, now = Date.now(), lookup = null) {
  const outlooks = leagues.map(name => ({ name, ...leagueOutlook(week, wk[name], board, now, lookup) }));
  const byPlayer = new Map();
  outlooks.forEach(o => [...o.mine, ...o.opp].forEach(x => {
    const key = normTeam(x.p.team) + '|' + String(x.p.name).toLowerCase();
    if (!byPlayer.has(key)) byPlayer.set(key, { key, player: x.p, f: x.f, game: x.game, net: 0, lines: [] });
    const r = byPlayer.get(key);
    r.projected = r.projected || x.projected;
    const swing = boom(o, x);
    r.net += swing;
    const pts = typeof x.p.pts === 'number' ? x.p.pts : null;
    r.lines.push({ league: o.name, side: x.who, swing, diff: o.diff, wp: o.wp, done: o.done, pts, proj: x.proj, started: x.f < 1, over: x.f < 1 ? overBy(pts, x.proj) : null, boom: boomOf(pts, x.proj) });
  }));
  const rows = [...byPlayer.values()].map(r => ({
    ...r,
    both: r.lines.some(l => l.side === 'mine') && r.lines.some(l => l.side === 'opp')
  }));
  const rootFor = rows.filter(r => r.net >= MIN_SWING).sort((a, b) => b.net - a.net);
  const rootAgainst = rows.filter(r => r.net <= -MIN_SWING).sort((a, b) => a.net - b.net);
  const wash = rows.filter(r => Math.abs(r.net) < MIN_SWING && r.both
    && r.lines.some(l => Math.abs(l.swing) >= MIN_SWING)).sort((a, b) => a.player.name.localeCompare(b.player.name));
  const boomRows = rows.filter(r => r.lines.some(l => l.boom)).sort((a, b) => Math.max(...b.lines.map(l => l.over ?? -1)) - Math.max(...a.lines.map(l => l.over ?? -1)));
  return { leagues: outlooks, rootFor, rootAgainst, wash, boom: boomRows, playersLeft: outlooks.reduce((n, o) => n + o.leftMine + o.leftOpp, 0), projectedLeft: outlooks.reduce((n, o) => n + o.projectedLeft, 0) };
}
