import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from './index.ts';

const NOW = 2e12;
const jwt = sub => 'Bearer x.' + Buffer.from(JSON.stringify({ sub })).toString('base64url') + '.y';
const ENV = { YAHOO_CLIENT_ID: 'cid', YAHOO_CLIENT_SECRET: 'sec', SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' };

// A small stand-in for Yahoo and for the tokens table, recording every call.
function world({ row = null, yahooStatus = 200, tokenOk = true } = {}) {
  const w = { calls: [], row };
  w.fetch = async (url, init = {}) => {
    const u = String(url); w.calls.push({ url: u, init });
    const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
    if (u.includes('/rest/v1/yahoo_tokens')) {
      if (init.method === 'POST') { w.row = JSON.parse(init.body); return json({}, 201); }
      if (init.method === 'DELETE') { w.row = null; return new Response(null, { status: 204 }); }
      return json(w.row ? [w.row] : []);
    }
    if (u.startsWith('https://api.login.yahoo.com/oauth2/get_token')) return tokenOk ? json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }) : json({ error: 'invalid_grant' }, 400);
    if (u.startsWith('https://fantasysports.yahooapis.com/')) return json({ fantasy_content: { ok: true } }, yahooStatus);
    return json({}, 404);
  };
  return w;
}
const call = (body, w, env = ENV, sub = 'user-1') => handle(new Request('http://x', { method: 'POST', headers: { authorization: jwt(sub) }, body: JSON.stringify(body) }), { env, fetchImpl: w.fetch, now: NOW }).then(r => r.json());

test('builds the Yahoo sign-in link with the read-only fantasy scope, and only for https pages', async () => {
  const r = await call({ action: 'authorize', redirectUri: 'https://me.github.io/app/', state: 'yh_abcdefgh12' }, world());
  assert.equal(r.ok, true);
  const u = new URL(r.url);
  assert.equal(u.origin + u.pathname, 'https://api.login.yahoo.com/oauth2/request_auth');
  assert.equal(u.searchParams.get('scope'), 'fspt-r');
  assert.equal(u.searchParams.get('client_id'), 'cid');
  assert.equal(u.searchParams.get('state'), 'yh_abcdefgh12');
  assert.equal((await call({ action: 'authorize', redirectUri: 'http://insecure.example/', state: 'yh_abcdefgh12' }, world())).ok, false);
  assert.equal((await call({ action: 'authorize', redirectUri: 'https://me.github.io/app/', state: 'bad' }, world())).ok, false);
  assert.equal((await call({ action: 'authorize', redirectUri: 'https://evil.example/', state: 'yh_abcdefgh12' }, world(), { ...ENV, YAHOO_REDIRECT_URIS: 'https://me.github.io/app/' })).ok, false);   // not on the allowed list
});

test('says so when the Yahoo secrets are missing, and needs a signed-in user', async () => {
  assert.equal((await call({ action: 'authorize', redirectUri: 'https://a.b/', state: 'yh_abcdefgh12' }, world(), {})).error, 'not_configured');
  const r = await handle(new Request('http://x', { method: 'POST', body: JSON.stringify({ action: 'status' }) }), { env: ENV, fetchImpl: world().fetch, now: NOW });
  assert.equal((await r.json()).error, 'signed_out');
});

test('trades the code for tokens using the secret, and saves them for this user only', async () => {
  const w = world();
  const r = await call({ action: 'exchange', code: 'abc', redirectUri: 'https://me.github.io/app/' }, w);
  assert.equal(r.ok, true);
  const tokenCall = w.calls.find(c => c.url.includes('get_token'));
  assert.equal(tokenCall.init.headers.Authorization, 'Basic ' + Buffer.from('cid:sec').toString('base64'));
  assert.match(tokenCall.init.body, /grant_type=authorization_code/);
  assert.equal(w.row.user_id, 'user-1');
  assert.equal(w.row.refresh_token, 'new-refresh');
  assert.equal(w.row.expires_at, NOW + 3600 * 1000);
  const status = await call({ action: 'status' }, w);
  assert.equal(status.connected, true);
  assert.equal((await call({ action: 'disconnect' }, w)).ok, true);
  assert.equal(w.row, null);
});

