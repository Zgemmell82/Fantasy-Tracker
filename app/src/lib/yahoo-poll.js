// How the app talks to Yahoo without getting itself blocked: results are cached between polls, identical requests in
// flight at the same time share one call, and when Yahoo says "slow down" (HTTP 999 or 429, or a server error) every
// Yahoo request waits, with the wait growing each time it happens. Yahoo limits per app and user, not per league, so
// the pause is shared by all of your Yahoo leagues. A refused login (needs_reauth, not_connected) stops requests
// altogether until the user reconnects.
//
// `call(path)` does the real request and throws errors with a `code` (see YahooError in cloud.js).

export const BACKOFF_FIRST_MS = 30000, BACKOFF_MAX_MS = 15 * 60000;
const isSlowDown = e => e && (e.status === 999 || e.status === 429 || (e.status >= 500 && e.status < 600) || e.code === 'helper');

export class YahooBackoff extends Error {
  constructor(waitMs) {
    super('Yahoo asked us to slow down. Trying again in ' + (waitMs >= 90000 ? Math.round(waitMs / 60000) + ' minutes' : Math.max(1, Math.round(waitMs / 1000)) + ' seconds') + '.');
    this.code = 'backoff'; this.waitMs = waitMs;
  }
}

export function createRequester(call, { now = () => Date.now(), random = Math.random } = {}) {
  const cache = new Map();        // path -> { at, data }
  const inflight = new Map();     // path -> promise
  let blockedUntil = 0, strikes = 0, authError = null;

  async function request(path, { ttl = 0 } = {}) {
    const hit = cache.get(path);
    if (hit && ttl > 0 && now() - hit.at < ttl) return hit.data;
    if (authError) throw authError;
    const wait = blockedUntil - now();
    if (wait > 0) throw new YahooBackoff(wait);
    if (inflight.has(path)) return inflight.get(path);
    const p = (async () => {
      try {
        const data = await call(path);
        cache.set(path, { at: now(), data });
        strikes = 0; blockedUntil = 0;
        return data;
      } catch (e) {
        if (e && (e.code === 'needs_reauth' || e.code === 'not_connected')) authError = e;
        else if (isSlowDown(e)) {
          strikes += 1;
          const grown = Math.min(BACKOFF_MAX_MS, BACKOFF_FIRST_MS * 2 ** (strikes - 1));
          const wanted = e.retryAfter ? e.retryAfter * 1000 : grown;
          blockedUntil = now() + Math.min(BACKOFF_MAX_MS, Math.max(wanted, grown * 0.5)) + Math.floor(random() * 3000);
        }
        throw e;
      } finally { inflight.delete(path); }
    })();
    inflight.set(path, p);
    return p;
  }

  return {
    request,
    // The last good answer for a path, however old (for showing something while Yahoo is cooling off).
    stale: path => (cache.get(path) || {}).data,
    // After the user signs in to Yahoo again.
    resetAuth: () => { authError = null; blockedUntil = 0; strikes = 0; },
    status: () => ({ blockedFor: Math.max(0, blockedUntil - now()), strikes, needsAuth: authError ? authError.code : '' })
  };
}
