import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLookup, nameKey, projectionFor } from './projections.js';

const row = (id, half, extra = {}) => ({ player_id: id, stats: { pts_std: half - 2, pts_half_ppr: half, pts_ppr: half + 2 }, ...extra });

test('reads rows with nested names, team defenses and the three scoring formats', () => {
  const lk = buildLookup([
    row('4034', 18.4, { player: { first_name: 'CeeDee', last_name: 'Lamb', team: 'DAL' } }),
    row('KC', 7.1),
    row('999', 5, { team: 'LAR', player: { first_name: 'Davante', last_name: 'Adams' } })
  ]);
  assert.equal(lk.count, 3);
  assert.deepEqual(lk.byId['4034'], [16.4, 18.4, 20.4]);
  assert.equal(projectionFor(lk, { name: 'Ceedee Lamb', pos: 'WR', team: 'DAL' }), 18.4);          // matched by name, no Sleeper id
  assert.equal(projectionFor(lk, { name: 'x', pos: 'WR', team: 'DAL', sid: '4034' }, 'ppr'), 20.4);
  assert.equal(projectionFor(lk, { name: 'x', pos: 'WR', team: 'DAL', sid: '4034' }, 'std'), 16.4);
  assert.equal(projectionFor(lk, { name: 'Chiefs D/ST', pos: 'DEF', team: 'KC' }), 7.1);
  assert.equal(projectionFor(lk, { name: 'Davante Adams', pos: 'WR', team: 'LA' }), 5);             // LAR and LA are the same team
});

test('accepts an object of rows, flat stats and string numbers, and skips junk', () => {
  const lk = buildLookup({ a: { player_id: '1', pts_half_ppr: '12.5' }, b: null, c: { player_id: '2' }, d: { stats: { pts_half_ppr: 3 } } });
  assert.equal(lk.count, 1);
  assert.deepEqual(lk.byId['1'], [12.5, 12.5, 12.5]);
});

test('names rows from an index when they do not carry names', () => {
  const lk = buildLookup([row('77', 9)], { 77: { n: 'Josh Allen', t: 'BUF' } });
  assert.equal(projectionFor(lk, { name: 'Josh Allen', pos: 'QB', team: 'BUF' }), 9);
  assert.equal(buildLookup([row('77', 9)]).unnamed, 1);
});

test('name matching ignores suffixes and punctuation; unknown players give null', () => {
  assert.equal(nameKey('Marvin Harrison Jr.', 'ARI'), nameKey('Marvin Harrison', 'ARZ'));
  assert.equal(projectionFor(buildLookup([]), { name: 'Nobody', pos: 'WR', team: 'DAL' }), null);
  assert.equal(projectionFor(null, { name: 'Nobody', pos: 'WR', team: 'DAL' }), null);
});
