// Home page numbers for one league: current and projected totals, and a winning / losing / close call.
// o is leagueOutlook(...). Projected total = score so far + what each unfinished starter is projected to add.

export const WIN_CALL = 0.65, LOSE_CALL = 0.35;

export function leagueGlance(o, hasLineup) {
  if (!hasLineup) return { tone: 'muted', label: 'No matchup yet', myProj: null, themProj: null };
  const myProj = o.me + o.mine.reduce((n, x) => n + x.mean, 0);
  const themProj = o.them + o.opp.reduce((n, x) => n + x.mean, 0);
  if (o.done) return { tone: o.diff > 0 ? 'win' : o.diff < 0 ? 'lose' : 'close', label: o.diff > 0 ? 'Won' : o.diff < 0 ? 'Lost' : 'Tied', myProj: o.me, themProj: o.them };
  if (o.approx) return { tone: 'muted', label: 'No scores yet', myProj: null, themProj: null };
  const tone = o.wp >= WIN_CALL ? 'win' : o.wp <= LOSE_CALL ? 'lose' : 'close';
  // Behind on the scoreboard but expected to come back (or the reverse) reads "Projected", not "Winning".
  const label = tone === 'win' ? (o.diff >= 0 ? 'Winning' : 'Projected win') : tone === 'lose' ? (o.diff <= 0 ? 'Losing' : 'Projected loss') : 'Close';
  return { tone, label, myProj, themProj };
}
