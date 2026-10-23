// How often each player has scored big this season, from the lineups already saved on this device for earlier weeks
// (your starters and your opponents' starters, with the points each had). It is used to lean the Two-Minute Drill
// toward players who actually boom, a little: never more than about +/-25% on a player's number.
import { playerKey } from './identity.js';

// data: { [week]: { [league]: { mine: [{name, team, pts}], opp: [...] } } }. Returns Map(playerKey -> [pts per earlier week]).
export function buildHistory(data, week, leagues) {
  const out = new Map();
  Object.entries(data || {}).forEach(([w, byLeague]) => {
    if (Number(w) >= week) return;
    const best = new Map();                                  // one score per player per week (best across leagues)
    leagues.forEach(name => {
      const l = byLeague && byLeague[name];
      if (!l) return;
      [...(l.mine || []), ...(l.opp || [])].forEach(p => {
        if (typeof p.pts !== 'number') return;
        const k = playerKey(p.name, p.team);
        if (!best.has(k) || p.pts > best.get(k)) best.set(k, p.pts);
      });
    });
    best.forEach((pts, k) => { if (!out.has(k)) out.set(k, []); out.get(k).push(pts); });
  });
  return out;
}

const PRIOR_RATE = 0.25, PRIOR_GAMES = 4, MIN_GAMES = 3;

// Multiplier for a player's boom swing: how many of his earlier games reached the boom number he needs now, smoothed
// toward a typical 25% so two good games don't swing it. 1 when we have fewer than 3 games to go on.
export function boomLean(history, key, boomPts) {
  const games = history && history.get(key);
  if (!games || games.length < MIN_GAMES) return { mult: 1, games: games ? games.length : 0, rate: null };
  const hits = games.filter(p => p >= boomPts).length;
  const rate = (hits + PRIOR_RATE * PRIOR_GAMES) / (games.length + PRIOR_GAMES);
  return { mult: Math.min(1.25, Math.max(0.8, 1 + (rate - PRIOR_RATE))), games: games.length, rate };
}
