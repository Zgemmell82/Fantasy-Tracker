import { SEASON } from './season.js';
import { LS_PL, load, save } from './store.js';
import { defName, normTeam } from './teams.js';

const API = 'https://api.sleeper.app/v1/';

async function sj(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error('Sleeper ' + r.status);
  return r.json();
}

const userIds = {};
export async function sleeperUserId(username) {
  const u = String(username || '').trim();
  if (!u) throw new Error('Add your Sleeper username first.');
  if (userIds[u]) return userIds[u];
  const user = await sj('user/' + encodeURIComponent(u));
  if (!user || !user.user_id) throw new Error('No Sleeper user named "' + u + '".');
  return (userIds[u] = user.user_id);
}

export async function sleeperLeagues(username) {
  const uid = await sleeperUserId(username);
  return (await sj('user/' + uid + '/leagues/nfl/' + SEASON)) || [];
}

const STOP = new Set(['the', 'of', 'a', 'an', 'and', 'my', 'our']);
// "The DynastyFootball League 2026" -> ['the', 'dynasty', 'football', 'league', '2026']
const words = s => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const initials = ws => ws.map(w => w[0]).join('');

// How well a Sleeper league name fits one of our short names (0 = not at all).
export function leagueScore(name, short) {
  const key = short.toLowerCase();
  const ws = words(name);
  const core = ws.filter(w => !/^\d+$/.test(w));
  const squashed = ws.join('');
  if (ws.includes(key)) return 5;
  if (initials(core) === key) return 4;
  if (initials(core.filter(w => !STOP.has(w))) === key || initials(core.filter(w => w !== 'the')) === key) return 4;
  if (squashed.includes(key)) return 3;
  if (initials(core).includes(key)) return 2;
  return 0;
}

// Picks the best-fitting league, skipping ones already linked to our other leagues.
export function pickLeague(list, short, takenIds = []) {
  const scored = list
    .filter(l => !takenIds.includes(l.league_id))
    .map(l => ({ l, s: leagueScore(l.name, short) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s);
  if (!scored.length || (scored[1] && scored[1].s === scored[0].s)) return null;
  return scored[0].l;
}

export async function matchSleeperLeague(username, league, takenIds) {
  const list = await sleeperLeagues(username);
  const hit = pickLeague(list, league, takenIds);
  if (!hit) throw new Error('Couldn\'t tell which Sleeper league is ' + league + '. Tap Connect and pick it once.');
  return { leagueId: hit.league_id, name: hit.name };
}

const isTeamDef = id => /^[A-Z]{2,3}$/.test(id);
let allPlayers = null;

// Sleeper's full player list is several MB, so only the names we have seen are cached on the device.
async function resolvePlayers(ids) {
  const cache = load(LS_PL, {});
  const missing = ids.filter(id => !cache[id] && !isTeamDef(id));
  if (missing.length) {
    allPlayers = allPlayers || await sj('players/nfl');
    missing.forEach(id => {
      const p = allPlayers[id];
      if (p) cache[id] = { n: ((p.first_name || '') + ' ' + (p.last_name || '')).trim(), p: p.position, t: p.team };
    });
    save(LS_PL, cache);
  }
  return ids.map(id => {
    if (isTeamDef(id)) return { n: defName(id), p: 'DEF', t: normTeam(id) };
    const c = cache[id];
    return c ? { n: c.n, p: c.p, t: c.t, sid: id } : { n: 'Player ' + id, p: '', t: '' };
  });
}

const realIds = list => (list || []).filter(id => id && id !== '0');

export async function syncSleeper(username, leagueId, week) {
  const uid = await sleeperUserId(username);
  const rosters = await sj('league/' + leagueId + '/rosters');
  const mine = rosters.find(r => r.owner_id === uid || (r.co_owners || []).includes(uid));
  if (!mine) throw new Error('Your team isn\'t in that Sleeper league.');
  const ms = (await sj('league/' + leagueId + '/matchups/' + week)) || [];
  const me = ms.find(m => m.roster_id === mine.roster_id);
  if (!me) throw new Error('No week ' + week + ' matchup yet.');
  const opp = ms.find(m => m.matchup_id === me.matchup_id && m.roster_id !== me.roster_id);
  const myIds = realIds(me.starters && me.starters.length ? me.starters : mine.starters);
  const opIds = realIds(opp && opp.starters);
  const players = await resolvePlayers(myIds.concat(opIds));
  // players_points covers every rostered player that week, defenses included (keyed by team).
  const pts = Object.assign({}, opp && opp.players_points, me.players_points);
  const ids = myIds.concat(opIds);
  players.forEach((p, i) => { if (typeof pts[ids[i]] === 'number') p.pts = pts[ids[i]]; });
  return {
    mine: players.slice(0, myIds.length), opp: players.slice(myIds.length),
    score: { mine: me.custom_points ?? me.points ?? null, opp: opp ? (opp.custom_points ?? opp.points ?? null) : null }
  };
}
