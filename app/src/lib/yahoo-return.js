// Yahoo sends people back to the app with ?code=…&state=… . This runs before anything else: it keeps the code
// (only if it matches the sign-in we started) and tidies the address bar, so the rest of the app never sees it.
export const YH_RET = 'ff-yahoo-return', YH_CODE = 'ff-yahoo-code';

export function captureYahooReturn(loc = location, hist = history, store = sessionStorage) {
  try {
    const q = new URLSearchParams(loc.search);
    const state = q.get('state') || '';
    if (!/^yh_/.test(state)) return false;
    const mine = JSON.parse(store.getItem(YH_RET) || 'null');
    const code = q.get('code');
    if (mine && mine.state === state && Date.now() - mine.at < 30 * 60 * 1000) {
      store.setItem(YH_CODE, JSON.stringify(code ? { code, league: mine.league } : { error: q.get('error_description') || q.get('error') || 'Yahoo sign-in was cancelled.', league: mine.league }));
    }
    store.removeItem(YH_RET);
    ['code', 'state', 'error', 'error_description'].forEach(k => q.delete(k));
    hist.replaceState(null, '', loc.pathname + (q.toString() ? '?' + q : '') + loc.hash);
    return true;
  } catch (e) { return false; }
}

export function takeYahooCode(store = sessionStorage) {
  try { const v = JSON.parse(store.getItem(YH_CODE) || 'null'); store.removeItem(YH_CODE); return v; } catch (e) { return null; }
}
