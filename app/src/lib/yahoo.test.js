import test from 'node:test';
import assert from 'node:assert/strict';
import { fold, items, parseRoster, parseScoreboard, parseSettings, yahooPlayer, syncYahoo, yahooLeagues, ttlFor } from './yahoo.js';
import { createRequester } from './yahoo-poll.js';
import { _resetPlayerIds, _resetWarnings } from './playerids.js';
import { captureYahooReturn, takeYahooCode } from './yahoo-return.js';

// Shapes follow Yahoo Fantasy's JSON: numbered objects with a count, and arrays of one-key objects.
const player = (key, name, team, pos, slot, pts, extra = []) => ({ player: [[{ player_key: '461.p.' + key }, { player_id: String(key) }, { name: { full: name } }, { editorial_team_abbr: team }, { primary_position: pos }, { display_position: pos }, ...extra],
  { selected_position: [{ coverage_type: 'week', week: '5' }, { position: slot }] }, { player_stats: { coverage_type: 'week', stats: [] } }, { player_points: { coverage_type: 'week', week: '5', total: pts } }] });
const roster = (teamKey, players) => ({ fantasy_content: { team: [[{ team_key: teamKey }], { roster: { coverage_type: 'week', week: '5', 0: { players: { ...Object.fromEntries(players.map((p, i) => [i, p])), count: players.length } } } }] } });
const myRoster = roster('461.l.1.t.3', [
  player(30121, 'Patrick Mahomes', 'KC', 'QB', 'QB', '22.40'),
  player(40012, "Ja'Tavion Sanders", 'Car', 'TE', 'TE', '-'),                    // not played yet
  player(100014, 'Houston', 'Hou', 'DEF', 'DEF', '8.00'),
  player(31005, 'Bench Guy', 'Dal', 'WR', 'BN', '9.0'),
  player(31006, 'Injured Guy', 'Dal', 'RB', 'IR', '0'),
  player(31007, 'On A Bye', 'Det', 'WR', 'WR', '-', [{ bye_weeks: { week: '5' } }]),
  { player: [[{ player_key: '' }], { selected_position: [{ position: 'RB' }] }] }          // an empty slot
]);
const oppRoster = roster('461.l.1.t.9', [player(77777, 'Mystery Man', 'Atl', 'WR', 'WR', '12.5')]);
const scoreboard = { fantasy_content: { league: [{ league_key: '461.l.1' }, { scoreboard: { 0: { matchups: { 0: { matchup: { 0: { teams: {
  0: { team: [[{ team_key: '461.l.1.t.9' }], { team_points: { coverage_type: 'week', total: '88.40' } }] },
  1: { team: [[{ team_key: '461.l.1.t.3' }], { team_points: { coverage_type: 'week', total: '101.2' } }] }, count: 2 } } } }, count: 1 } } } }] } };
const settings = { fantasy_content: { league: [{ league_key: '461.l.1' }, { settings: [{ stat_modifiers: { stats: [{ stat: { stat_id: '4', value: '0.04' } }, { stat: { stat_id: '5', value: '6' } }, { stat: { stat_id: '11', value: '1' } }, { stat: { stat_id: '9', value: '0.1' } }] } }] }] } };
const leaguesJson = { fantasy_content: { users: { 0: { user: [{ guid: 'g' }, { games: { 0: { game: [{ game_key: '461' }, { leagues: { 0: { league: [{ league_key: '461.l.1', name: 'Sunday Funday', season: '2026', num_teams: '12' }] }, 1: { league: [{ league_key: '461.l.2', name: 'Old League', season: '2025' }] }, count: 2 } }] }, count: 1 } }] }, count: 1 } } };
const teamsJson = { fantasy_content: { users: { 0: { user: [{ guid: 'g' }, { games: { 0: { game: [{ game_key: '461' }, { teams: { 0: { team: [[{ team_key: '461.l.1.t.3' }, { name: 'Zach\'s Team' }]] }, 1: { team: [[{ team_key: '461.l.2.t.1' }, { name: 'Old Team' }]] }, count: 2 } }] }, count: 1 } }] }, count: 1 } } };

test('folds Yahoo nesting and lists collection items', () => {
  assert.deepEqual(fold([[{ a: 1 }, { b: 2 }], { c: 3 }]), { a: 1, b: 2, c: 3 });
  assert.equal(items({ 0: { x: 1 }, 1: { x: 2 }, count: 2 }, 'x').length, 2);
});

