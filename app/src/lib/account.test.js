import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudState, hydrate, mergeConn } from './account.js';

test('a new account starts empty, with none of the original owner\'s leagues or links', () => {
  const db = hydrate({});
  assert.deepEqual(db.leagues, []);
  assert.equal(db.sleeperUser, '');
  assert.deepEqual(db.conn, {});
});

test('a league named like a built-in one gets no built-in lineup or link', () => {
  const db = hydrate({ leagues: [{ name: 'RDL', color: '#fff' }] }, { week: 4 });
  assert.deepEqual(db.data[4].RDL, { mine: [], opp: [] });
  assert.deepEqual(db.conn.RDL, { source: 'manual' });
});

test('the owner\'s import seeds the built-in lineups and links', () => {
  const db = hydrate({ leagues: [{ name: 'RDL', color: '#fff' }] }, { week: 1, builtin: true, defaults: { RDL: { source: 'sleeper' } } });
  assert.ok(db.data[1].RDL.mine.length > 0);
  assert.equal(db.conn.RDL.source, 'sleeper');
});

test('only account data is saved to the cloud, not the open week or sync results', () => {
  const db = hydrate({ leagues: [{ name: 'A', color: '#fff' }] });
  assert.deepEqual(Object.keys(cloudState(db)).sort(), ['conn', 'data', 'espnHelper', 'leagues', 'scored', 'sleeperUser']);
});

test('keeps explicit FFPC and linked connections', () => {
  const c = mergeConn({ A: { source: 'ffpc' }, B: { source: 'mfl', leagueId: '1' }, C: { source: 'manual' } }, ['A', 'B', 'C']);
  assert.equal(c.A.source, 'ffpc');
  assert.equal(c.B.leagueId, '1');
  assert.equal(c.C.source, 'manual');
});
