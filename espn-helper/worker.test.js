import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

const env = { ESPN_S2: 'S2VAL', SWID: '{ABC}', ALLOWED_ORIGIN: 'https://zgemmell82.github.io', LEAGUES: '111, 222' };
const path = '/apis/v3/games/ffl/seasons/2026/segments/0/leagues/';

test('forwards league reads to ESPN with the cookies and CORS headers', async () => {
  let seen;
  globalThis.fetch = async (url, opts) => { seen = { url, opts }; return new Response('{"ok":1}', { headers: { 'Content-Type': 'application/json' } }); };
  const res = await worker.fetch(new Request('https://h.workers.dev' + path + '111?view=mMatchup&scoringPeriodId=3'), env);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '{"ok":1}');
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://zgemmell82.github.io');
  assert.equal(seen.url, 'https://lm-api-reads.fantasy.espn.com' + path + '111?view=mMatchup&scoringPeriodId=3');
  assert.equal(seen.opts.headers.Cookie, 'espn_s2=S2VAL; SWID={ABC}');
});

test('refuses anything but league reads', async () => {
  globalThis.fetch = async () => { throw new Error('should not fetch'); };
  assert.equal((await worker.fetch(new Request('https://h.workers.dev' + path + '333'), env)).status, 403);
  assert.equal((await worker.fetch(new Request('https://h.workers.dev/apis/v3/games/ffl/other'), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://h.workers.dev' + path + '111', { method: 'POST' }), env)).status, 405);
  assert.equal((await worker.fetch(new Request('https://h.workers.dev' + path + '111', { method: 'OPTIONS' }), env)).status, 200);
});

test('passes public NFL play-by-play through without cookies', async () => {
  let seen;
  globalThis.fetch = async (url, opts) => { seen = { url, opts }; return new Response('{"drives":{}}'); };
  const res = await worker.fetch(new Request('https://h.workers.dev/apis/site/v2/sports/football/nfl/summary?event=401'), env);
  assert.equal(res.status, 200);
  assert.equal(seen.url, 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401');
  assert.equal(seen.opts.headers.Cookie, undefined);
});
