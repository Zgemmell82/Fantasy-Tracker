import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequester, YahooBackoff, BACKOFF_FIRST_MS, BACKOFF_MAX_MS } from './yahoo-poll.js';

const err = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });
const clock = () => { let t = 1e6; return { now: () => t, tick: ms => { t += ms; } }; };

test('answers repeat requests from the cache until they go stale', async () => {
  const c = clock(); let n = 0;
  const y = createRequester(async () => ({ n: ++n }), { now: c.now, random: () => 0 });
  assert.deepEqual(await y.request('a', { ttl: 45000 }), { n: 1 });
  c.tick(30000);
  assert.deepEqual(await y.request('a', { ttl: 45000 }), { n: 1 });      // still fresh
  c.tick(20000);
  assert.deepEqual(await y.request('a', { ttl: 45000 }), { n: 2 });      // stale: asked again
  assert.deepEqual(await y.request('b'), { n: 3 });                       // no ttl means always ask
});

test('identical requests at the same moment share one call', async () => {
  let n = 0;
  const y = createRequester(async () => { n++; await new Promise(r => setTimeout(r, 5)); return 'x'; });
  const all = await Promise.all([y.request('a'), y.request('a'), y.request('a')]);
  assert.deepEqual(all, ['x', 'x', 'x']);
  assert.equal(n, 1);
});

test('backs off after a 999, then 429, growing each time and shared across paths', async () => {
  const c = clock(); let calls = 0, fail = true;
  const y = createRequester(async () => { calls++; if (fail) throw err('upstream_status', { status: calls === 1 ? 999 : 429 }); return 'ok'; }, { now: c.now, random: () => 0 });
  await assert.rejects(y.request('a'), e => e.status === 999);
  await assert.rejects(y.request('b'), e => e instanceof YahooBackoff && e.waitMs <= BACKOFF_FIRST_MS);   // a different path waits too
  assert.equal(calls, 1);                                                                                   // and made no call
  c.tick(BACKOFF_FIRST_MS + 1);
  await assert.rejects(y.request('a'), e => e.status === 429);                                               // second strike
  assert.ok(y.status().blockedFor > BACKOFF_FIRST_MS);                                                       // longer than the first
  c.tick(BACKOFF_MAX_MS * 2);
  fail = false;
  assert.equal(await y.request('a'), 'ok');
  assert.equal(y.status().strikes, 0);                                                                       // success resets it
});

test('honors Retry-After and caps the wait', async () => {
  const c = clock();
  const y = createRequester(async () => { throw err('upstream_status', { status: 429, retryAfter: 120 }); }, { now: c.now, random: () => 0 });
  await assert.rejects(y.request('a'));
  assert.ok(y.status().blockedFor >= 120000 && y.status().blockedFor <= BACKOFF_MAX_MS);
  const y2 = createRequester(async () => { throw err('upstream_status', { status: 429, retryAfter: 99999 }); }, { now: c.now, random: () => 0 });
  await assert.rejects(y2.request('a'));
  assert.equal(y2.status().blockedFor, BACKOFF_MAX_MS);
});

test('a refused login stops all requests until the user reconnects', async () => {
  let calls = 0, ok = false;
  const y = createRequester(async () => { calls++; if (!ok) throw err('needs_reauth'); return 'ok'; });
  await assert.rejects(y.request('a'), e => e.code === 'needs_reauth');
  await assert.rejects(y.request('b'), e => e.code === 'needs_reauth');
  assert.equal(calls, 1);
  ok = true; y.resetAuth();
  assert.equal(await y.request('b'), 'ok');
});

test('keeps the last good answer to show while Yahoo cools off', async () => {
  let fail = false;
  const y = createRequester(async () => { if (fail) throw err('upstream_status', { status: 999 }); return { v: 1 }; });
  await y.request('a');
  fail = true;
  await assert.rejects(y.request('a'));
  assert.deepEqual(y.stale('a'), { v: 1 });
});
