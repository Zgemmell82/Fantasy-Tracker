// Matchup ordering for ESPN and MyFantasyLeague lineups: QB, RB, WR, TE, K, DEF, then IDP, then anything else.

const GROUPS = [['QB'], ['RB', 'FB'], ['WR'], ['TE'], ['K', 'PK'], ['DEF'], ['DL', 'DE', 'DT', 'LB', 'DB', 'CB', 'S', 'SS', 'FS', 'EDR', 'IDP']];

export const positionRank = pos => {
  const p = String(pos || '').toUpperCase();
  const i = GROUPS.findIndex(g => g.includes(p));
  return i < 0 ? GROUPS.length : i;
};

// Lines two lineups up group by group, so your QB faces their QB and so on, in the order QB, RB, WR, TE, FLX, K, DEF, IDP.
// Where one side has more RBs, WRs or TEs than the other, the extras are the flex players: they face each other in a
// FLX row after the TE spot (an RB can face a WR). Rows are [yours, theirs] or [yours, theirs, 'FLX'];
// a side with nobody for a row gets a blank. Players keep the order they came in within a group.
export function alignByPosition(mine, opp) {
  const inGroup = (list, r) => (list || []).filter(p => positionRank(p.pos) === r);
  const FLEXABLE = [1, 2, 3];                       // RB, WR, TE
  const rows = [];
  const flexMine = [], flexOpp = [];
  const pad = (a, b, flex) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) rows.push(flex ? [a[i], b[i], 'FLX'] : [a[i], b[i]]);
  };
  for (let r = 0; r <= GROUPS.length; r++) {
    const a = inGroup(mine, r), b = inGroup(opp, r);
    if (r === 4) pad(flexMine, flexOpp, true);      // the FLX rows go right after the TE group
    if (FLEXABLE.includes(r)) {
      const n = Math.min(a.length, b.length);
      pad(a.slice(0, n), b.slice(0, n), false);
      flexMine.push(...a.slice(n));
      flexOpp.push(...b.slice(n));
    } else pad(a, b, false);
  }
  return rows;
}
