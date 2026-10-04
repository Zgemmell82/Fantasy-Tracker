import { SCHEDULE_ALL, LEAGUE_NAMES, WEEK1, BASELINE_ROSTERS } from '../data.js';
import { mkPlayer } from './teams.js';

export const SEASON = 2026;
export const WEEKS = 18;

// The current week runs until 8 hours after its last kickoff.
export function currentWeek(now = Date.now()) {
  for (let w = 1; w <= WEEKS; w++) {
    const last = Math.max(...SCHEDULE_ALL.filter(x => x.w === w).map(x => new Date(x.t).getTime()));
    if (now < last + 8 * 3600000) return w;
  }
  return WEEKS;
}

// A week nobody has touched starts from week 1's lineups, else last week's starters, else the baseline roster.
// An added league has no built-in lineup, so it starts empty.
export function seedWeek(w, data, names = LEAGUE_NAMES) {
  const out = {};
  const prev = data && data[w - 1];
  names.forEach(n => {
    if (w === 1 && WEEK1[n]) out[n] = { mine: WEEK1[n].mine.map(mkPlayer), opp: WEEK1[n].opp.map(mkPlayer) };
    else if (prev && prev[n]) out[n] = { mine: prev[n].mine.map(mkPlayer), opp: [] };
    else out[n] = { mine: (BASELINE_ROSTERS[n] || []).map(mkPlayer), opp: [] };
  });
  return out;
}
