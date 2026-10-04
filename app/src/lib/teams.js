import { TEAM_ALIASES } from '../data.js';

export const NICK = { ARI:'Cardinals',ATL:'Falcons',BAL:'Ravens',BUF:'Bills',CAR:'Panthers',CHI:'Bears',CIN:'Bengals',CLE:'Browns',DAL:'Cowboys',DEN:'Broncos',DET:'Lions',GB:'Packers',HOU:'Texans',IND:'Colts',JAX:'Jaguars',KC:'Chiefs',LA:'Rams',LAC:'Chargers',LV:'Raiders',MIA:'Dolphins',MIN:'Vikings',NE:'Patriots',NO:'Saints',NYG:'Giants',NYJ:'Jets',PHI:'Eagles',PIT:'Steelers',SEA:'Seahawks',SF:'49ers',TB:'Buccaneers',TEN:'Titans',WAS:'Commanders' };

export function normTeam(t) {
  const u = String(t || '').toUpperCase().trim();
  return TEAM_ALIASES[u] || u;
}

export function defName(team) {
  const t = normTeam(team);
  return (NICK[t] || t) + ' D/ST';
}

let seq = 0;
export function mkPlayer(p) {
  return {
    id: 'p' + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6),
    name: p.n || p.name || '',
    pos: String(p.p || p.pos || '').toUpperCase(),
    team: normTeam(p.t || p.team),
    ...(p.sid ? { sid: p.sid } : {}),
    ...(p.eid ? { eid: p.eid } : {}),
    ...(typeof p.pts === 'number' ? { pts: p.pts } : {})
  };
}