test('reads a player with Yahoo\'s own points, and a team defense by team', () => {
  const p = yahooPlayer(player(30121, 'Patrick Mahomes', 'KC', 'QB', 'QB', '22.40').player);
  assert.deepEqual([p.n, p.p, p.t, p.slot, p.pts, p.yid], ['Patrick Mahomes', 'QB', 'KC', 'QB', 22.4, '30121']);
  const d = yahooPlayer(player(100014, 'Houston', 'Hou', 'DEF', 'DEF', '8.00').player);
  assert.deepEqual([d.p, d.t, d.pts], ['DEF', 'HOU', 8]);
  assert.match(d.n, /Texans/);
  assert.equal(yahooPlayer(player(1, 'X Y', 'Dal', 'WR', 'WR', '-').player).pts, undefined);       // "-" is no number, not zero
});

test('keeps starters only: bench, IR and empty slots are dropped; byes are flagged', () => {
  const r = parseRoster(myRoster);
  assert.deepEqual(r.map(p => p.n.split(' ')[0]), ['Patrick', "Ja'Tavion", 'Texans', 'On']);
  assert.equal(r.find(p => p.n === 'On A Bye').bye, '5');
});

test('finds my matchup and opponent in the scoreboard, and says so when there isn\'t one', () => {
  const m = parseScoreboard(scoreboard, '461.l.1.t.3');
  assert.deepEqual([m.mine.key, m.mine.points, m.opp.key, m.opp.points], ['461.l.1.t.3', 101.2, '461.l.1.t.9', 88.4]);
  assert.throws(() => parseScoreboard(scoreboard, '461.l.1.t.5'), /No week matchup/);
});

test('reads scoring rules from league settings', () => {
  const r = parseSettings(settings);
  assert.deepEqual([r.passYd, r.passTd, r.rec, r.rushYd], [0.04, 6, 1, 0.1]);
  assert.equal(parseSettings({ fantasy_content: { league: [{}] } }), null);
});

// A fake Yahoo: answers by path, counts calls.
function fakeYahoo(extra = {}) {
  const hits = [];
  const answers = {
    'league/461.l.1/scoreboard;week=5': scoreboard,
    'team/461.l.1.t.3/roster;week=5/players/stats': myRoster,
    'team/461.l.1.t.9/roster;week=5/players/stats': oppRoster,
    'league/461.l.1/settings': settings,
    'users;use_login=1/games;game_keys=nfl/leagues': leaguesJson,
    'users;use_login=1/games;game_keys=nfl/teams': teamsJson, ...extra
  };
  const http = createRequester(async path => { hits.push(path); const a = answers[path]; if (a instanceof Error) throw a; if (!a) throw Object.assign(new Error('nope ' + path), { code: 'helper' }); return a; });
  return { http, hits };
}

test('turns a Yahoo league into the same shape as Sleeper and ESPN, ids and custom scoring included', async () => {
  _resetPlayerIds();
  const { http, hits } = fakeYahoo();
  const res = await syncYahoo('461.l.1', '461.l.1.t.3', 5, http);
  assert.deepEqual(res.score, { mine: 101.2, opp: 88.4 });
  assert.deepEqual(res.mine.map(p => [p.n.split(' ')[0], p.p, p.t, p.pts]), [['Patrick', 'QB', 'KC', 22.4], ["Ja'Tavion", 'TE', 'CAR', undefined], ['Texans', 'DEF', 'HOU', 8], ['On', 'WR', 'DET', undefined]]);
  assert.deepEqual(res.opp.map(p => [p.n, p.pts]), [['Mystery Man', 12.5]]);
  assert.equal(res.scoring, 'ppr');                                      // reception points 1 in this league
  assert.equal(res.rules.passTd, 6);
  assert.equal(hits.filter(h => h.includes('roster')).length, 2);        // one roster-with-stats call per team
  await syncYahoo('461.l.1', '461.l.1.t.3', 5, http);                    // second poll: cached, no new calls
  assert.equal(hits.length, 4);                                          // scoreboard, two rosters, settings
});

test('maps Yahoo ids to Sleeper and ESPN ids, falling back to name, and logs who could not be matched', async () => {
  _resetPlayerIds(); _resetWarnings();
  const { loadPlayerIds } = await import('./playerids.js');
  await loadPlayerIds(async () => ({ ok: true, json: async () => ({ map: { '30121': ['4046', '3139477', 'Patrick Mahomes', 'KC', 'QB'], '99': ['7', '8', "Ja'Tavion Sanders", 'CAR', 'TE'] } }) }), '/');
  const warns = []; const w = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  try {
    const { http } = fakeYahoo();
    const res = await syncYahoo('461.l.1', '461.l.1.t.3', 5, http);
    assert.deepEqual([res.mine[0].sid, res.mine[0].eid], ['4046', 3139477]);      // by Yahoo id
    assert.deepEqual([res.mine[1].sid, res.mine[1].eid], ['7', 8]);                // Yahoo id 40012 isn't in the table: matched by name
    assert.equal(res.opp[0].sid, undefined);                                        // Mystery Man: no match, still listed
    assert.ok(warns.some(x => /Mystery Man/.test(x)));
  } finally { console.warn = w; _resetPlayerIds(); }
});

