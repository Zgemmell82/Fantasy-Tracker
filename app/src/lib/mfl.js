// MyFantasyLeague lineups, read from MFL's public export API (api_info on myfantasyleague.com).
import { SEASON } from './season.js';
import { LS_MFL, load, save } from './store.js';
import { defName, normTeam } from './teams.js';

const EXPORT = 'https://api.myfantasyleague.com/' + SEASON + '/export';

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
  const ls = (live && live.liveScoring) || {};
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

async function mj(type, params, apiKey) {
  const qs = new URLSearchParams({ TYPE: type, JSON: '1', ...params });
  if (apiKey) qs.set('APIKEY', apiKey);
  let r;
  try { r = await fetch(EXPORT + '?' + qs); }
  catch (e) { throw new Error('Couldn\'t reach MyFantasyLeague. Check the league ID, or try again in a moment.'); }
  if (r.status === 401 || r.status === 403) throw new Error('MyFantasyLeague turned down the request. For a private league, add your API key.');
  if (!r.ok) throw new Error('MyFantasyLeague ' + r.status);
  const j = await r.json();
  if (j && j.error) throw new Error(typeof j.error === 'string' ? j.error : (j.error.$t || 'MyFantasyLeague returned an error.'));
  return j;
}

// Only the players seen so far are kept on the device; the full list is a big download.
async function resolveRoster(ids) {
  const cache = load(LS_MFL, {});
  const missing = ids.filter(id => !cache[id]);
  if (missing.length) {
    const all = await mj('players', { DETAILS: '0' });
    arr(all.players && all.players.player).forEach(p => { if (missing.includes(p.id)) cache[p.id] = { name: p.name, position: p.position, team: p.team }; });
    save(LS_MFL, cache);
  }
  return cache;
}

export async function syncMfl(leagueId, franchiseId, week, apiKey) {
  const live = await mj('liveScoring', { L: leagueId, W: String(week) }, apiKey);
  const ids = [];
  arr(live.liveScoring && live.liveScoring.matchup).forEach(m => arr(m.franchise).forEach(f => arr(f.players && f.players.player).forEach(p => ids.push(p.id))));
  const res = parseMfl(live, await resolveRoster(ids), franchiseId);
  if (!res.mine.length) throw new Error('MyFantasyLeague has no starters for week ' + week + ' yet.');
  return res;
}
