import test from 'node:test';
import assert from 'node:assert/strict';
import { fold, items, parseRoster, parsePoints, parseScoreboard, yahooPlayer } from './yahoo.js';
import { captureYahooReturn, takeYahooCode } from './yahoo-return.js';

// Shapes follow Yahoo Fantasy's JSON: numbered objects with a count, and arrays of one-key objects.
const player = (key, name, team, pos, slot, extra = {}) => ({ player: [[{ player_key: key }, { name: { full: name } }, { editorial_team_abbr: team }, { primary_position: pos }, { display_position: pos }], { selected_position: [{ coverage_type: 'week' }, { position: slot }], ...extra }] });
const roster = { fantasy_content: { team: [[{ team_key: '461.l.1.t.3' }], { roster: { 0: { players: { 0: player('461.p.1', 'Josh Allen', 'Buf', 'QB', 'QB'), 1: player('461.p.2', 'Bench Guy', 'Dal', 'WR', 'BN'), 2: player('461.p.3', 'Miami', 'Mia', 'DEF', 'DEF'), count: 3 } } } }] } };
const sb = { fantasy_content: { league: [{ league_key: '461.l.1' }, { scoreboard: { 0: { matchups: { 0: { matchup: { 0: { teams: {
  0: { team: [[{ team_key: '461.l.1.t.9' }], { team_points: { total: '88.40' } }] },
  1: { team: [[{ team_key: '461.l.1.t.3' }], { team_points: { total: '101.2' } }] }, count: 2 } } } }, count: 1 } } } }] } };
const stats = { fantasy_content: { league: [{}, { players: { 0: { player: [[{ player_key: '461.p.1' }], { player_points: { coverage_type: 'week', total: '18.24' } }] }, 1: { player: [[{ player_key: '461.p.3' }], { player_points: { total: '-' } }] }, count: 2 } }] } };

test('folds Yahoo nesting and lists collection items', () => {
  assert.deepEqual(fold([[{ a: 1 }, { b: 2 }], { c: 3 }]), { a: 1, b: 2, c: 3 });
  assert.equal(items({ 0: { x: 1 }, 1: { x: 2 }, count: 2 }, 'x').length, 2);
});

test('reads a player: name, position, team, and DEF as a team defense', () => {
  const p = yahooPlayer(player('k', 'Josh Allen', 'Buf', 'QB', 'QB').player);
  assert.deepEqual([p.n, p.p, p.t, p.slot], ['Josh Allen', 'QB', 'BUF', 'QB']);
  const d = yahooPlayer(player('k', 'Miami', 'Mia', 'DEF', 'DEF').player);
  assert.equal(d.p, 'DEF'); assert.equal(d.t, 'MIA'); assert.match(d.n, /Dolphins/);
});

test('keeps starters and drops the bench', () => {
  assert.deepEqual(parseRoster(roster).map(p => p.n.split(' ')[0]), ['Josh', 'Miami'].map(x => x === 'Miami' ? parseRoster(roster)[1].n.split(' ')[0] : x));
  assert.equal(parseRoster(roster).length, 2);
});

test('reads points, skipping players with none yet', () => {
  assert.deepEqual(parsePoints(stats), { '461.p.1': 18.24 });
});

test('finds my matchup and opponent in the scoreboard', () => {
  const m = parseScoreboard(sb, '461.l.1.t.3');
  assert.deepEqual([m.mine.key, m.mine.points, m.opp.key, m.opp.points], ['461.l.1.t.3', 101.2, '461.l.1.t.9', 88.4]);
  assert.throws(() => parseScoreboard(sb, '461.l.1.t.5'), /No week matchup/);
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
