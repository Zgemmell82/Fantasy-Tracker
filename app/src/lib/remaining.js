// Who still has a game to play, per league, and who is left in the Monday night game.
import { SCHEDULE_ALL } from '../data.js';
import { normTeam } from './teams.js';

const dayET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });

// The week's Monday night games (a Monday kickoff in Eastern time), as schedule rows.
export const mondayGames = week => SCHEDULE_ALL.filter(g => g.w === week && dayET.format(new Date(g.t)) === 'Mon');

// pre | in | post for one scheduled game: ESPN's word when we have it, else the kickoff clock.
export function gameState(g, board, now = Date.now()) {
  const info = board && board[g.a + '@' + g.h];
  if (info && info.state) return info.state;
  const t = new Date(g.t).getTime();
  return now < t ? 'pre' : now < t + 3.5 * 3600000 ? 'in' : 'post';
}

// One side's starters: how many still have a game to finish (not yet final), and how many of those are playing now.
// Players on a bye have no game, so they are never "left".
function side(players, byTeam, board, now) {
  let left = 0, live = 0;
  (players || []).forEach(p => {
    const g = byTeam[normTeam(p.team)];
    if (!g) return;
    const s = gameState(g, board, now);
    if (s !== 'post') { left++; if (s === 'in') live++; }
  });
  return { total: (players || []).length, left, live };
}

// For one league's lineup: { mine, opp } counts, and who is still to play in the Monday night game(s).
export function leagueRemaining(week, lineup, board, now = Date.now()) {
  const games = SCHEDULE_ALL.filter(g => g.w === week);
  const byTeam = {};
  games.forEach(g => { byTeam[g.a] = g; byTeam[g.h] = g; });
  const mnf = mondayGames(week).filter(g => gameState(g, board, now) !== 'post');
  const inMnf = players => (players || []).filter(p => mnf.some(g => g.a === normTeam(p.team) || g.h === normTeam(p.team)));
  const l = lineup || { mine: [], opp: [] };
  return {
    mine: side(l.mine, byTeam, board, now),
    opp: side(l.opp, byTeam, board, now),
    monday: { mine: inMnf(l.mine), opp: inMnf(l.opp) }
  };
}
