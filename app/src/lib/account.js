// What an account stores, and how a saved copy becomes a ready-to-use app state.
import { LEAGUE_NAMES } from '../data.js';
import { LS, LS_ORIGINAL, load } from './store.js';
import { currentWeek, seedWeek } from './season.js';

// The league colours, in order; also the choices in the league colour picker.
export const LEAGUE_COLORS = ['#8b7cff', '#ffc043', '#35d49a', '#4fb6ff', '#ff7a59', '#ff5ca8', '#2fe0b0', '#c38bff', '#ff4d5e', '#a3e635', '#f472b6', '#94a3b8'];

// The original owner's links. They are applied only when importing that owner's leagues from this device,
// never to a new account, so nobody inherits someone else's league IDs.
const OWNER_USER = 'Uncutgems82';
const OWNER_CONN = {
  RDL: { source: 'sleeper' },
  DFL: { source: 'sleeper' },
  Deloitte: { source: 'espn', leagueId: '308619009', teamId: '1' },
  Breezewood: { source: 'espn', private: true }
};

export const userKey = id => LS + ':u:' + id;

export const blankState = () => ({ leagues: [], data: {}, scored: {}, conn: {}, sleeperUser: '', espnHelper: '' });

// The parts saved to the account. Which week is open and the last sync results stay on the device.
export function cloudState(db) {
  return { leagues: db.leagues, data: db.data, scored: db.scored, conn: db.conn, sleeperUser: db.sleeperUser, espnHelper: db.espnHelper };
}

// Keeps built-in links where a league still has one, and fills a manual one in for every other league.
export function mergeConn(saved, names, defaults = {}) {
  const out = {};
  names.forEach(n => {
    const s = saved[n];
    out[n] = s && (s.source === 'ffpc' || (s.source !== 'manual' && (s.leagueId || s.source === 'sleeper'))) ? s
      : defaults[n] ? { ...defaults[n] }
      : s || { source: 'manual' };
  });
  return out;
}

// A raw saved copy (from this device or the account) -> the full state the app runs on.
export function hydrate(s, { week = currentWeek(), builtin = false, defaults = {} } = {}) {
  s = s || {};
  const leagues = Array.isArray(s.leagues) ? s.leagues : [];
  const names = leagues.map(l => l.name);
  const data = s.data || {};
  if (!data[week]) data[week] = seedWeek(week, data, names, builtin);
  // Weeks saved before a league was added get that league's starting lineup.
  Object.keys(data).forEach(w => {
    const missing = names.filter(n => !data[w][n]);
    if (missing.length) { const seed = seedWeek(Number(w), data, missing, builtin); missing.forEach(n => { data[w][n] = seed[n]; }); }
  });
  return {
    week, data, leagues,
    scored: s.scored || {},
    conn: mergeConn(s.conn || {}, names, defaults),
    sleeperUser: s.sleeperUser || '',
    espnHelper: s.espnHelper || '',
    synced: s.synced || {}
  };
}

// The leagues the original app saved on this device, if any, ready to adopt into a new account.
export function legacyDb() {
  const s = load(LS, null) || load(LS_ORIGINAL, null);
  if (!s || !(s.data || s.leagues)) return null;
  const leagues = Array.isArray(s.leagues) && s.leagues.length
    ? s.leagues
    : LEAGUE_NAMES.map((name, i) => ({ name, color: LEAGUE_COLORS[i % LEAGUE_COLORS.length] }));
  return hydrate({ ...s, leagues, sleeperUser: s.sleeperUser || OWNER_USER }, { builtin: true, defaults: OWNER_CONN });
}