test('lists every Yahoo team on the account with its league name, current season only', async () => {
  const { http } = fakeYahoo();
  const list = await yahooLeagues(http);
  assert.deepEqual(list, [{ teamKey: '461.l.1.t.3', teamName: "Zach's Team", leagueKey: '461.l.1', leagueName: 'Sunday Funday', teams: '12' }]);
});

test('a bye or playoff week with no matchup says so; a refused login or rate limit is reported plainly', async () => {
  const none = fakeYahoo({ 'league/461.l.1/scoreboard;week=5': { fantasy_content: { league: [{}, { scoreboard: { 0: { matchups: { count: 0 } } } }] } } });
  await assert.rejects(syncYahoo('461.l.1', '461.l.1.t.3', 5, none.http), /No week matchup/);
  const reauth = fakeYahoo({ 'league/461.l.1/scoreboard;week=5': Object.assign(new Error('Yahoo needs you to sign in again.'), { code: 'needs_reauth' }) });
  await assert.rejects(syncYahoo('461.l.1', '461.l.1.t.3', 5, reauth.http), e => e.code === 'needs_reauth');
  const slow = fakeYahoo({ 'league/461.l.1/scoreboard;week=5': Object.assign(new Error('x'), { code: 'upstream_status', status: 999 }) });
  await assert.rejects(syncYahoo('461.l.1', '461.l.1.t.3', 5, slow.http), e => e.code === 'backoff' && /rate limiting/.test(e.message));
  await assert.rejects(syncYahoo('461.l.1', '461.l.1.t.3', 5, slow.http), e => e.code === 'backoff' && /slow down/.test(e.message));     // second try waits, no new call
});

test('settings are optional: a sync still works if they can\'t be read', async () => {
  const { http } = fakeYahoo({ 'league/461.l.1/settings': Object.assign(new Error('x'), { code: 'upstream_status', status: 500 }) });
  const res = await syncYahoo('461.l.1', '461.l.1.t.3', 5, http);
  assert.equal(res.rules, undefined);
  assert.equal(res.score.mine, 101.2);
});

test('cache lifetimes: settings a day, league lists an hour, scores short', () => {
  assert.equal(ttlFor('league/1/settings', 5), 86400000);
  assert.equal(ttlFor('users;use_login=1/games;game_keys=nfl/teams', 5), 3600000);
  assert.ok(ttlFor('league/1/scoreboard;week=5', 5) >= 45000);
});

test('keeps the Yahoo code only when the state matches the sign-in we started', () => {
  const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; }, removeItem: k => { delete m[k]; } }; };
  const hist = { url: '', replaceState(_a, _b, u) { this.url = u; } };
  const store = mem();
  store.setItem('ff-yahoo-return', JSON.stringify({ state: 'yh_abc12345', league: 'Dynasty', at: Date.now() }));
  assert.equal(captureYahooReturn({ search: '?code=XYZ&state=yh_abc12345', pathname: '/app/', hash: '' }, hist, store), true);
  assert.equal(hist.url, '/app/');
  assert.deepEqual(takeYahooCode(store), { code: 'XYZ', league: 'Dynasty' });
  assert.equal(takeYahooCode(store), null);
  const other = mem();
  other.setItem('ff-yahoo-return', JSON.stringify({ state: 'yh_abc12345', league: 'L', at: Date.now() }));
  captureYahooReturn({ search: '?code=EVIL&state=yh_zzzzzzzz', pathname: '/', hash: '' }, hist, other);
  assert.equal(takeYahooCode(other), null);
});

test('the Sync button skips the cache; automatic refreshes use it', async () => {
  const { http, hits } = fakeYahoo();
  await syncYahoo('461.l.1', '461.l.1.t.3', 5, http);
  const first = hits.length;
  await syncYahoo('461.l.1', '461.l.1.t.3', 5, http);
  assert.equal(hits.length, first);
  await syncYahoo('461.l.1', '461.l.1.t.3', 5, http, { fresh: true });
  assert.equal(hits.length, first + 3);                              // scoreboard and both rosters again; settings stay cached
});
