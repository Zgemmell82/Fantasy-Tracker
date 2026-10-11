// Weekly player projections from Sleeper, used by Hot Route to estimate what each player still has to give.
// Sleeper has no official docs for this feed, so the parsing is defensive: it accepts an array or an object of
// entries, nested or flat stats, and player names when present. If anything goes wrong the caller falls back
// to average-game assumptions by position.
import { SEASON } from './season.js';
import { LS_PL, load, save } from './store.js';
import { normTeam } from './teams.js';

const URL_BASE = 'https://api.sleeper.com/projections/nfl/' + SEASON + '/';
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const TTL = 3 * 3600000;
const LS_PROJ = w => 'ff-proj-' + SEASON + '-' + w;
const LS_INDEX = 'ff-sleeper-index';

const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b\.?/g;
export const nameKey = (name, team) =>
  String(name || '').toLowerCase().replace(SUFFIX, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim() + '|' + normTeam(team);

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));

// [standard, half-PPR, PPR] points from an entry's stats, or null when it has none.
function pointsOf(entry) {
  const st = (entry && (entry.stats || entry)) || {};
  const out = [num(st.pts_std), num(st.pts_half_ppr), num(st.pts_ppr)];
  // Fill gaps from the others (receptions are the only difference, so half sits midway).
  const [s, h, p] = out;
  const half = h ?? (s != null && p != null ? (s + p) / 2 : (p ?? s));
  const std = s ?? (half != null && p != null ? half - (p - half) : half);
  const ppr = p ?? (half != null && s != null ? half + (half - s) : half);
  return half == null ? null : [std, half, ppr];
}

// entries: Sleeper's projection rows. index: { sleeperId: { n, t } } used to name rows that don't carry names.
export function buildLookup(entries, index = {}) {
  const rows = Array.isArray(entries) ? entries : Object.values(entries || {});
  const lookup = { byId: {}, byName: {}, byTeam: {}, count: 0, unnamed: 0 };
  rows.forEach(e => {
    if (!e || typeof e !== 'object') return;
    const pts = pointsOf(e);
    if (!pts) return;
    const id = String(e.player_id ?? (e.player && e.player.player_id) ?? '');
    if (!id) return;
    if (/^[A-Z]{2,3}$/.test(id)) { lookup.byTeam[normTeam(id)] = pts; lookup.count++; return; }   // defenses are keyed by team
    lookup.byId[id] = pts;
    lookup.count++;
    const pl = e.player || {};
    const name = (pl.first_name || pl.last_name) ? ((pl.first_name || '') + ' ' + (pl.last_name || '')).trim() : (index[id] && index[id].n);
    const team = pl.team || e.team || (index[id] && index[id].t);
    if (name && team) lookup.byName[nameKey(name, team)] = pts; else lookup.unnamed++;
  });
  return lookup;
}

// Projected points for one player in a league's scoring (std | half | ppr), or null when we have none.
export function projectionFor(lookup, p, scoring = 'half') {
  if (!lookup) return null;
  const i = scoring === 'std' ? 0 : scoring === 'ppr' ? 2 : 1;
  let pts = null;
  if (String(p.pos).toUpperCase() === 'DEF') pts = lookup.byTeam[normTeam(p.team)];
  else pts = (p.sid && lookup.byId[String(p.sid)]) || lookup.byName[nameKey(p.name, p.team)];
  const v = pts ? pts[i] : null;
  return v == null ? null : Math.max(0, v);
}

// Sleeper's full player list is several MB: keep a small id -> name/team index, refreshed weekly.
async function nameIndex() {
  const cached = load(LS_INDEX, null);
  if (cached && Date.now() - cached.at < 7 * 86400000) return cached.map;
  const r = await fetch('https://api.sleeper.app/v1/players/nfl');
  if (!r.ok) throw new Error('Sleeper ' + r.status);
  const all = await r.json();
  const map = {};
  Object.entries(all).forEach(([id, p]) => {
    if (p && p.active !== false && p.team && ['QB', 'RB', 'WR', 'TE', 'K'].includes(p.position)) map[id] = { n: ((p.first_name || '') + ' ' + (p.last_name || '')).trim(), t: p.team };
  });
  save(LS_INDEX, { at: Date.now(), map });
  return map;
}

// The week's projections: the saved copy if it is fresh, else a new download. Returns the lookup, or throws.
export async function loadProjections(week, { force = false } = {}) {
  const saved = load(LS_PROJ(week), null);
  if (!force && saved && Date.now() - saved.at < TTL && saved.lookup && saved.lookup.count > 0) return saved.lookup;
  const qs = POSITIONS.map(p => 'position[]=' + p).join('&');
  const r = await fetch(URL_BASE + week + '?season_type=regular&' + qs + '&order_by=ppr');
  if (!r.ok) throw new Error('Sleeper projections ' + r.status);
  const entries = await r.json();
  let lookup = buildLookup(entries);
  // Rows without names can only be matched through Sleeper ids; fetch names so ESPN/MFL players match too.
  if (lookup.unnamed > 0) {
    try { lookup = buildLookup(entries, await nameIndex()); } catch (e) { /* keep id matches only */ }
  }
  if (!lookup.count) throw new Error('Sleeper has no projections for week ' + week + ' yet.');
  save(LS_PROJ(week), { at: Date.now(), lookup });
  return lookup;
}
