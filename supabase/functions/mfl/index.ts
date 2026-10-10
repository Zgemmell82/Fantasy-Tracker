// Supabase Edge Function "mfl": fetches MyFantasyLeague data for the Fantasy Tracker app.
//
// MyFantasyLeague does not let web pages on other sites read its API from the browser, so the app asks
// this function instead and the function asks MyFantasyLeague. It only works for signed-in users
// (Supabase checks the sign-in token before this code runs), only talks to api.myfantasyleague.com,
// and only for the few kinds of data the app needs.
//
// Replies are always HTTP 200 with { ok: true, data } or { ok: false, error }, so the app can show the reason.

const MFL = 'https://api.myfantasyleague.com';
const TYPES = ['liveScoring', 'weeklyResults', 'players'];
// What each extra argument is allowed to look like.
const PARAMS: Record<string, RegExp> = {
  L: /^\d{1,10}$/,
  W: /^\d{1,2}$/,
  DETAILS: /^[01]$/,
  PLAYERS: /^\d{1,6}(,\d{1,6}){0,199}$/
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const reply = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (error: string) => reply({ ok: false, error });

export async function handle(req: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Send a POST request.');

  let body: any;
  try { body = await req.json(); } catch (_e) { return fail('The request wasn\'t valid JSON.'); }
  const { type, year, params = {}, apiKey } = body || {};

  if (!TYPES.includes(type)) return fail('That kind of data isn\'t available.');
  if (!/^20\d\d$/.test(String(year))) return fail('Send a season year like 2026.');

  const qs = new URLSearchParams({ TYPE: type, JSON: '1' });
  for (const [k, v] of Object.entries(params)) {
    if (!PARAMS[k] || !PARAMS[k].test(String(v))) return fail('The ' + k + ' value isn\'t allowed.');
    qs.set(k, String(v));
  }
  if (type !== 'players' && !params.L) return fail('Add the league ID.');

  if (apiKey) {
    // MFL shows keys URL-encoded; decode once so the encoding isn't applied twice.
    let key = String(apiKey).trim();
    try { key = decodeURIComponent(key); } catch (_e) { /* use as pasted */ }
    if (!/^[A-Za-z0-9+/=._~-]{4,200}$/.test(key)) return fail('That API key has characters MyFantasyLeague keys don\'t use. Copy it again from MFL.');
    qs.set('APIKEY', key);
  }

  let r: Response;
  try {
    r = await fetchImpl(MFL + '/' + year + '/export?' + qs, {
      headers: { 'User-Agent': 'FantasyTracker/1.0', Accept: 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    });
  } catch (_e) {
    return fail('Couldn\'t reach MyFantasyLeague. Try again in a moment.');
  }

  const text = await r.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch (_e) {
    return fail(r.ok
      ? 'MyFantasyLeague answered with something other than data. The league ID may be wrong, or the league may not be set up for ' + year + '.'
      : 'MyFantasyLeague answered with an error (' + r.status + ').');
  }
  return reply({ ok: true, data });
}

// Deno.serve exists on Supabase; the guard lets the tests import this file in Node.
declare const Deno: any;
if (typeof Deno !== 'undefined') Deno.serve((req: Request) => handle(req));
