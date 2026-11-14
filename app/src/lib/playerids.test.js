import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTable, matchYahooPlayer, loadPlayerIds, _resetPlayerIds } from './playerids.js';

const raw = {
  '30121': ['4046', '3139477', 'Patrick Mahomes', 'KC', 'QB'],
  '40012': ['9221', '4567048', "Ja'Tavion Sanders", 'CAR', 'TE'],
  '31005': ['7001', '', 'Marvin Harrison Jr.', 'ARI', 'WR'],
  '55555': ['8888', '999', 'Washington, Cam', 'LV', 'RB']
};
const t = buildTable(raw);

test('matches by Yahoo id first', () => {
  assert.deepEqual(matchYahooPlayer(t, { yid: '30121', name: 'Whatever', team: 'KC', pos: 'QB' }), { sid: '4046', eid: 3139477, how: 'id' });
});

test('falls back to name, team and position when the id is missing, ignoring suffixes and "Last, First"', () => {
  assert.equal(matchYahooPlayer(t, { yid: '1', name: 'Marvin Harrison', team: 'ARI', pos: 'WR' }).sid, '7001');   // Jr. dropped
  assert.equal(matchYahooPlayer(t, { yid: '2', name: 'Cam Washington', team: 'LV', pos: 'RB' }).how, 'name');       // table said "Last, First"
  assert.equal(matchYahooPlayer(t, { yid: '3', name: 'Patrick Mahomes', team: 'KCC', pos: 'QB' }).how, 'name');     // KCC is KC
});

test('does not guess across teams or positions, and team defenses need no table', () => {
  assert.equal(matchYahooPlayer(t, { yid: '4', name: 'Patrick Mahomes', team: 'DAL', pos: 'QB' }).how, 'none');
  assert.equal(matchYahooPlayer(t, { yid: '5', name: 'Patrick Mahomes', team: 'KC', pos: 'WR' }).how, 'none');
  assert.equal(matchYahooPlayer(t, { yid: '100014', name: 'Houston', team: 'HOU', pos: 'DEF' }).how, 'id');
});

test('loads the table from playerids.json, and copes with it missing', async () => {
  _resetPlayerIds();
  const ok = await loadPlayerIds(async () => ({ ok: true, json: async () => ({ map: raw }) }), '/app/');
  assert.equal(Object.keys(ok.map).length, 4);
  _resetPlayerIds();
  const none = await loadPlayerIds(async () => ({ ok: false, status: 404 }), '/app/');
  assert.deepEqual(Object.keys(none.map), []);
  assert.equal(matchYahooPlayer(none, { yid: '30121', name: 'Patrick Mahomes', team: 'KC', pos: 'QB' }).how, 'none');
  _resetPlayerIds();
});
