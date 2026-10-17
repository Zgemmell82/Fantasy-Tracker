// "What I need to win": for each league, how far you are from beating your opponent and which of your remaining
// players are projected to close the gap. It reads the same league outlook as Hot Route (score so far plus what
// each side's unfinished players are projected to add), so the two always agree.
import { SCHEDULE_ALL } from '../data.js';
import { gameState } from './remaining.js';
import { fmtPts } from './games.js';

const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
const etParts = ms => { const p = Object.fromEntries(ET.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return { day: p.weekday, hour: Number(p.hour) }; };

// Thursday night, Monday night, and Sunday games that kick off at 4 pm Eastern or later (the late window and Sunday night).
export function isLateOrPrimetime(g) {
  const { day, hour } = etParts(Date.parse(g.t));
  return day === 'Thu' || day === 'Mon' || (day === 'Sun' && hour >= 16);
}

// Whether the section should show: the week has started and a late or primetime game hasn't finished.
export function showWinPath(week, board, now = Date.now()) {
  const games = SCHEDULE_ALL.filter(g => g.w === week);
  const started = games.some(g => gameState(g, board, now) !== 'pre');
  return started && games.some(g => isLateOrPrimetime(g) && gameState(g, board, now) !== 'post');
}

export const LOCK_AT = 0.99;                 // win chance at or beyond this (or 1 minus it) counts as locked
export const WIN_AT = 0.7, MIRACLE_AT = 0.15;

const last = n => String(n).split(' ').slice(-1)[0];

// o: leagueOutlook(...) plus { name }. Returns the path for this league.
export function winPath(o) {
  const left = x => x.f > 0;
  const mineLeft = o.mine.filter(left).sort((a, b) => b.mean - a.mean);
  const oppLeft = o.opp.filter(left);
  const mineRem = mineLeft.reduce((n, x) => n + x.mean, 0);
  const oppRem = oppLeft.reduce((n, x) => n + x.mean, 0);
  const gap = o.them - o.me;                                  // positive: you're behind right now
  const need = Math.max(0, gap + oppRem);                      // what your remaining players must add if theirs hit projection
  const locked = o.done || o.wp >= LOCK_AT || o.wp <= 1 - LOCK_AT;
  const status = o.wp >= WIN_AT ? 'win' : o.wp <= MIRACLE_AT ? 'miracle' : 'bubble';

  // Fewest of your best remaining players whose projections cover the need.
  const picks = [];
  let sum = 0;
  for (const x of mineLeft) { if (sum >= need) break; picks.push(x); sum += x.mean; }
  const covers = sum >= need;

  const names = list => list.map(x => last(x.p.name) + ' (proj ' + fmtPts(x.mean) + ' left)').join(' + ');
  let line;
  if (o.done) line = o.diff > 0 ? 'Final. You won.' : o.diff < 0 ? 'Final. You lost.' : 'Final. It ended tied.';
  else if (!oppLeft.length && o.me > o.them) line = "Opponent has no one left to play. You're in control.";
  else if (!oppLeft.length) line = 'Opponent is done at ' + fmtPts(o.them) + '. You need ' + fmtPts(gap + 0.1 > 0 ? gap + 0.1 : 0) + ' more' + (mineLeft.length ? ': ' + names(picks.length ? picks : mineLeft) + (covers ? ' gets you there.' : ' is not quite enough.') : ' and have no one left to play.');
  else if (!mineLeft.length) line = 'You have no one left to play. You need the opponent to score under ' + fmtPts(Math.max(0, o.me - o.them)) + ' more (they are projected for ' + fmtPts(oppRem) + ').';
  else if (need <= 0) line = "You're ahead by more than their projected finish (" + fmtPts(oppRem) + ' to come). Keep the lead.';
  else line = 'Need ' + fmtPts(need) + ' more. ' + names(picks) + (covers ? ' gets you there.' : ' is not enough on its own: your best case is short.');

  return {
    name: o.name, status, locked, lockedWin: locked && o.wp >= 0.5, wp: o.wp,
    me: o.me, them: o.them, gap, need, mineRem, oppRem,
    mineLeft: mineLeft.length, oppLeft: oppLeft.length,
    picks: picks.map(x => ({ name: x.p.name, rem: x.mean })), covers, line,
    oppPlayers: oppLeft.sort((a, b) => b.mean - a.mean).slice(0, 4).map(x => ({ name: x.p.name, rem: x.mean })),
    approx: o.approx
  };
}

// All leagues, undecided first (closest to a coin flip first), locked ones last.
export function winPaths(outlooks) {
  return outlooks.filter(o => !o.approx).map(winPath)
    .sort((a, b) => (a.locked - b.locked) || Math.abs(a.wp - 0.5) - Math.abs(b.wp - 0.5));
}
