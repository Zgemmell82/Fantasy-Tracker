import { SCHEDULE_ALL } from '../data.js';

// Groups every league's starters by the NFL game they play in that week.
// Returns games in schedule order, plus a "bye" bucket for teams with no game.
// names sets which leagues count and their order; it defaults to every league in weekData.
export function groupByGame(week, weekData, now = Date.now(), names = Object.keys(weekData || {})) {
  const wg = SCHEDULE_ALL.filter(g => g.w === week);
  const idx = {};
  wg.forEach((g, i) => { idx[g.h] = i; idx[g.a] = i; });
  const buckets = wg.map(() => ({ f: {}, a: {} }));
  const bye = { f: {}, a: {} };
  const put = (side, p, lg) => {
    const b = idx[p.team] === undefined ? bye : buckets[idx[p.team]];
    const key = p.team + '|' + p.name.toLowerCase();
    if (!b[side][key]) b[side][key] = { name: p.name, pos: p.pos, team: p.team, sid: p.sid, eid: p.eid, leagues: [], uid: side + ':' + key };
    if (!b[side][key].leagues.includes(lg)) b[side][key].leagues.push(lg);
    if (typeof p.pts === 'number') (b[side][key].pts = b[side][key].pts || {})[lg] = p.pts;
  };
  names.forEach(n => {
    const l = (weekData && weekData[n]) || { mine: [], opp: [] };
    l.mine.forEach(p => put('f', p, n));
    l.opp.forEach(p => put('a', p, n));
  });
  const games = wg.map((g, i) => {
    const t = new Date(g.t).getTime();
    const status = now < t ? 'Upcoming' : now < t + 3.5 * 3600000 ? 'Live' : 'Final';
    return { key: g.a + '@' + g.h, title: g.a + ' @ ' + g.h, time: g.d, status, mine: Object.values(buckets[i].f), theirs: Object.values(buckets[i].a) };
  }).filter(g => g.mine.length || g.theirs.length);
  return { games, bye: { mine: Object.values(bye.f), theirs: Object.values(bye.a) } };
}

// True while any game of the week is in progress (kickoff to about 3.5 hours later).
export function liveNow(week, now = Date.now()) {
  return SCHEDULE_ALL.some(g => {
    if (g.w !== week) return false;
    const t = new Date(g.t).getTime();
    return now >= t && now < t + 3.5 * 3600000;
  });
}

// Whether any game of the week has kicked off, so scores mean something.
export function weekStarted(week, now = Date.now()) {
  return SCHEDULE_ALL.some(g => g.w === week && now >= new Date(g.t).getTime());
}

// 18 → "18", 18.4 → "18.4", 18.416 → "18.42"
export const fmtPts = n => String(Number(Number(n).toFixed(2)));
