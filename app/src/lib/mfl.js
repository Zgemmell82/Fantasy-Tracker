// MyFantasyLeague lineups, read from MFL's export API (api_info on myfantasyleague.com).
// MFL blocks calls from other websites' pages, so every request goes through the Supabase "mfl" function.
import { SEASON } from './season.js';
import { LS_MFL, load, save } from './store.js';
import { mflExport } from './cloud.js';
import { defName, normTeam } from './teams.js';

// MFL lists a single matchup or player as an object rather than a one-item array.
const arr = x => x == null ? [] : Array.isArray(x) ? x : [x];
const POS = { PK: 'K', Def: 'DEF', DEF: 'DEF', 'Def.': 'DEF' };

// "Allen, Josh" -> "Josh Allen"
export const flipName = n => {
  const i = String(n || '').indexOf(',');
  return i < 0 ? String(n || '').trim() : (n.slice(i + 1).trim() + ' ' + n.slice(0, i).trim()).trim();
};

export function mflPlayer(p) {
  const pos = POS[p.position] || String(p.position || '').toUpperCase();
  const t = normTeam(p.team);
  return { n: pos === 'DEF' ? defName(t) : flipName(p.name), p: pos, t };
}

// live: the liveScoring export; roster: { playerId: {name, position, team} }; franchiseId: "0003".
export function parseMfl(live, roster, franchiseId) {
  const ls = (live && (live.liveScoring || live.weeklyResults)) || {};
  const id = String(franchiseId).padStart(4, '0');
  let me = null, op = null;
  arr(ls.matchup).forEach(m => {
    const fs = arr(m.franchise);
    const i = fs.findIndex(f => String(f.id).padStart(4, '0') === id);
    if (i >= 0) { me = fs[i]; op = fs.find((_, j) => j !== i) || null; }
  });
  if (!me) throw new Error('No week ' + (ls.week || '') + ' matchup for franchise ' + franchiseId + ' yet.');
  const side = f => arr(f && f.players && f.players.player)
    .filter(p => p.status === 'starter')
    .map(p => {
      const info = roster[p.id];
      const out = info ? mflPlayer(info) : { n: 'Player ' + p.id, p: '', t: '' };
      const pts = parseFloat(p.score);
      if (!Number.isNaN(pts)) out.pts = pts;
      return out;
    });
  const num = f => f && f.score != null && f.score !== '' && !Number.isNaN(parseFloat(f.score)) ? parseFloat(f.score) : null;
  return { mine: side(me), opp: side(op), score: { mine: num(me), opp: num(op) } };
}

const askForKey = /auth|login|log in|password|key|private|permission/i;

async function mj(type, params, apiKey) {
  const j = await mflExport(type, SEASON, params, apiKey);
  if (j && j.error) {
    const msg = typeof j.error === 'string' ? j.error : (j.error.$t || 'MyFantasyLeague returned an error.');
    throw new Error(msg + (askForKey.test(msg) && !apiKey ? ' If this is a private league, add your API key under Source.' : ''));
  }
  return j;
}

// Every player id listed in an export, so their names can be looked up in one go.
const idsIn = j => {
  const ids = [];
  const root = j && (j.liveScoring || j.weeklyResults);
  arr(root && root.matchup).forEach(m => arr(m.franchise).forEach(f => arr(f.players && f.players.player).forEach(p => ids.push(p.id))));
  return ids;
};

// Only the players seen so far are kept on the device; the helper looks up just the ones we don't have.
async function resolveRoster(ids) {
  const cache = load(LS_MFL, {});
  const missing = [...new Set(ids)].filter(id => !cache[id]);
  if (missing.length) {
    const all = await mj('players', { DETAILS: '0', PLAYERS: missing.join(',') });
    arr(all.players && all.players.player).forEach(p => { if (missing.includes(p.id)) cache[p.id] = { name: p.name, position: p.position, team: p.team }; });
    save(LS_MFL, cache);
  }
  return cache;
}

export async function syncMfl(leagueId, franchiseId, week, apiKey) {
  const args = { L: String(leagueId), W: String(week) };
  // Live scoring lists each team's players while games are on; weekly results is the fallback.
  let j = await mj('liveScoring', args, apiKey);
  if (!idsIn(j).length) j = await mj('weeklyResults', args, apiKey);
  const ids = idsIn(j);
  if (!ids.length) throw new Error('MyFantasyLeague isn\'t listing players for week ' + week + ' in this league yet.');
  const res = parseMfl(j, await resolveRoster(ids), franchiseId);
  if (!res.mine.length) throw new Error('MyFantasyLeague has no starters for week ' + week + ' yet.');
  return res;
}