test('makes allow-listed read-only Yahoo calls with the saved token, and returns the data', async () => {
  const w = world({ row: { user_id: 'user-1', access_token: 'tok', refresh_token: 'ref', expires_at: NOW + 3600000 } });
  const r = await call({ action: 'request', path: 'league/461.l.12345/scoreboard;week=5' }, w);
  assert.equal(r.ok, true);
  const y = w.calls.find(c => c.url.startsWith('https://fantasysports.yahooapis.com/'));
  assert.equal(y.url, 'https://fantasysports.yahooapis.com/fantasy/v2/league/461.l.12345/scoreboard;week=5?format=json');
  assert.equal(y.init.headers.Authorization, 'Bearer tok');
  for (const path of ['game/nfl', 'users;use_login=1/games;game_keys=461/leagues', 'users;use_login=1/games;game_keys=461/teams', 'team/461.l.12345.t.3/roster;week=5',
    'league/461.l.12345/players;player_keys=461.p.1,461.p.2/stats;type=week;week=5']) {
    assert.equal((await call({ action: 'request', path }, w)).ok, true, path);
  }
});

test('refuses anything else: other hosts, write-looking paths, other users\' data', async () => {
  const w = world({ row: { user_id: 'user-1', access_token: 'tok', refresh_token: 'ref', expires_at: NOW + 3600000 } });
  for (const path of ['', '../../etc', 'league/461.l.1/transactions', 'team/461.l.1.t.1/roster', 'https://evil.example/', 'game/nfl/../x', 'league/461.l.12345/players;player_keys=' + Array.from({ length: 30 }, (_, i) => '461.p.' + i).join(',') + '/stats;type=week;week=5']) {
    assert.equal((await call({ action: 'request', path }, w)).ok, false, path);
  }
  assert.equal(w.calls.some(c => c.url.startsWith('https://fantasysports.yahooapis.com/')), false);
});

test('refreshes an expired token before asking Yahoo, and says when the user is not connected', async () => {
  const w = world({ row: { user_id: 'user-1', access_token: 'old', refresh_token: 'ref', expires_at: NOW - 1000 } });
  assert.equal((await call({ action: 'request', path: 'game/nfl', redirectUri: 'https://me.github.io/app/' }, w)).ok, true);
  assert.match(w.calls.find(c => c.url.includes('get_token')).init.body, /grant_type=refresh_token/);
  assert.equal(w.calls.find(c => c.url.startsWith('https://fantasysports.yahooapis.com/')).init.headers.Authorization, 'Bearer new-access');
  assert.equal((await call({ action: 'request', path: 'game/nfl' }, world())).error, 'not_connected');
});

test('retries once with a fresh token when Yahoo rejects the old one, then gives up', async () => {
  let n = 0;
  const w = world({ row: { user_id: 'user-1', access_token: 'stale', refresh_token: 'ref', expires_at: NOW + 3600000 } });
  const inner = w.fetch;
  w.fetch = async (u, i) => { if (String(u).startsWith('https://fantasysports.yahooapis.com/') && n++ === 0) return new Response('{}', { status: 401 }); return inner(u, i); };
  assert.equal((await call({ action: 'request', path: 'game/nfl' }, w)).ok, true);
  const dead = world({ row: { user_id: 'user-1', access_token: 'x', refresh_token: 'ref', expires_at: NOW + 3600000 }, yahooStatus: 401 });
  assert.equal((await call({ action: 'request', path: 'game/nfl' }, dead)).error, 'not_connected');
});

test('explains failures instead of throwing', async () => {
  assert.equal((await call({ action: 'exchange', code: 'abc', redirectUri: 'https://a.b/' }, world({ tokenOk: false }))).error, 'upstream');
  assert.equal((await call({ action: 'nope' }, world())).ok, false);
});
