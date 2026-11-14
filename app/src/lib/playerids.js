// Matches Yahoo players to the ids the rest of the app uses (Sleeper `sid`, ESPN `eid`), so projections, injuries and
// the boom history work for Yahoo leagues too. The table is built from the DynastyProcess player ids by
// scripts/build-playerids.mjs and served as playerids.json. Matching order:
//   1. Yahoo's player id in that table
//   2. name + team + position (names are compared the way identity.js does: suffixes, accents and punctuation ignored)
// Anyone matched neither way is logged (console and a short list kept on the device) and still shows up, by name.
import { nameId } from './identity.js';
import { normTeam } from './teams.js';
import { load, save } from './store.js';

const LS_UNMATCHED = 'ff-yahoo-unmatched';
const POS = { PK: 'K', DST: 'DEF', 'D/ST': 'DEF' };
const posOf = p => POS[String(p || '').toUpperCase()] || String(p || '').toUpperCase();
// "Mahomes, Patrick" -> "Patrick Mahomes"
const flip = n => { const i = String(n).indexOf(','); return i < 0 ? String(n) : (n.slice(i + 1) + ' ' + n.slice(0, i)).trim(); };

let table = null;   // { map, byName } once loaded

// raw: { [yahoo_id]: [sleeper_id, espn_id, name, team, pos] }
export function buildTable(raw) {
  const map = raw || {}, byName = new Map();
  Object.entries(map).forEach(([yid, [sid, eid, name, team, pos]]) => {
    const key = nameId(flip(name)) + '|' + normTeam(team) + '|' + posOf(pos);
    byName.set(key, { yid, sid, eid });
  });
  return { map, byName };
}

export async function loadPlayerIds(fetchImpl = fetch, base = (import.meta.env && import.meta.env.BASE_URL) || '/') {
  if (table) return table;
  try {
    const r = await fetchImpl(base + 'playerids.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    table = buildTable(j && j.map);
  } catch (e) {
    table = buildTable({});                       // no table: everyone falls back to name matching
  }
  return table;
}
export const _resetPlayerIds = () => { table = null; };

// p: { yid, name, team, pos }. Returns { sid?, eid?, how: 'id' | 'name' | 'none' }.
export function matchYahooPlayer(t, p) {
  const pos = posOf(p.pos);
  if (pos === 'DEF') return { how: 'id' };            // team defenses are identified by team, no table needed
  const hit = t && t.map && t.map[String(p.yid)];
  if (hit) return { sid: hit[0] || undefined, eid: hit[1] ? Number(hit[1]) || hit[1] : undefined, how: 'id' };
  const byName = t && t.byName && t.byName.get(nameId(p.name) + '|' + normTeam(p.team) + '|' + pos);
  if (byName) return { sid: byName.sid || undefined, eid: byName.eid ? Number(byName.eid) || byName.eid : undefined, how: 'name' };
  return { how: 'none' };
}

// Remembers who couldn't be matched (a short list on the device) and says so once per player in the console.
const warned = new Set();
export const _resetWarnings = () => warned.clear();
export function logUnmatched(players, now = Date.now()) {
  if (!players.length) return;
  const have = load(LS_UNMATCHED, []);
  const known = new Set(have.map(x => x.yid + '|' + x.name));
  const fresh = players.filter(p => !known.has(p.yid + '|' + p.name));
  players.forEach(p => {
    const k = p.yid + '|' + p.name;
    if (!warned.has(k)) { warned.add(k); console.warn('Yahoo player not matched to a Sleeper/ESPN id:', p.name, p.team, p.pos, 'yahoo id', p.yid); }
  });
  if (fresh.length) save(LS_UNMATCHED, [...fresh.map(p => ({ yid: p.yid, name: p.name, team: p.team, pos: p.pos, at: now })), ...have].slice(0, 50));
}
export const unmatchedPlayers = () => load(LS_UNMATCHED, []);
export const clearUnmatched = () => save(LS_UNMATCHED, []);
