// ESPN helper for Fantasy Tracker: a Cloudflare Worker that reads private ESPN leagues.
//
// ESPN only shares a private league with requests that carry your login cookies,
// and a web app can't attach cookies to another site's requests. This worker holds
// the cookies as secrets, adds them to the app's requests and passes ESPN's answer back.
//
// Settings (Worker → Settings → Variables and Secrets):
//   ESPN_S2         secret  your espn_s2 cookie
//   SWID            secret  your SWID cookie, including the { }
//   ALLOWED_ORIGIN  text    the site allowed to use this helper, e.g. https://zgemmell82.github.io
//   LEAGUES         text    optional: comma-separated league IDs this helper may read
//
// It only forwards read-only requests (GET): your listed fantasy leagues, plus ESPN's public NFL
// scoreboard and play-by-play (no cookies are sent with those).

const ESPN = 'https://lm-api-reads.fantasy.espn.com';
const LEAGUE_PATH = /^\/apis\/v3\/games\/ffl\/seasons\/\d{4}\/segments\/0\/leagues\/(\d+)$/;
// Public NFL scoreboard and play-by-play, used by the Plays tab if the phone can't reach ESPN directly.
const SITE = 'https://site.api.espn.com';
const GAME_PATH = /^\/apis\/site\/v2\/sports\/football\/nfl\/(scoreboard|summary)$/;

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin'
    };
    const reply = (status, message) => new Response(JSON.stringify({ error: message }), {
      status, headers: { ...cors, 'Content-Type': 'application/json' }
    });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return reply(405, 'Only GET is allowed.');

    const url = new URL(request.url);
    if (url.pathname === '/') return reply(200, 'ESPN helper is running.');
    if (GAME_PATH.test(url.pathname)) {
      const res = await fetch(SITE + url.pathname + url.search, { headers: { Accept: 'application/json' } });
      return new Response(res.body, { status: res.status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    const m = url.pathname.match(LEAGUE_PATH);
    if (!m) return reply(404, 'Not an ESPN league request.');
    const allowed = String(env.LEAGUES || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(m[1])) return reply(403, 'League ' + m[1] + ' is not in this helper\'s LEAGUES list.');
    if (!env.ESPN_S2 || !env.SWID) return reply(500, 'Add the ESPN_S2 and SWID secrets to this worker.');

    const res = await fetch(ESPN + url.pathname + url.search, {
      headers: { Cookie: 'espn_s2=' + env.ESPN_S2 + '; SWID=' + env.SWID, Accept: 'application/json' }
    });
    return new Response(res.body, {
      status: res.status,
      headers: { ...cors, 'Content-Type': res.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store' }
    });
  }
};
