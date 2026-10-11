// Who is hurt, out or suspended, from Sleeper's player list (the same public feed used for projections).
// Sleeper refreshes it through the week, so a game-day inactive can show up late; the list is saved on the
// device for a few hours so the large download isn't repeated.
import { sleeperPlayers } from './sleeper.js';
import { load, save } from './store.js';
import { nameKey } from './projections.js';

const KEY = 'ff-injuries';
const TTL = 3 * 3600000;
const OUT = { Out: 'Out', IR: 'IR', PUP: 'PUP', Sus: 'Suspended', NFI: 'Out', COV: 'Out' };

// One player's status from a Sleeper record: { kind: 'out' | 'doubtful' | 'questionable', label, part } or null.
export function statusOf(p) {
  const s = p && p.injury_status;
  const part = (p && p.injury_body_part) || '';
  if (OUT[s]) return { kind: 'out', label: OUT[s], part };
  if (s === 'Doubtful') return { kind: 'doubtful', label: 'Doubtful', part };
  if (s === 'Questionable') return { kind: 'questionable', label: 'Questionable', part };
  if (p && /injured reserve|physically unable|suspended/i.test(p.status || '') && p.team) return { kind: 'out', label: 'Out', part };
  return null;
}

// Only players with a status are kept, so the saved copy is small.
export function buildInjuryLookup(all, at = Date.now()) {
  const byId = {}, byName = {};
  Object.entries(all || {}).forEach(([id, p]) => {
    if (!p || !p.team || !['QB', 'RB', 'WR', 'TE', 'K'].includes(p.position)) return;
    const st = statusOf(p);
    if (!st) return;
    byId[id] = st;
    byName[nameKey(((p.first_name || '') + ' ' + (p.last_name || '')).trim(), p.team)] = st;
  });
  return { byId, byName, at };
}

export async function loadInjuries({ force = false } = {}) {
  const saved = load(KEY, null);
  if (!force && saved && Date.now() - saved.at < TTL && saved.byId) return saved;
  const lookup = buildInjuryLookup(await sleeperPlayers());
  save(KEY, lookup);
  return lookup;
}

export function injuryFor(lookup, p) {
  if (!lookup || !p || String(p.pos).toUpperCase() === 'DEF') return null;
  return (p.sid && lookup.byId[String(p.sid)]) || lookup.byName[nameKey(p.name, p.team)] || null;
}
