// Hot Route: the gist of the week across your leagues.
//
// For each league matchup we estimate your win probability from the score so far and what each side still has
// to play. A player's "swing" in a league is how much your win probability moves if he has a big game
// (one standard deviation above his average); it counts for you when he is yours and against you when he is
// your opponent's. Adding the swings across leagues is what makes a player a root-for or root-against: a player
// who is against you in a league you're winning by 80 barely counts there, so he can still be a root-for overall.
//
// The odds use average-game assumptions by position (no projections), so they are a guide, not a forecast.
import { SCHEDULE_ALL } from '../data.js';
import { gameState } from './remaining.js';
import { normTeam } from './teams.js';

// Average points and spread for one starter's whole game, by position (half-PPR-ish).
const MEAN = { QB: 18, RB: 11, WR: 11, TE: 7.5, K: 8, DEF: 7, IDP: 6 };
const SD = { QB: 7.5, RB: 6.5, WR: 7, TE: 5, K: 3.5, DEF: 4.5, IDP: 5 };
const KEY = { QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', K: 'K', PK: 'K', DEF: 'DEF' };
const posKey = pos => KEY[String(pos || '').toUpperCase()] || 'IDP';

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
export function leagueOutlook(week, lineup, board, now = Date.now()) {
  const l = lineup || { mine: [], opp: [] };
  const byTeam = {};
  SCHEDULE_ALL.filter(g => g.w === week).forEach(g => { byTeam[g.a] = g; byTeam[g.h] = g; });
  const side = (list, who) => list.map(p => {
    const g = byTeam[normTeam(p.team)];
    const f = g ? fractionLeft(g, board && board[g.a + '@' + g.h], now) : 0;
    const k = posKey(p.pos);
    return { p, who, f, mean: MEAN[k] * f, sd: SD[k] * Math.sqrt(f), game: g || null };
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
    leftMine: mine.filter(x => x.f > 0).length, leftOpp: opp.filter(x => x.f > 0).length
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
export function hotRoute(week, wk, leagues, board, now = Date.now()) {
  const outlooks = leagues.map(name => ({ name, ...leagueOutlook(week, wk[name], board, now) }));
  const byPlayer = new Map();
  outlooks.forEach(o => [...o.mine, ...o.opp].forEach(x => {
    if (x.f <= 0) return;                                  // already played: nothing left to root for
    const key = normTeam(x.p.team) + '|' + String(x.p.name).toLowerCase();
    if (!byPlayer.has(key)) byPlayer.set(key, { key, player: x.p, f: x.f, game: x.game, net: 0, lines: [] });
    const r = byPlayer.get(key);
    const swing = boom(o, x);
    r.net += swing;
    r.lines.push({ league: o.name, side: x.who, swing, diff: o.diff, wp: o.wp, done: o.done });
  }));
  const rows = [...byPlayer.values()].map(r => ({
    ...r,
    both: r.lines.some(l => l.side === 'mine') && r.lines.some(l => l.side === 'opp')
  }));
  const rootFor = rows.filter(r => r.net >= MIN_SWING).sort((a, b) => b.net - a.net);
  const rootAgainst = rows.filter(r => r.net <= -MIN_SWING).sort((a, b) => a.net - b.net);
  const wash = rows.filter(r => Math.abs(r.net) < MIN_SWING && r.both
    && r.lines.some(l => Math.abs(l.swing) >= MIN_SWING)).sort((a, b) => a.player.name.localeCompare(b.player.name));
  return { leagues: outlooks, rootFor, rootAgainst, wash };
}
