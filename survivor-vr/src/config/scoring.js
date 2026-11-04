// Scoring: how each challenge's raw result is compared.
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
  supply:     { label: 'Fastest supply sort',          better: 'lower',  unit: 's' },
  rope:       { label: 'Fastest to free the rope',     better: 'lower',  unit: 's' },
  fire:       { label: 'Fastest fire',                 better: 'lower',  unit: 's' },
};

// Exact tie in a single-winner ranking: 'earlierRun' | 'laterRun' | 'random'
export const TIE_BREAK = 'earlierRun';

export function fmtSeconds(s) {
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(1).padStart(m ? 4 : 1, '0');
  return m ? `${m}:${rest}` : `${rest}s`;
}

export function formatValue(challengeId, r) {
  if (!r) return '-';
  const t = fmtSeconds(r.value);
  if (r.dnf) return `DNF (${r.progressText || r.progress}) ${t}`;
  return t;
}

function same(a, b) {
  if (!!a.dnf !== !!b.dnf) return false;
  if (a.dnf) return a.progress === b.progress;
  return Math.abs(a.value - b.value) < 1e-6;
}

// results: { playerId: {value, dnf, progress} }, order: [playerId...] in run order
// returns playerIds best -> worst (exact ties broken by TIE_BREAK)
export function rankResults(challengeId, results, order) {
  const rule = SCORING[challengeId];
  const dir = rule.better === 'lower' ? 1 : -1;
  const ids = order.filter((id) => results[id]);
  const cmp = (a, b) => {
    const ra = results[a], rb = results[b];
    if (!!ra.dnf !== !!rb.dnf) return ra.dnf ? 1 : -1;          // finishers beat DNFs
    if (ra.dnf && rb.dnf && ra.progress !== rb.progress) return rb.progress - ra.progress;
    if (!ra.dnf && ra.value !== rb.value) return (ra.value - rb.value) * dir;
    if (TIE_BREAK === 'random') return Math.random() - 0.5;
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return TIE_BREAK === 'laterRun' ? ib - ia : ia - ib;
  };
  return [...ids].sort(cmp);
}

// Like rankResults but exact ties SHARE a place (used by the finale).
// returns [{ id, rank, tieSize }]  (rank = first place the tie covers, 1-based)
export function rankWithTies(challengeId, results, order) {
  const sorted = rankResults(challengeId, results, order);
  const out = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && same(results[sorted[i]], results[sorted[j]])) j++;
    for (let k = i; k < j; k++) out.push({ id: sorted[k], rank: i + 1, tieSize: j - i });
    i = j;
  }
  return out;
}

// points for each placement entry; a tie splits the points of the spots it covers
export function placementPoints(placements, points) {
  const res = {};
  for (const p of placements) {
    let sum = 0;
    for (let k = 0; k < p.tieSize; k++) sum += points[p.rank - 1 + k] ?? 0;
    res[p.id] = sum / p.tieSize;
  }
  return res;
}
