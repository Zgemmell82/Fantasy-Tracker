// Supabase Edge Function "yahoo": connects Fantasy Tracker to Yahoo Fantasy Sports.
//
// Yahoo only allows its fantasy API through OAuth 2.0, and the app's client secret has to stay on a server, so
// the browser never talks to Yahoo directly. The app calls this function, which:
//   authorize  -> builds the Yahoo sign-in URL for the user to visit
//   exchange   -> trades the code Yahoo sends back for tokens, kept in the yahoo_tokens table (service role only)
//   status     -> says whether this user has connected Yahoo, or needs to reconnect (their refresh token stopped working)
//   request    -> makes one allow-listed, read-only call to the Yahoo Fantasy API for this user
//   disconnect -> forgets the user's tokens
// Only signed-in users can call it (Supabase checks the sign-in token first). Replies are always HTTP 200 with
// { ok: true, ... } or { ok: false, error }. Errors that matter to the app's polling carry more: error "needs_reauth"
// (the user must sign in to Yahoo again), "not_connected", or "upstream_status" with Yahoo's own HTTP status (999 and
// 429 mean slow down) and retryAfter seconds when Yahoo sent them.
//
// Setup: see app/README.md (Yahoo Fantasy). Secrets: YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET.
// Optional secret YAHOO_REDIRECT_URIS: comma-separated pages Yahoo may send people back to (default: any https page).

const AUTH_URL = 'https://api.login.yahoo.com/oauth2/request_auth';
const TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token';
const API = 'https://fantasysports.yahooapis.com/fantasy/v2/';

// The only Yahoo calls the app can make: read-only fantasy football lookups.
export const ALLOWED: RegExp[] = [
  /^game\/nfl$/,
  /^users;use_login=1\/games;game_keys=(nfl|\d{1,4})\/(leagues|teams)$/,
  /^league\/\d{1,4}\.l\.\d{1,10}\/(scoreboard;week=\d{1,2}|settings)$/,
  /^team\/\d{1,4}\.l\.\d{1,10}\.t\.\d{1,3}\/roster;week=\d{1,2}(\/players\/stats(;type=week;week=\d{1,2})?)?$/
];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const reply = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (error: string) => reply({ ok: false, error });

function userId(req: Request): string {
  try {
    const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').split('.')[1];
    return String(JSON.parse(atob(t.replace(/-/g, '+').replace(/_/g, '/'))).sub || '');
  } catch (_e) { return ''; }
}

type Deps = { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch; now?: number };
type Tokens = { access_token: string; refresh_token: string; expires_at: number };
class TokenError extends Error { status = 0; invalid = false; }

