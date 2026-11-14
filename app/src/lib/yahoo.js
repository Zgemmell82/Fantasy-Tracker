// Yahoo Fantasy Football, read through the Supabase "yahoo" function (OAuth 2.0, read-only). Everything is turned into
// the same shape the Sleeper and ESPN providers return, { mine, opp, score, scoring?, rules? }, so The Huddle, Live
// Feed and Two-Minute Drill need nothing Yahoo-specific.
//
// Yahoo's own points are used as they come ("player_points" and "team_points"), so custom league scoring is respected
// and nothing is recomputed here. Yahoo's JSON is oddly shaped (numbered objects, arrays of one-key objects), so the
// readers below are forgiving.
import { SEASON } from './season.js';
import { YahooError, yahooCall } from './cloud.js';
import { defName, normTeam } from './teams.js';
import { createRequester, YahooBackoff } from './yahoo-poll.js';
import { loadPlayerIds, logUnmatched, matchYahooPlayer } from './playerids.js';
import { formatOf, yahooRules } from './scoring.js';
import { liveNow } from './games.js';
import { load, save } from './store.js';

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
const NOT_STARTING = new Set(['BN', 'IR', 'IR+', 'NA']);

// One player from a roster/players/stats response.
export function yahooPlayer(node) {
  const p = fold(node);
  const pos = POS[p.primary_position] || POS[p.display_position] || String(p.primary_position || p.display_position || '').split(',')[0].toUpperCase();
  const t = normTeam(String(p.editorial_team_abbr || '').toUpperCase());
  const name = p.name && (p.name.full || [p.name.first, p.name.last].filter(Boolean).join(' '));
  const pts = parseFloat(fold(p.player_points).total);      // "-" before a game or on a bye: no number
  return {
    key: p.player_key, yid: String(p.player_id || String(p.player_key || '').split('.p.')[1] || ''),
    slot: fold(p.selected_position).position || '',
    n: pos === 'DEF' ? defName(t) : String(name || 'Player').trim(), p: pos, t,
    pts: Number.isNaN(pts) ? undefined : pts,
    bye: String(fold(p.bye_weeks).week || '')
  };
}

// The starters of a roster response (bench, IR and empty slots are left out). Anyone without a player key is an empty slot.
export function parseRoster(j) {
  const team = j && j.fantasy_content && j.fantasy_content.team;
  const roster = fold(team).roster;
  return items(fold(roster).players, 'player').map(yahooPlayer)
    .filter(p => p.key && p.slot && !NOT_STARTING.has(p.slot));
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
  throw new Error('No week matchup for your Yahoo team yet (a bye week or the playoffs, perhaps).');
}

// Scoring rules from a league settings response, if it lists them.
export function parseSettings(j) {
  const league = j && j.fantasy_content && j.fantasy_content.league;
  const settings = fold(fold(league).settings);
  return yahooRules(items(fold(settings.stat_modifiers).stats, 'stat'));
}

// Players in the shape the app uses, with ids from the DynastyProcess table where it has them. Returns the players and
// the ones that couldn't be matched (those still show up, by name).
export function normalize(list, table) {
  const unmatched = [];
  const players = list.map(p => {
    const m = matchYahooPlayer(table, { yid: p.yid, name: p.n, team: p.t, pos: p.p });
    if (m.how === 'none') unmatched.push({ yid: p.yid, name: p.n, team: p.t, pos: p.p });
    return { n: p.n, p: p.p, t: p.t, ...(p.pts != null ? { pts: p.pts } : {}), ...(m.sid ? { sid: m.sid } : {}), ...(m.eid ? { eid: m.eid } : {}) };
  });
  return { players, unmatched };
}

export function build(mine, opp, mineSide, oppSide, table) {
  const a = normalize(mine, table), b = normalize(opp, table);
  return { res: { mine: a.players, opp: b.players, score: { mine: mineSide.points, opp: oppSide.points } }, unmatched: [...a.unmatched, ...b.unmatched] };
}

// ── requests: cached between polls, shared backoff, stop on a refused login ──
export const yahooHttp = createRequester(path => yahooCall({ action: 'request', path }).then(r => r.data));
const DAY = 86400000, HOUR = 3600000;
// How long an answer stays good: settings barely change; scores and rosters move during games.
export const ttlFor = (path, week) => /\/settings$/.test(path) ? DAY : /game_keys=/.test(path) ? HOUR : (liveNow(week) ? 45000 : 10 * 60000);
const req = (http, path, week, fresh) => http.request(path, { ttl: fresh ? 0 : ttlFor(path, week) });

