// Scoring: how each challenge's raw result is compared. No shared scoreboard -
// each round just crowns one immunity winner from these rankings.
//
// A run result looks like: { value, dnf, progress }
//   value    - the measured number (seconds)
//   dnf      - true if the run hit the time limit without finishing
//   progress - tiebreak among DNFs (e.g. hoops sunk, pieces placed)
export const SCORING = {
  basketball: { label: 'Fastest to sink all 5 hoops', better: 'lower',  unit: 's' },
  endurance:  { label: 'Longest hold',                 better: 'higher', unit: 's' },
  puzzle:     { label: 'Fastest puzzle',               better: 'lower',  unit: 's' },
  balance:    { label: 'Longest balance',              better: 'higher', unit: 's' },
};

// What happens if two players post exactly the same result:
//  'earlierRun' = the player who went first wins, 'laterRun', or 'random'
export const TIE_BREAK = 'earlierRun';

export function formatValue(challengeId, r) {
  if (!r) return '-';
  const s = r.value;
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(1).padStart(m ? 4 : 1, '0');
  const t = m ? `${m}:${rest}` : `${rest}s`;
  if (r.dnf) return `DNF (${r.progressText || r.progress}) ${t}`;
  return t;
}

// results: { playerId: {value, dnf, progress} }, order: [playerId...] in run order
// returns playerIds best -> worst
export function rankResults(challengeId, results, order) {
  const rule = SCORING[challengeId];
  const dir = rule.better === 'lower' ? 1 : -1;
  const ids = order.filter((id) => results[id]);
  const cmp = (a, b) => {
    const ra = results[a], rb = results[b];
    if (!!ra.dnf !== !!rb.dnf) return ra.dnf ? 1 : -1;          // finishers beat DNFs
    if (ra.dnf && rb.dnf && ra.progress !== rb.progress) return rb.progress - ra.progress;
    if (!ra.dnf && ra.value !== rb.value) return (ra.value - rb.value) * dir;
    // exact tie
    if (TIE_BREAK === 'random') return Math.random() - 0.5;
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return TIE_BREAK === 'laterRun' ? ib - ia : ia - ib;
  };
  return [...ids].sort(cmp);
}