export async function handle(req: Request, deps: Deps = {}): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Send a POST request.');

  let body: any;
  try { body = await req.json(); } catch (_e) { return fail('The request wasn\'t valid JSON.'); }
  const action = body && body.action;
  const env = deps.env ?? ((globalThis as any).Deno ? (globalThis as any).Deno.env.toObject() : {});
  const doFetch = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now();
  const uid = userId(req);
  if (!uid) return fail('signed_out');

  const clientId = env.YAHOO_CLIENT_ID, secret = env.YAHOO_CLIENT_SECRET;
  const allowedUris = (env.YAHOO_REDIRECT_URIS || '').split(',').map(s => s.trim()).filter(Boolean);
  const okUri = (u: unknown) => typeof u === 'string' && /^https:\/\/[^\s]+$/.test(u) && (!allowedUris.length || allowedUris.includes(u));

  // ── tokens live in the yahoo_tokens table, readable only with the service role ──
  const dbBase = (env.SUPABASE_URL || '') + '/rest/v1/yahoo_tokens';
  const dbHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY || '', Authorization: 'Bearer ' + (env.SUPABASE_SERVICE_ROLE_KEY || ''), 'Content-Type': 'application/json' };
  const readTokens = async (): Promise<(Tokens & { reauth: boolean }) | null> => {
    const r = await doFetch(dbBase + '?user_id=eq.' + encodeURIComponent(uid) + '&select=access_token,refresh_token,expires_at,reauth_required', { headers: dbHeaders });
    if (!r.ok) throw new Error('db');
    const rows = await r.json();
    return rows && rows[0] ? { access_token: rows[0].access_token, refresh_token: rows[0].refresh_token, expires_at: Number(rows[0].expires_at) || 0, reauth: !!rows[0].reauth_required } : null;
  };
  const saveTokens = async (t: Tokens) => {
    const r = await doFetch(dbBase + '?on_conflict=user_id', {
      method: 'POST', headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: uid, ...t, reauth_required: false, updated_at: new Date(now).toISOString() })
    });
    if (!r.ok) throw new Error('db');
  };
  // The refresh token stopped working: keep the row (so the app can say "reconnect") but stop trying to use it.
  const markReauth = async () => {
    await doFetch(dbBase + '?user_id=eq.' + encodeURIComponent(uid), { method: 'PATCH', headers: dbHeaders, body: JSON.stringify({ reauth_required: true, updated_at: new Date(now).toISOString() }) });
  };
  const tokenCall = async (form: Record<string, string>) => {
    const r = await doFetch(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(clientId + ':' + secret), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString()
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) {
      const e = new TokenError(j.error_description || j.error || 'token');
      e.status = r.status;
      e.invalid = /invalid_grant|invalid_token|expired|revoked/i.test(String(j.error || '') + ' ' + String(j.error_description || '')) || r.status === 400 || r.status === 401;   // Yahoo said no, as opposed to being unreachable
      throw e;
    }
    return j;
  };

  try {
    if (action === 'authorize') {
      if (!clientId || !secret) return fail('not_configured');
      if (!okUri(body.redirectUri) || !/^yh_[A-Za-z0-9]{8,64}$/.test(String(body.state || ''))) return fail('That sign-in request isn\'t allowed.');
      const q = new URLSearchParams({ client_id: clientId, redirect_uri: body.redirectUri, response_type: 'code', scope: 'fspt-r', state: body.state });
      return reply({ ok: true, url: AUTH_URL + '?' + q });
    }

    if (action === 'status') {
      const t = await readTokens();
      return reply({ ok: true, connected: !!t && !t.reauth, needsReauth: !!t && t.reauth, configured: !!(clientId && secret) });
    }

    if (action === 'disconnect') {
      await doFetch(dbBase + '?user_id=eq.' + encodeURIComponent(uid), { method: 'DELETE', headers: dbHeaders });
      return reply({ ok: true });
    }

    if (!clientId || !secret) return fail('not_configured');

    if (action === 'exchange') {
      if (!okUri(body.redirectUri) || !body.code || String(body.code).length > 200) return fail('That sign-in request isn\'t allowed.');
      const j = await tokenCall({ grant_type: 'authorization_code', code: String(body.code), redirect_uri: body.redirectUri });
      await saveTokens({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: now + (Number(j.expires_in) || 3600) * 1000 });
      return reply({ ok: true });
    }

    if (action === 'request') {
      const path = String(body.path || '');
      if (!ALLOWED.some(re => re.test(path))) return fail('That Yahoo lookup isn\'t allowed.');
      const row = await readTokens();
      if (!row) return fail('not_connected');
      if (row.reauth) return fail('needs_reauth');
      let t: Tokens = row;
      // Refreshes the one-hour access token. If Yahoo refuses the refresh token, the user has to sign in again.
      const refresh = async (): Promise<boolean> => {
        try {
          const j = await tokenCall({ grant_type: 'refresh_token', refresh_token: t.refresh_token, redirect_uri: String(body.redirectUri || '') });
          t = { access_token: j.access_token, refresh_token: j.refresh_token || t.refresh_token, expires_at: now + (Number(j.expires_in) || 3600) * 1000 };
          await saveTokens(t);
          return true;
        } catch (e) {
          if (e instanceof TokenError && e.invalid) { await markReauth(); return false; }
          throw e;
        }
      };
      if (t.expires_at - 60000 < now && !(await refresh())) return fail('needs_reauth');
      const call = () => doFetch(API + path + (path.includes('?') ? '&' : '?') + 'format=json', { headers: { Authorization: 'Bearer ' + t.access_token, Accept: 'application/json' } });
      let r = await call();
      if (r.status === 401) { if (!(await refresh())) return fail('needs_reauth'); r = await call(); }
      if (r.status === 401) { await markReauth(); return fail('needs_reauth'); }
      if (!r.ok) {
        const ra = Number(r.headers.get('retry-after'));
        return reply({ ok: false, error: 'upstream_status', status: r.status, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : undefined });
      }
      const text = await r.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch (_e) { return reply({ ok: false, error: 'upstream_status', status: 200 }); }
      return reply({ ok: true, data });
    }

    return fail('Unknown action.');
  } catch (_e) {
    return fail('upstream');
  }
}

declare const Deno: any;
if (typeof Deno !== 'undefined') Deno.serve((req: Request) => handle(req));
