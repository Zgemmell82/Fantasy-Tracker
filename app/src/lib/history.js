// How often each player has boomed this season, rebuilt from the earlier weeks' Boom data: the lineups saved on this
// device (your starters and your opponents', with the points each scored) set against that week's own Sleeper
// projection in the league's scoring, using the same rule as the BOOM tab (120% of projection and at least 5 over).
// It is used to lean the Two-Minute Drill toward players who actually boom, a little: never more than about +/-25%.
import { playerKey } from './identity.js';
import { boomOf } from './boom.js';
import { projectionFor } from './projections.js';

// data: { [week]: { [league]: { scoring, mine: [{name, team, pts}], opp: [...] } } }
// lookups: { [week]: Sleeper projection lookup for that week } (weeks without one are skipped).
// Returns Map(playerKey -> { games, hits }): games with a projection to judge against, and how many of them were booms.
export function buildHistory(data, week, leagues, lookups = {}) {
  const out = new Map();
  Object.entries(data || {}).forEach(([w, byLeague]) => {
    const lookup = lookups[w];
    if (Number(w) >= week || !lookup) return;
    const seen = new Map();                                    // one result per player per week
    leagues.forEach(name => {
      const l = byLeague && byLeague[name];
      if (!l) return;
      [...(l.mine || []), ...(l.opp || [])].forEach(p => {
        if (typeof p.pts !== 'number') return;
        const proj = projectionFor(lookup, p, l.scoring);
        if (proj == null) return;
        const k = playerKey(p.name, p.team);
        seen.set(k, (seen.get(k) || false) || boomOf(p.pts, proj));
      });
    });
    seen.forEach((boomed, k) => {
      const h = out.get(k) || { games: 0, hits: 0 };
      h.games += 1; if (boomed) h.hits += 1;
      out.set(k, h);
    });
  });
  return out;
}

const PRIOR_RATE = 0.25, PRIOR_GAMES = 4, MIN_GAMES = 3;

// Multiplier for a player's boom swing from how often he boomed earlier, smoothed toward a typical 25% so two good
// games don't swing it. 1 when there are fewer than 3 earlier games to go on.
export function boomLean(history, key) {
  const h = history && history.get(key);
  if (!h || h.games < MIN_GAMES) return { mult: 1, games: h ? h.games : 0, rate: null };
  const rate = (h.hits + PRIOR_RATE * PRIOR_GAMES) / (h.games + PRIOR_GAMES);
  return { mult: Math.min(1.25, Math.max(0.8, 1 + (rate - PRIOR_RATE))), games: h.games, rate };
}
