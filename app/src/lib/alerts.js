// The Sunday-morning check: which starters in your leagues won't play, may not play, or are on a bye.
// Your own starters are warnings; the same problems on your opponent's side are good news.
import { gameFor, gameState } from './remaining.js';
import { injuryFor } from './injuries.js';
import { normTeam } from './teams.js';
import { playerKey } from './identity.js';

const SEVERITY = { bye: 4, out: 3, doubtful: 2, questionable: 1 };
const LABEL = { bye: 'Bye', out: 'Out', doubtful: 'Doubtful', questionable: 'Questionable' };

const kick = g => {
  const t = ((/^(\w{3})/.exec(g.d) || [])[1] || '') + ' ' + ((/(\d+:\d+) ([AP])M/.exec(g.d) || []).slice(1).join('').toLowerCase());
  return t.trim();
};

export const alertKey = (side, p) => side + ':' + playerKey(p.name, p.team);

// Returns one entry per player (a player in several leagues is one entry with several leagues), worst first,
// your own starters before your opponents'. Games that have started (or finished) are skipped.
export function lineupAlerts(week, wk, names, injuries, board, now = Date.now()) {
  const found = new Map();
  names.forEach(league => {
    const l = wk[league];
    if (!l) return;
    ['mine', 'opp'].forEach(side => (l[side] || []).forEach(p => {
      if (!p.team) return;
      const g = gameFor(week, p.team);
      let kind = null, part = '';
      if (!g) kind = 'bye';
      else if (gameState(g, board, now) !== 'pre') return;          // once his game starts there's nothing left to check
      else {
        const inj = injuryFor(injuries, p);
        if (inj) { kind = inj.kind; part = inj.part; }
      }
      if (!kind) return;
      if (side === 'opp' && SEVERITY[kind] < 2) return;              // a questionable opponent isn't news
      const key = alertKey(side, p);
      if (!found.has(key)) found.set(key, { key, side, player: p, kind, label: LABEL[kind], part, severity: SEVERITY[kind], when: g ? kick(g) : '', at: g ? Date.parse(g.t) : 0, leagues: [] });
      const a = found.get(key);
      if (!a.leagues.includes(league)) a.leagues.push(league);
    }));
  });
  return [...found.values()].sort((a, b) => (a.side === b.side ? 0 : a.side === 'mine' ? -1 : 1) || b.severity - a.severity || a.at - b.at);
}

// acks: { [alertKey]: severity when it was checked off }. A checked-off alert stays hidden until it gets worse
// (Questionable -> Out, say); then it comes back.
export function applyChecks(alerts, acks) {
  const open = [], checked = [];
  alerts.forEach(a => ((acks && acks[a.key] != null && a.severity <= acks[a.key]) ? checked : open).push(a));
  return { open, checked };
}

// What the cards need: counts of your own problems, and how many each league has.
export function alertSummary(alerts) {
  const mine = alerts.filter(a => a.side === 'mine');
  const byLeague = {};
  mine.forEach(a => a.leagues.forEach(n => { byLeague[n] = (byLeague[n] || 0) + 1; }));
  return { mine: mine.length, serious: mine.filter(a => a.severity >= 2).length, theirs: alerts.length - mine.length, byLeague };
}
