// Yahoo Fantasy Football lineups, read through the Supabase "yahoo" function (OAuth, read-only).
// Yahoo's JSON is oddly shaped (numbered objects, arrays of one-key objects), so the readers below are forgiving.
import { SEASON } from './season.js';
import { yahooCall } from './cloud.js';
import { defName, normTeam } from './teams.js';

// Yahoo's NFL game key for each season. Looked up live; this is only the fallback.
const FALLBACK_GAME_KEY = { 2025: 461, 2026: 475 };

const isObj = x => x && typeof x === 'object' && !Array.isArray(x);

// Every plain object in a Yahoo node folded into one: [[{a:1},{b:2}],{c:3}] -> {a:1,b:2,c:3}.
export function fold(node) {
  const out = {};
  const walk = n => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (isObj(n)) for (const [k, v] of Object.entries(n)) { if (k === 'count') continue; if (/^\d+$/.test(k)) walk(v); else if (!(k in out)) out[k] = v; }
  };
  walk(node);
  return out;
}

// The items of a Yahoo collection ({"0":{player:…},"1":{player:…},"count":2}) under a given key.
export function items(coll, key) {
  const out = [];
  if (Array.isArray(coll)) coll.forEach(c => out.push(...items(c, key)));
  else if (isObj(coll)) for (const [k, v] of Object.entries(coll)) { if (k === 'count') continue; if (/^\d+$/.test(k)) out.push(...items(v, key)); else if (k === key) out.push(v); }
  return out;
}

const POS = { 'D/ST': 'DEF', DEF: 'DEF', PK: 'K' };

export function yahooPlayer(node) {
  const p = fold(node);
  const pos = POS[p.primary_position] || String(p.primary_position || p.display_position || '').split(',')[0].toUpperCase();
  const t = normTeam(String(p.editorial_team_abbr || '').toUpperCase());
  const name = p.name && (p.name.full || [p.name.first, p.name.last].filter(Boolean).join(' '));
  const sel = fold(p.selected_position).position;
  return { key: p.player_key, slot: sel || '', n: pos === 'DEF' ? defName(t) : String(name || 'Player').trim(), p: pos, t };
}

// Starters (not bench / IR) from a roster response.
export function parseRoster(j) {
  const team = j && j.fantasy_content && j.fantasy_content.team;
  const roster = fold(team).roster;
  const players = items(fold(roster).players, 'player').map(yahooPlayer);
  return players.filter(p => p.slot && !['BN', 'IR', 'IR+', 'NA'].includes(p.slot));
}

// { playerKey: points } from a players/stats response.
export function parsePoints(j) {
  const out = {};
  const league = j && j.fantasy_content && j.fantasy_content.league;
  items(fold(league).players, 'player').forEach(node => {
    const p = fold(node);
    const total = fold(p.player_points).total;
    const n = parseFloat(total);
    if (p.player_key && !Number.isNaN(n)) out[p.player_key] = n;
  });
  return out;
}

// Finds my matchup in a scoreboard response: { mine: {key, points}, opp: {key, points} }.
export function parseScoreboard(j, teamKey) {
  const league = j && j.fantasy_content && j.fantasy_content.league;
  const sb = fold(league).scoreboard;
  const matchups = items(fold(sb).matchups, 'matchup');
  for (const m of matchups) {
    const teams = items(fold(m).teams, 'team').map(t => {
      const f = fold(t);
      return { key: f.team_key, points: parseFloat(fold(f.team_points).total) };
    });
    const i = teams.findIndex(t => t.key === teamKey);
    if (i >= 0 && teams.length > 1) {
      const num = t => Number.isNaN(t.points) ? null : t.points;
      const mine = teams[i], opp = teams[1 - i];
      return { mine: { key: mine.key, points: num(mine) }, opp: { key: opp.key, points: num(opp) } };
    }
  }
  throw new Error('No week matchup for your Yahoo team yet.');
}

const strip = ({ key, slot, ...p }) => p; // eslint-disable-line no-unused-vars

export function build(mine, opp, mineSide, oppSide, pts) {
  const side = list => list.map(p => { const o = strip(p); if (pts[p.key] != null) o.pts = pts[p.key]; return o; });
  return { mine: side(mine), opp: side(opp), score: { mine: mineSide.points, opp: oppSide.points } };
}

const req = (path) => yahooCall({ action: 'request', path }).then(r => r.data);

// Which of the account's Yahoo fantasy football leagues/teams (for the picker).
export async function yahooLeagues() {
  let key = FALLBACK_GAME_KEY[SEASON];
  try {
    const gj = await req("game/nfl"); const g = fold(gj.fantasy_content && gj.fantasy_content.game);
    if (g.game_key) key = Number(g.game_key);
  } catch (e) { if (e.message === 'not_connected') throw e; }
  const j = await req('users;use_login=1/games;game_keys=' + key + '/teams');
  const users = items(fold(j.fantasy_content).users, 'user');
  const out = [];
  users.forEach(u => items(fold(fold(u).games), 'game').forEach(g => items(fold(g).teams, 'team').forEach(t => {
    const f = fold(t);
    if (!f.team_key) return;
    out.push({ teamKey: f.team_key, teamName: f.name, leagueKey: String(f.team_key).replace(/\.t\.\d+$/, '') });
  })));
  return out;
}

export async function syncYahoo(leagueKey, teamKey, week) {
  if (!leagueKey || !teamKey) throw new Error('Pick your Yahoo team under Source.');
  const sb = parseScoreboard(await req('league/' + leagueKey + '/scoreboard;week=' + week), teamKey);
  const [mj, oj] = await Promise.all([req('team/' + sb.mine.key + '/roster;week=' + week), req('team/' + sb.opp.key + '/roster;week=' + week)]);
  const mine = parseRoster(mj), opp = parseRoster(oj);
  if (!mine.length) throw new Error('Yahoo has no starters for week ' + week + ' yet.');
  const pts = {};
  for (const list of [mine, opp]) {
    const keys = list.map(p => p.key).filter(Boolean);
    if (keys.length) Object.assign(pts, parsePoints(await req('league/' + leagueKey + '/players;player_keys=' + keys.join(',') + '/stats;type=week;week=' + week)));
  }
  return build(mine, opp, sb.mine, sb.opp, pts);
}

// ── sign-in round trip ──
const RET = 'ff-yahoo-return';
export const yahooRedirect = () => location.origin + location.pathname;

export async function startYahooSignIn(league) {
  const state = 'yh_' + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => (b % 36).toString(36)).join('');
  const r = await yahooCall({ action: 'authorize', redirectUri: yahooRedirect(), state });
  try { sessionStorage.setItem(RET, JSON.stringify({ state, league, at: Date.now() })); } catch (e) { /* private mode */ }
  location.assign(r.url);
}

export const yahooStatus = () => yahooCall({ action: 'status' });
export const yahooDisconnect = () => yahooCall({ action: 'disconnect' });
export const yahooFinish = code => yahooCall({ action: 'exchange', code, redirectUri: yahooRedirect() });
