// The Two-Minute Drill: with two games or fewer left in the week, each league gets a direct path to victory built only
// from facts: the score right now, who still has a game to finish on each side, and the margin that decides the matchup.
// No projections and no odds. A player is "left" until his game is final.
import { SCHEDULE_ALL } from '../data.js';
import { gameState } from './remaining.js';
import { fmtPts } from './games.js';

export const OPENS_AT = 2;                               // games left in the week when the drill opens

// Games of the week that are not final yet (live ones count), and whether the week has started at all.
export function gamesLeft(week, board, now = Date.now()) {
  const games = SCHEDULE_ALL.filter(g => g.w === week);
  const left = games.filter(g => gameState(g, board, now) !== 'post').length;
  const started = games.some(g => gameState(g, board, now) !== 'pre');
  return { left, total: games.length, started, open: started && left <= OPENS_AT };
}

const last = n => String(n).split(' ').slice(-1)[0];
export const nameList = (list, max = 3) => {
  const names = list.slice(0, max).map(x => last(x.p.name));
  const more = list.length - names.length;
  if (more > 0) names.push(more + ' more');
  return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0] || '';
};
const round = n => Math.round(n * 100) / 100;

// o: leagueOutlook(...) with { name }. Returns { name, state, headline, margin, me, them, mine: [...], opp: [...] }.
// state: 'final' | 'won' (clinched: they have nobody left and you lead) | 'lost' (you have nobody left and trail and so do they... see below) | 'open'.
export function pathToVictory(o) {
  const mine = o.mine.filter(x => x.f > 0), opp = o.opp.filter(x => x.f > 0);
  const gap = round(o.them - o.me);                      // positive: you trail by this much right now
  const lead = -gap;
  const view = list => list.map(x => ({ name: x.p.name, pos: x.p.pos, team: x.p.team, pts: typeof x.p.pts === 'number' ? x.p.pts : null, live: x.f < 1, game: x.game }));
  const base = { name: o.name, me: o.me, them: o.them, gap, mine: view(mine), opp: view(opp) };

  if (!mine.length && !opp.length) {
    return { ...base, state: 'final', headline: gap < 0 ? 'Final. You won by ' + fmtPts(lead) + '.' : gap > 0 ? 'Final. You lost by ' + fmtPts(gap) + '.' : 'Final. It ended tied.' };
  }
  if (!opp.length) {
    if (lead > 0) return { ...base, state: 'won', headline: 'Locked win. They have no one left to play and you lead by ' + fmtPts(lead) + '.' };
    const need = gap === 0 ? 'any points at all' : 'more than ' + fmtPts(gap) + ' points combined';
    return { ...base, state: 'open', margin: gap, headline: 'They are done at ' + fmtPts(o.them) + '. ' + (mine.length ? nameList(mine) + ' ' + (mine.length > 1 ? 'need' : 'needs') + ' ' + need + ' to win.' : 'You have no one left either.') };
  }
  if (!mine.length) {
    if (lead > 0) return { ...base, state: 'open', margin: lead, headline: 'You are done at ' + fmtPts(o.me) + ' and lead by ' + fmtPts(lead) + '. You win unless ' + nameList(opp) + ' ' + (opp.length > 1 ? 'score' : 'scores') + ' ' + fmtPts(lead) + ' or more combined.' };
    return { ...base, state: 'lost', headline: 'You are done at ' + fmtPts(o.me) + ' and trail by ' + fmtPts(gap) + '. Only negative points from ' + nameList(opp) + ' can save you.' };
  }
  const verb = (list, one, many) => list.length > 1 ? many : one;
  const a = nameList(mine), b = nameList(opp);
  if (gap > 0) return { ...base, state: 'open', margin: gap, headline: a + ' ' + verb(mine, 'needs', 'need') + ' to outscore ' + b + ' by more than ' + fmtPts(gap) + ' points for you to win.' };
  if (gap === 0) return { ...base, state: 'open', margin: 0, headline: 'Tied. ' + a + ' just ' + verb(mine, 'needs', 'need') + ' to outscore ' + b + '.' };
  return { ...base, state: 'open', margin: lead, headline: 'You lead by ' + fmtPts(lead) + '. You win as long as ' + b + ' ' + verb(opp, 'does not', 'do not') + ' outscore ' + a + ' by ' + fmtPts(lead) + ' or more.' };
}

// Every league, undecided first (smallest margin first), decided last.
export function pathsFor(outlooks) {
  return outlooks.filter(o => !o.approx).map(pathToVictory)
    .sort((x, y) => ((x.state === 'open') === (y.state === 'open') ? 0 : x.state === 'open' ? -1 : 1) || Math.abs(x.margin ?? 1e9) - Math.abs(y.margin ?? 1e9));
}
