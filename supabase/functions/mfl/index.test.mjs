import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from './index.ts';

const call = (body, fetchImpl, method = 'POST') =>
  handle(new Request('http://x/mfl', { method, body: method === 'POST' ? JSON.stringify(body) : undefined }), fetchImpl).then(r => r.json());
const upstream = (json, status = 200) => async url => { upstream.last = String(url); return new Response(typeof json === 'string' ? json : JSON.stringify(json), { status }); };

test('fetches live scoring from MFL and passes the data back', async () => {
  const out = await call({ type: 'liveScoring', year: 2026, params: { L: '21586', W: '5' } }, upstream({ liveScoring: { week: '5' } }));
  assert.deepEqual(out, { ok: true, data: { liveScoring: { week: '5' } } });
  assert.match(upstream.last, /^https:\/\/api\.myfantasyleague\.com\/2026\/export\?TYPE=liveScoring&JSON=1&L=21586&W=5$/);
});

test('only talks to MFL, and only for the allowed kinds of data', async () => {
  assert.equal((await call({ type: 'import', year: 2026, params: { L: '1' } }, upstream({}))).ok, false);
  assert.equal((await call({ type: 'liveScoring', year: 'x', params: { L: '1' } }, upstream({}))).ok, false);
  assert.equal((await call({ type: 'liveScoring', year: 2026, params: { L: '1', HOST: 'evil.com' } }, upstream({}))).ok, false);
  assert.equal((await call({ type: 'liveScoring', year: 2026, params: { L: '1/../../x' } }, upstream({}))).ok, false);
  assert.equal((await call({ type: 'liveScoring', year: 2026, params: {} }, upstream({}))).ok, false);
});

test('sends the API key once-encoded, even if it was pasted already encoded', async () => {
  await call({ type: 'liveScoring', year: 2026, params: { L: '1' }, apiKey: 'ab%2Bcd%3D' }, upstream({}));
  assert.match(upstream.last, /APIKEY=ab%2Bcd%3D$/);
  const bad = await call({ type: 'liveScoring', year: 2026, params: { L: '1' }, apiKey: 'a b&c=d' }, upstream({}));
  assert.equal(bad.ok, false);
});

test('looks up players by id', async () => {
  const out = await call({ type: 'players', year: 2026, params: { DETAILS: '0', PLAYERS: '13604,14802' } }, upstream({ players: { player: [] } }));
  assert.equal(out.ok, true);
  assert.match(upstream.last, /PLAYERS=13604%2C14802/);
});

test('explains failures instead of throwing', async () => {
  assert.match((await call({ type: 'liveScoring', year: 2026, params: { L: '1' } }, upstream('<html>nope</html>'))).error, /something other than data/);
  assert.match((await call({ type: 'liveScoring', year: 2026, params: { L: '1' } }, async () => { throw new Error('down'); })).error, /Couldn't reach/);
  assert.match((await call({ type: 'liveScoring', year: 2026, params: { L: '1' } }, upstream('x', 500))).error, /500/);
  assert.equal((await call(null, upstream({}), 'GET')).ok, false);
});
