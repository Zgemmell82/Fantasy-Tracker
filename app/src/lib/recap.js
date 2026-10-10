// Post-game recap: for each league, the fantasy points your players scored for you and your opponent's
// players scored against you in each quarter, with the plays behind them in the order they happened.
// Points are the play-by-play estimates (half-PPR), not each league's own scoring.

const round1 = n => Math.round(n * 10) / 10;

// plays: matched plays (each with .hits), oldest first. order: league names in display order.
export function buildRecap(plays, order = []) {
  const lastPeriod = plays.reduce((m, p) => Math.max(m, p.period || 0), 4);
  const byLeague = new Map();
  plays.forEach(p => {
    const names = new Set();
    p.hits.forEach(h => h.leagues.forEach(l => names.add(l)));
    names.forEach(l => {
      if (!byLeague.has(l)) byLeague.set(l, new Map());
      const quarters = byLeague.get(l);
      if (!quarters.has(p.period)) quarters.set(p.period, { period: p.period, forPts: 0, againstPts: 0, plays: [] });
      const q = quarters.get(p.period);
      // Only this league's view of the play: its players, and whether each is yours or against you here.
      const hits = p.hits.filter(h => h.leagues.includes(l)).map(h => ({ ...h, leagues: [l] }));
      hits.forEach(h => { if (h.side === 'mine') q.forPts += h.est; else q.againstPts += h.est; });
      q.plays.push({ ...p, hits });
    });
  });
  const rank = l => { const i = order.indexOf(l); return i < 0 ? order.length : i; };
  return [...byLeague.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map(league => {
    const have = byLeague.get(league);
    const quarters = [];
    for (let period = 1; period <= lastPeriod; period++) {
      const q = have.get(period) || { period, forPts: 0, againstPts: 0, plays: [] };
      quarters.push({ ...q, forPts: round1(q.forPts), againstPts: round1(q.againstPts) });
    }
    return {
      league, quarters,
      forPts: round1(quarters.reduce((n, q) => n + q.forPts, 0)),
      againstPts: round1(quarters.reduce((n, q) => n + q.againstPts, 0))
    };
  });
}
