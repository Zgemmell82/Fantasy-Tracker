// Matchup ordering for ESPN and MyFantasyLeague lineups: QB, RB, WR, TE, K, DEF, then IDP, then anything else.

const GROUPS = [['QB'], ['RB', 'FB'], ['WR'], ['TE'], ['K', 'PK'], ['DEF'], ['DL', 'DE', 'DT', 'LB', 'DB', 'CB', 'S', 'SS', 'FS', 'EDR', 'IDP']];

export const positionRank = pos => {
  const p = String(pos || '').toUpperCase();
  const i = GROUPS.findIndex(g => g.includes(p));
  return i < 0 ? GROUPS.length : i;
};

// Lines two lineups up group by group, so your QB faces their QB and so on. A side with fewer players in a
// group gets a blank. Players keep the order they came in within a group.
export function alignByPosition(mine, opp) {
  const rows = [];
  for (let r = 0; r <= GROUPS.length; r++) {
    const a = (mine || []).filter(p => positionRank(p.pos) === r);
    const b = (opp || []).filter(p => positionRank(p.pos) === r);
    for (let i = 0; i < Math.max(a.length, b.length); i++) rows.push([a[i], b[i]]);
  }
  return rows;
}