// A league's own scoring rules, kept on the device for a day.
async function leagueRules(http, leagueKey, week, fresh) {
  const k = 'ff-yahoo-rules-' + leagueKey, saved = load(k, null);
  if (saved && Date.now() - saved.at < DAY) return saved.rules;
  try {
    const rules = parseSettings(await req(http, 'league/' + leagueKey + '/settings', week, false));
    save(k, { at: Date.now(), rules });
    return rules;
  } catch (e) { return saved ? saved.rules : null; }          // rules only price play-by-play estimates: never worth failing a sync
}

// Which of the account's Yahoo fantasy football teams there are, with their league names (for the picker).
export async function yahooLeagues(http = yahooHttp) {
  const [lj, tj] = await Promise.all([req(http, 'users;use_login=1/games;game_keys=nfl/leagues'), req(http, 'users;use_login=1/games;game_keys=nfl/teams')]);
  const leagues = {};
  items(fold(lj.fantasy_content).users, 'user').forEach(u => items(fold(fold(u).games), 'game').forEach(g => items(fold(g).leagues, 'league').forEach(l => {
    const f = fold(l);
    if (f.league_key) leagues[f.league_key] = { name: f.name, season: Number(f.season) || 0, teams: f.num_teams };
  })));
  const out = [];
  items(fold(tj.fantasy_content).users, 'user').forEach(u => items(fold(fold(u).games), 'game').forEach(g => items(fold(g).teams, 'team').forEach(t => {
    const f = fold(t);
    if (!f.team_key) return;
    const leagueKey = String(f.team_key).replace(/\.t\.\d+$/, '');
    const lg = leagues[leagueKey] || {};
    if (lg.season && lg.season !== SEASON) return;
    out.push({ teamKey: f.team_key, teamName: f.name, leagueKey, leagueName: lg.name || '', teams: lg.teams });
  })));
  return out;
}

// What a failure means to the person looking at the app.
const explain = e => {
  if (e instanceof YahooBackoff) return Object.assign(new Error(e.message), { code: 'backoff' });
  if (e && e.code === 'upstream_status' && (e.status === 999 || e.status === 429)) return Object.assign(new Error('Yahoo is rate limiting this app. Lineups will refresh on their own in a few minutes.'), { code: 'backoff' });
  return e;
};

// fresh: skip the cache (the Sync button). Backoff and a refused login still apply.
export async function syncYahoo(leagueKey, teamKey, week, http = yahooHttp, { fresh = false } = {}) {
  if (!leagueKey || !teamKey) throw new Error('Pick your Yahoo team under Source.');
  try {
    const sb = parseScoreboard(await req(http, 'league/' + leagueKey + '/scoreboard;week=' + week, week, fresh), teamKey);
    const roster = key => req(http, 'team/' + key + '/roster;week=' + week + '/players/stats', week, fresh);
    const [mj, oj, rules, table] = await Promise.all([roster(sb.mine.key), roster(sb.opp.key), leagueRules(http, leagueKey, week, fresh), loadPlayerIds()]);
    const mine = parseRoster(mj), opp = parseRoster(oj);
    if (!mine.length) throw new Error('Yahoo has no starters for week ' + week + ' yet.');
    const { res, unmatched } = build(mine, opp, sb.mine, sb.opp, table);
    logUnmatched(unmatched);
    return { ...res, ...(rules ? { rules, scoring: formatOf(rules) } : {}) };
  } catch (e) { throw explain(e); }
}

// ── sign-in round trip ──
const RET = 'ff-yahoo-return';
export const yahooRedirect = () => location.origin + location.pathname;

export async function startYahooSignIn(league) {
  const state = 'yh_' + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => (b % 36).toString(36)).join('');
  const r = await yahooCall({ action: 'authorize', redirectUri: yahooRedirect(), state });
  try { sessionStorage.setItem(RET, JSON.stringify({ state, league: league || null, at: Date.now() })); } catch (e) { /* private mode */ }
  location.assign(r.url);
}

// { connected, needsReauth, configured }
export const yahooStatus = () => yahooCall({ action: 'status' });
export const yahooDisconnect = () => yahooCall({ action: 'disconnect' }).then(r => { yahooHttp.resetAuth(); return r; });
export const yahooFinish = code => yahooCall({ action: 'exchange', code, redirectUri: yahooRedirect() }).then(r => { yahooHttp.resetAuth(); return r; });
