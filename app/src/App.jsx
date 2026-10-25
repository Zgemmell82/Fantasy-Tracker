import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PLAYERS } from './data.js';
import { load, save } from './lib/store.js';
import { SEASON, WEEKS, currentWeek, seedWeek } from './lib/season.js';
import { cloudState, hydrate, legacyDb, userKey } from './lib/account.js';
import { gameFor, gameState, leagueRemaining } from './lib/remaining.js';
import { alignByPosition } from './lib/lineup.js';
import { loadInjuries } from './lib/injuries.js';
import { alertKey, alertSummary, applyChecks, lineupAlerts } from './lib/alerts.js';
import { getTheme, setTheme } from './lib/theme.js';
import { pullState, pushState, supabase } from './lib/cloud.js';
import { AuthScreen, NewPassword, SetupNeeded, Splash, useSession } from './Auth.jsx';
import { mkPlayer } from './lib/teams.js';
import { Avatar, Icon, LEAGUE_COLORS, LeagueColors, LeagueFilter, PosChip, Segmented, Sheet, Switch, useLeagueColor } from './ui.jsx';
import { fmtPts, groupByGame, liveNow, weekStarted } from './lib/games.js';
import { matchSleeperLeague, sleeperLeagues, syncSleeper } from './lib/sleeper.js';
import { syncEspn } from './lib/espn.js';
import { syncMfl } from './lib/mfl.js';
import { syncYahoo, yahooLeagues, startYahooSignIn, yahooStatus, yahooDisconnect, yahooFinish } from './lib/yahoo.js';
import { takeYahooCode } from './lib/yahoo-return.js';
import { PlaysScreen, RulesContext, useScoreboard } from './Plays.jsx';
import { leagueRules } from './lib/scoring.js';
import HotRoute, { useProjections } from './HotRoute.jsx';
import { MatchCell } from './MatchCell.jsx';
import LeagueBoard from './Home.jsx';
import { leagueOutlook } from './lib/hotroute.js';
import { normTeam } from './lib/teams.js';

function syncEspnFor(c, week, helper) {
  if (c.private && !helper) return Promise.reject(new Error('Private league: add your ESPN helper link under Connect.'));
  return syncEspn(c.leagueId, c.teamId, week, c.private ? helper : '');
}

const SRC_NAME = { sleeper: 'Sleeper', espn: 'ESPN', mfl: 'MFL', yahoo: 'Yahoo', ffpc: 'FFPC', manual: 'By hand' };
const RESYNC_MS = 15 * 60000;
const LIVE_RESYNC_MS = 2 * 60000;

// FFPC has no feed this app can read, so it is labelled but never auto-synced.
const isLinked = c => !!c && c.source !== 'manual' && c.source !== 'ffpc' && !!(c.leagueId || c.source === 'sleeper');
const namesOf = db => db.leagues.map(l => l.name);
const MAX_NAME = 24;

// Checks a league name typed in the league sheet; returns an error message, or '' when it's fine.
function nameError(name, leagues, current) {
  const n = name.trim();
  if (!n) return 'Give the league a name.';
  if (n.length > MAX_NAME) return 'Keep it to ' + MAX_NAME + ' characters.';
  if (leagues.some(l => l.name !== current && l.name.toLowerCase() === n.toLowerCase())) return 'You already have a league called ' + n + '.';
  return '';
}

// Moves every saved record for a league to a new name: lineups for each week, its connection and sync results.
function renameIn(db, from, to) {
  const data = {};
  Object.keys(db.data).forEach(w => {
    const wk = {};
    Object.keys(db.data[w]).forEach(n => { wk[n === from ? to : n] = db.data[w][n]; });
    data[w] = wk;
  });
  const conn = {};
  Object.keys(db.conn).forEach(n => { conn[n === from ? to : n] = db.conn[n]; });
  const synced = {};
  Object.keys(db.synced).forEach(k => {
    const i = k.lastIndexOf(':');
    synced[k.slice(0, i) === from ? to + k.slice(i) : k] = db.synced[k];
  });
  return { ...db, data, conn, synced };
}

// Signed out -> the sign-in screen; signed in -> that account's own dashboard.
export default function App() {
  const [s, setS] = useSession();
  if (s.status === 'setup') return <SetupNeeded />;
  if (s.status === 'loading') return <Splash />;
  if (!s.user) return <AuthScreen />;
  if (s.recovery) return <NewPassword onDone={() => setS(p => ({ ...p, recovery: false }))} />;
  return <Tracker key={s.user.id} user={s.user} onSignOut={() => supabase.auth.signOut()} />;
}

function Tracker({ user, onSignOut }) {
  // Lineups, crossed-off players and connections are kept on this device and in the signed-in account,
  // so a second device picks up the same leagues. Sync results stay on the device.
  const key = userKey(user.id);
  const stored = useRef(null);
  if (stored.current === null) stored.current = load(key, null) || false;
  const [db, setDb] = useState(() => hydrate(stored.current || {}));
  const dbRef = useRef(db);
  dbRef.current = db;

  // meta.syncedAt: the account copy this device last matched; meta.dirty: changes not yet sent to the account.
  const meta = useRef((stored.current && stored.current._meta) || { syncedAt: 0, dirty: false });
  const lastJson = useRef(null);
  if (lastJson.current === null) lastJson.current = JSON.stringify(cloudState(db));
  const ready = useRef(false);          // true once the account copy has been read; nothing is sent before that
  const pushTimer = useRef(0);
  const retryTimer = useRef(0);
  const [cloud, setCloud] = useState({ phase: 'loading', err: '' });   // loading | ok | syncing | offline | error
  const [legacy] = useState(() => legacyDb());

  const push = useCallback(async () => {
    clearTimeout(pushTimer.current);
    const json = JSON.stringify(cloudState(dbRef.current));
    const at = Date.now();
    setCloud(c => ({ ...c, phase: 'syncing' }));
    try {
      await pushState(user.id, JSON.parse(json), at);
      lastJson.current = json;
      meta.current = { syncedAt: at, dirty: JSON.stringify(cloudState(dbRef.current)) !== json };
      save(key, { ...dbRef.current, _meta: meta.current });
      setCloud({ phase: 'ok', err: '' });
    } catch (e) {
      setCloud({ phase: 'offline', err: e.message });
      pushTimer.current = setTimeout(push, 30000);
    }
  }, [user.id, key]);

  // Reads the account copy and decides which side is newer: a brand-new device takes the account's,
  // a device with unsent changes sends its own.
  const settle = useCallback(async () => {
    clearTimeout(retryTimer.current);
    try {
      const row = await pullState(user.id);
      const m = meta.current;
      if (row && !m.dirty && row.at > m.syncedAt) {
        const next = hydrate(row.state, { week: dbRef.current.week });
        lastJson.current = JSON.stringify(cloudState(next));
        meta.current = { syncedAt: row.at, dirty: false };
        setDb(prev => ({ ...next, synced: prev.synced }));
        ready.current = true;
        setCloud({ phase: 'ok', err: '' });
      } else if (!row || m.dirty) {
        ready.current = true;
        await push();
      } else {
        ready.current = true;
        setCloud({ phase: 'ok', err: '' });
      }
    } catch (e) {
      // Never saved on this device: showing an empty dashboard could later overwrite the account, so wait.
      setCloud({ phase: meta.current.syncedAt ? 'offline' : 'error', err: e.message });
      retryTimer.current = setTimeout(settle, 30000);
    }
  }, [user.id, push]);

  useEffect(() => { settle(); return () => { clearTimeout(pushTimer.current); clearTimeout(retryTimer.current); }; }, [settle]);
  // Coming back to the app picks up edits made on another device, as long as nothing here is waiting to send.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible' && ready.current && !meta.current.dirty) settle(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [settle]);

  useEffect(() => {
    const json = JSON.stringify(cloudState(db));
    const changed = json !== lastJson.current;
    if (changed) meta.current = { ...meta.current, dirty: true };
    save(key, { ...db, _meta: meta.current });
    if (changed && ready.current) { clearTimeout(pushTimer.current); pushTimer.current = setTimeout(push, 1200); }
  }, [db, key, push]);

  // Injury designations load on open and refresh every half hour while the app is in view.
  useEffect(() => {
    let stop = false;
    const go = () => loadInjuries()
      .then(lookup => { if (!stop) setInj({ lookup, error: '' }); })
      .catch(e => { if (!stop) setInj(prev => ({ ...prev, error: e.message })); });
    go();
    const t = setInterval(() => { if (document.visibilityState === 'visible') go(); }, 30 * 60000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  const signOut = async () => {
    if (ready.current && meta.current.dirty) await push();
    onSignOut();
  };
  const importLegacy = () => {
    if (!legacy) return;
    setDb(prev => ({ ...legacy, week: prev.week, synced: {} }));
    flash('Imported ' + legacy.leagues.length + ' leagues');
  };

  const [screen, setScreen] = useState('games');
  const [filter, setFilter] = useState('all');
  const [editFor, setEditFor] = useState(null);
  const [connFor, setConnFor] = useState(null);
  const [yahooNote, setYahooNote] = useState('');   // result of coming back from Yahoo's sign-in
  const [leagueFor, setLeagueFor] = useState(null);
  useEffect(() => {
    const back = takeYahooCode();
    if (!back) return;
    setConnFor(back.league || null);
    if (!back.code) { setYahooNote(back.error); return; }
    yahooFinish(back.code).then(() => setYahooNote('Connected to Yahoo. Pick your team below.'), e => setYahooNote(e.message));
  }, []);
  const [matchupFor, setMatchupFor] = useState(null);
  const [theme, setThemeState] = useState(getTheme);
  const [inj, setInj] = useState({ lookup: null, error: '' });
  const [lgSel, setLgSel] = useState([]);       // leagues chosen in the filter; empty = all leagues
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState('');
  const syncingRef = useRef(false);
  const pendingRef = useRef(null);
  const toastTimer = useRef(0);

  const flash = useCallback(msg => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const setLeague = useCallback((week, league, lineup, how) => {
    setDb(prev => {
      // A sync that finishes after its league was renamed or deleted is dropped.
      if (!prev.leagues.some(l => l.name === league)) return prev;
      const data = { ...prev.data };
      const wk = { ...(data[week] || seedWeek(week, data, namesOf(prev))) };
      wk[league] = { mine: lineup.mine.map(mkPlayer), opp: lineup.opp.map(mkPlayer), how, at: Date.now(), ...(lineup.score ? { score: lineup.score } : {}), ...((prev.conn[league] && prev.conn[league].scoring) || lineup.scoring ? { scoring: (prev.conn[league] && prev.conn[league].scoring) || lineup.scoring } : {}), ...(lineup.rules ? { rules: lineup.rules } : {}) };   // a scoring format chosen under Source beats the detected one
      data[week] = wk;
      return { ...prev, data };
    });
  }, []);

  const editLeague = useCallback((league, fn) => {
    setDb(prev => {
      const data = { ...prev.data };
      const wk = { ...(data[prev.week] || seedWeek(prev.week, data, namesOf(prev))) };
      const cur = wk[league] || { mine: [], opp: [] };
      const l = { mine: [...cur.mine], opp: [...cur.opp] };
      fn(l);
      wk[league] = { ...l, how: 'manual', at: Date.now() };
      data[prev.week] = wk;
      return { ...prev, data };
    });
  }, []);

  const setConn = useCallback((league, patch) => {
    setDb(prev => ({ ...prev, conn: { ...prev.conn, [league]: { source: 'manual', ...(prev.conn[league] || {}), ...patch } } }));
  }, []);

  // Adding, renaming, recolouring, reordering and deleting leagues.
  const addLeague = (name, color) => setDb(prev => {
    const n = name.trim();
    const data = {};
    Object.keys(prev.data).forEach(w => { data[w] = { ...prev.data[w], [n]: { mine: [], opp: [] } }; });
    return { ...prev, data, leagues: [...prev.leagues, { name: n, color }], conn: { ...prev.conn, [n]: { source: 'manual' } } };
  });

  const updateLeague = (from, { name, color }) => setDb(prev => {
    const to = name.trim();
    const next = to !== from ? renameIn(prev, from, to) : prev;
    return { ...next, leagues: prev.leagues.map(l => l.name === from ? { name: to, color } : l) };
  });

  const moveLeague = (name, dir) => setDb(prev => {
    const leagues = [...prev.leagues];
    const i = leagues.findIndex(l => l.name === name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= leagues.length) return prev;
    [leagues[i], leagues[j]] = [leagues[j], leagues[i]];
    return { ...prev, leagues };
  });

  const removeLeague = name => setDb(prev => {
    const data = {};
    Object.keys(prev.data).forEach(w => { const { [name]: _, ...rest } = prev.data[w]; data[w] = rest; });
    const { [name]: _c, ...conn } = prev.conn;
    const synced = {};
    Object.keys(prev.synced).forEach(k => { if (k.slice(0, k.lastIndexOf(':')) !== name) synced[k] = prev.synced[k]; });
    return { ...prev, data, conn, synced, leagues: prev.leagues.filter(l => l.name !== name) };
  });

  const markSynced = useCallback((key, result) => {
    setDb(prev => ({ ...prev, synced: { ...prev.synced, [key]: { at: Date.now(), ...result } } }));
  }, []);

  // Pulls one league's starters for a week from its connection.
  const pullLeague = useCallback(async (league, week) => {
    const { conn, sleeperUser } = dbRef.current;
    const c = conn[league];
    if (c.source === 'sleeper') {
      let leagueId = c.leagueId;
      if (!leagueId) {
        const taken = namesOf(dbRef.current).filter(n => n !== league && conn[n] && conn[n].source === 'sleeper' && conn[n].leagueId).map(n => conn[n].leagueId);
        const hit = await matchSleeperLeague(sleeperUser, league, taken);
        setConn(league, hit);
        leagueId = hit.leagueId;
      }
      return syncSleeper(sleeperUser, leagueId, week);
    }
    if (c.source === 'mfl') {
      if (!c.leagueId || !c.teamId) return Promise.reject(new Error('Add the league ID and franchise ID under Source.'));
      return syncMfl(c.leagueId, c.teamId, week, c.apiKey);
    }
    if (c.source === 'yahoo') {
      if (!c.leagueId || !c.teamId) return Promise.reject(new Error('Pick your Yahoo team under Source.'));
      return syncYahoo(c.leagueId, c.teamId, week);
    }
    return syncEspnFor(c, week, dbRef.current.espnHelper);
  }, [setConn]);

  const syncOne = useCallback(async (league, week) => {
    const c = dbRef.current.conn[league];
    if (!c) return false;
    const source = c.source;
    try {
      const res = await pullLeague(league, week);
      setLeague(week, league, res, source);
      markSynced(league + ':' + week, { ok: true });
      return true;
    } catch (e) {
      markSynced(league + ':' + week, { ok: false, err: e.message });
      return false;
    }
  }, [pullLeague, setLeague, markSynced]);

  // auto: only leagues not synced in the last 15 minutes, and stay quiet unless something failed.
  const syncAll = useCallback(async (auto) => {
    // A sync asked for mid-sync (e.g. after switching weeks) runs once the current one ends.
    if (syncingRef.current) { pendingRef.current = pendingRef.current === false ? false : !!auto; return; }
    const { conn, synced, week } = dbRef.current;
    const targets = namesOf(dbRef.current).filter(n => {
      if (!isLinked(conn[n])) return false;
      if (!auto) return true;
      const s = synced[n + ':' + week];
      return !s || !s.ok || Date.now() - s.at > (liveNow(week) ? LIVE_RESYNC_MS : RESYNC_MS);
    });
    if (!targets.length) {
      if (!auto) flash('No connected leagues yet — tap Connect on a league.');
      return;
    }
    syncingRef.current = true;
    setSyncing(true);
    let ok = 0;
    for (const n of targets) if (await syncOne(n, week)) ok++;
    syncingRef.current = false;
    setSyncing(false);
    if (!auto || ok < targets.length) flash('Synced ' + ok + ' of ' + targets.length + ' connected leagues');
    if (pendingRef.current !== null) { const next = pendingRef.current; pendingRef.current = null; syncAll(next); }
  }, [syncOne, flash]);

  // Refresh when the app opens, when the week changes, and when it comes back to the foreground.
  useEffect(() => { syncAll(true); }, [db.week, syncAll]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') syncAll(true); };
    document.addEventListener('visibilitychange', onVis);
    // While games are live, keep points fresh: check every minute; syncAll waits 2 minutes between pulls.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && liveNow(dbRef.current.week)) syncAll(true);
    }, 60000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(timer); };
  }, [syncAll]);

  const setWeek = w => setDb(prev => {
    const data = prev.data[w] ? prev.data : { ...prev.data, [w]: seedWeek(w, prev.data, namesOf(prev)) };
    return { ...prev, week: w, data };
  });

  const toggleScored = (uid, auto) => setDb(prev => {
    const ws = { ...(prev.scored[prev.week] || {}) };
    ws[uid] = !isDone(ws[uid], auto);
    return { ...prev, scored: { ...prev.scored, [prev.week]: ws } };
  });

  const closeConn = () => { setConnFor(null); syncAll(true); };

  const { week } = db;
  const wk = db.data[week] || {};
  const scoredWeek = db.scored[week] || {};
  const { board, error: boardError } = useScoreboard(week, db.espnHelper, true);
  const names = namesOf(db);
  const sel = lgSel.filter(n => names.includes(n));
  const shown = sel.length ? names.filter(n => sel.includes(n)) : names;
  const colors = Object.fromEntries(db.leagues.map(l => [l.name, l.color]));
  const colorOf = name => colors[name] || LEAGUE_COLORS[0];
  // Starters who won't play, may not play, or are on a bye, for every league (the filter narrows what's shown).
  const alerts = inj.lookup || !db.leagues.length ? lineupAlerts(week, wk, names, inj.lookup, board) : [];
  const [acks, setAcks] = useState(() => load('ff-lc-ack-' + week, {}));
  useEffect(() => { setAcks(load('ff-lc-ack-' + week, {})); }, [week]);
  const setAck = useCallback((key, sev) => setAcks(prev => {
    const next = { ...prev };
    if (sev == null) delete next[key]; else next[key] = sev;
    save('ff-lc-ack-' + week, next);
    return next;
  }), [week]);
  const alertCounts = alertSummary(applyChecks(alerts, acks).open).byLeague;
  const rulesByLeague = useMemo(() => Object.fromEntries(names.map(n => [n, leagueRules(wk[n], db.conn[n])])), [names.join('|'), wk, db.conn]);   // eslint-disable-line react-hooks/exhaustive-deps
  const now = Date.now();
  const remain = Object.fromEntries(names.map(n => [n, leagueRemaining(week, wk[n], board, now)]));

  if (cloud.phase === 'loading') return <Splash />;
  if (cloud.phase === 'error') {
    return (
      <div className="app"><main className="body auth-body"><div className="auth">
        <h1 className="title">Can't load your account</h1>
        <div className="banner err"><Icon.alert size={16} sw={2.5} /><span>{cloud.err || 'Couldn\'t reach the server.'}</span></div>
        <button className="pill-btn primary wide" onClick={() => { setCloud({ phase: 'loading', err: '' }); settle(); }}>Try again</button>
        <button className="pill-btn wide" onClick={onSignOut}>Sign out</button>
      </div></main></div>
    );
  }

  return (
    <LeagueColors.Provider value={colorOf}>
    <RulesContext.Provider value={rulesByLeague}>
    <div className="app">
      <header className="head">
        <div className="head-row">
          <div>
            <div className="eyebrow">{SEASON} season{screen === 'games' ? ' · Week ' + week : ''}</div>
            <h1 className="title">{screen === 'games' ? 'The Huddle' : screen === 'plays' ? 'Live Feed' : screen === 'hot' ? 'Two-Minute Drill' : 'Locker Room'}</h1>
          </div>
          <button className={'icon-btn' + (syncing ? ' spinning' : '')} disabled={syncing} onClick={() => syncAll(false)} aria-label="Sync connected leagues">
            <Icon.refresh size={19} />
          </button>
        </div>
        <WeekPills week={week} onPick={setWeek} />
      </header>

      <main className="body" key={screen}>
        {screen === 'games'
          ? <Games week={week} wk={wk} names={shown} leagues={names} sel={sel} onSel={setLgSel} board={board} onMatchup={setMatchupFor} synced={db.synced} alerts={alerts.filter(a => a.leagues.some(l => shown.includes(l)))} acks={acks} setAck={setAck} injReady={!!inj.lookup} injError={inj.error} />
          : screen === 'hot'
          ? <HotRoute week={week} wk={wk} leagues={names} shown={shown} sel={sel} onSel={setLgSel} board={board} helper={db.espnHelper} data={db.data} />
          : screen === 'plays'
          ? <PlaysScreen week={week} games={groupByGame(week, wk, undefined, shown).games} board={board} boardError={boardError} helper={db.espnHelper} scored={scoredWeek} leagues={names} sel={sel} onSel={setLgSel} />
          : <Leagues week={week} wk={wk} leagues={db.leagues} remain={remain} alertCounts={alertCounts} onMatchup={setMatchupFor} theme={theme} onTheme={t => setThemeState(setTheme(t))} conn={db.conn} account={{ email: user.email, cloud, onSignOut: signOut, canImport: !!legacy && !db.leagues.length, onImport: importLegacy, onRetry: settle }} synced={db.synced} syncing={syncing}
              onSync={async n => { if (await syncOne(n, week)) flash(n + ' synced'); }}
              onEdit={setEditFor} onConnect={setConnFor} onSettings={setLeagueFor} />}
      </main>

      <nav className="tabbar">
        <button className={screen === 'games' ? 'on' : ''} onClick={() => setScreen('games')}><Icon.football size={23} /><span>The Huddle</span></button>
        <button className={screen === 'plays' ? 'on' : ''} onClick={() => setScreen('plays')}><Icon.activity size={23} /><span>Live Feed</span></button>
        <button className={screen === 'hot' ? 'on' : ''} onClick={() => setScreen('hot')}><Icon.route size={23} /><span>2-Min Drill</span></button>
        <button className={screen === 'leagues' ? 'on' : ''} onClick={() => setScreen('leagues')}><Icon.trophy size={23} /><span>Locker Room</span></button>
      </nav>

      {editFor && <EditSheet league={editFor} week={week} lineup={wk[editFor] || { mine: [], opp: [] }}
        onEdit={fn => editLeague(editFor, fn)} onClose={() => setEditFor(null)} />}

      {connFor && <ConnectSheet league={connFor} week={week} conn={db.conn[connFor] || { source: 'manual' }}
        sleeperUser={db.sleeperUser} setSleeperUser={u => setDb(prev => ({ ...prev, sleeperUser: u }))}
        setConn={patch => setConn(connFor, patch)}
        syncErr={(db.synced[connFor + ':' + week] || {}).err}
        takenIds={names.filter(n => n !== connFor && db.conn[n] && db.conn[n].source === 'sleeper').map(n => db.conn[n].leagueId).filter(Boolean)}
        espnHelper={db.espnHelper} setEspnHelper={u => setDb(prev => ({ ...prev, espnHelper: u.trim() }))}
        yahooNote={yahooNote}
        testMfl={async c => { const res = await syncMfl(c.leagueId, c.teamId, week, c.apiKey); setLeague(week, connFor, res, 'mfl'); markSynced(connFor + ':' + week, { ok: true }); return res; }}
        testEspn={async c => { const res = await syncEspnFor(c, week, db.espnHelper); setLeague(week, connFor, res, 'espn'); markSynced(connFor + ':' + week, { ok: true }); return res; }}
        onClose={closeConn} />}

      {matchupFor && db.leagues.some(l => l.name === matchupFor) && <MatchupSheet league={matchupFor} week={week} lineup={wk[matchupFor]} board={board} onClose={() => setMatchupFor(null)} />}

      {leagueFor && <LeagueSheet key={leagueFor.name || '+'} league={leagueFor.name} leagues={db.leagues}
        onSave={(f) => {
          if (leagueFor.name) updateLeague(leagueFor.name, f);
          else { addLeague(f.name, f.color); flash(f.name.trim() + ' added'); }
        }}
        onMove={dir => moveLeague(leagueFor.name, dir)}
        onDelete={() => { removeLeague(leagueFor.name); flash(leagueFor.name + ' deleted'); setLeagueFor(null); }}
        onConnect={n => { setLeagueFor(null); setConnFor(n); }}
        onClose={() => setLeagueFor(null)} />}

      {toast && <div className="toast" role="status" key={toast}>{toast}</div>}
    </div>
    </RulesContext.Provider>
    </LeagueColors.Provider>
  );
}

function WeekPills({ week, onPick }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current && ref.current.querySelector('.on');
    if (el) el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [week]);
  const now = currentWeek();
  const pills = [];
  for (let w = 1; w <= WEEKS; w++) {
    pills.push(
      <button key={w} className={'wpill' + (w === week ? ' on' : '') + (w === now ? ' now' : '')} onClick={() => onPick(w)} aria-label={'Week ' + w}>
        {w}
      </button>
    );
  }
  return <div className="weeks sc" ref={ref}><span className="weeks-l">WK</span>{pills}</div>;
}

// A player's check mark: what you tapped wins; otherwise it ticks itself once the game is final and scored.
const isDone = (tapped, auto) => tapped === undefined ? auto : tapped;

function TagList({ leagues, pts, showPts }) {
  const colorOf = useLeagueColor();
  return (
  <span className="ltags">
    {leagues.map(l => {
      const v = showPts && pts && typeof pts[l] === 'number' ? pts[l] : null;
      return (
        <span key={l} className={'ltag' + (v != null ? ' has-pts' : '')} style={{ '--lc': colorOf(l) }}>
          {l}{v != null && <b>{fmtPts(v)}</b>}
        </span>
      );
    })}
  </span>
  );
}

// A short status tag for a starter who won't play or may not play.
function Flag({ a }) {
  const text = a.kind === 'bye' ? 'BYE' : a.kind === 'out' ? a.label.toUpperCase() : a.kind === 'doubtful' ? 'D' : 'Q';
  return <em className={'flag ' + a.kind + (a.side === 'opp' ? ' good' : '')} title={a.label + (a.part ? ' (' + a.part + ')' : '')}>{text}</em>;
}

// The lineup check: your starters who are out, doubtful, questionable or on a bye, and the same on your opponents'.
function LineupCheck({ alerts, acks, setAck, ready, error }) {
  const [all, setAll] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [leaving, setLeaving] = useState([]);
  const check = a => { setLeaving(l => [...l, a.key]); setTimeout(() => { setAck(a.key, a.severity); setLeaving(l => l.filter(k => k !== a.key)); }, 350); };
  const [shut, setShut] = useState(() => { try { return localStorage.getItem('ff-lc-shut') === '1'; } catch (e) { return false; } });
  const toggle = () => setShut(v => { try { localStorage.setItem('ff-lc-shut', v ? '0' : '1'); } catch (e) { /* private mode */ } return !v; });
  if (!ready) return error ? <div className="card lc"><div className="lc-head"><Icon.alert size={16} sw={2.5} /><b>Lineup check</b><span className="lc-sub">couldn't load injury reports</span></div></div> : null;
  const { open, checked } = applyChecks(alerts, acks);
  const mine = open.filter(a => a.side === 'mine'), theirs = open.filter(a => a.side === 'opp');
  const serious = mine.some(a => a.severity >= 2);
  const rows = (list, side, done) => (all || done ? list : list.slice(0, 4)).map(a => (
    <div className={'lc-row' + (done ? ' checked' : '') + (leaving.includes(a.key) ? ' leaving' : '')} key={a.key}>
      <button className={'lc-check' + (done ? ' on' : '')} aria-pressed={done} aria-label={(done ? 'Put back: ' : 'Check off: ') + a.player.name} onClick={() => done ? setAck(a.key, null) : check(a)}>{done && <Icon.check size={13} sw={3.5} />}</button>
      <Avatar p={a.player} size={34} side={done ? a.side : side} />
      <div className="lc-main">
        <div className="lc-name">{a.player.name}</div>
        <div className="prow-meta"><PosChip pos={a.player.pos} /><span>{a.player.team}</span><Flag a={a} />
          <span className="lc-det">{a.kind === 'bye' ? 'On a bye' : a.label + (a.part ? ' · ' + a.part : '')}{a.when ? ' · ' + a.when : ''}</span></div>
      </div>
      <TagList leagues={a.leagues} />
    </div>
  ));
  const more = mine.length + theirs.length > 8 ? (all ? 'Show fewer' : 'Show all ' + (mine.length + theirs.length)) : null;
  return (
    <section className="card lc" aria-label="Lineup check">
      <button className="lc-head lc-toggle" onClick={toggle} aria-expanded={!shut}>
        {mine.length ? <Icon.alert size={16} sw={2.5} /> : <Icon.check size={16} sw={3} />}
        <b>Lineup check</b>
        <span className={'lc-pill' + (mine.length ? (serious ? ' bad' : ' warn') : ' ok')}>{mine.length ? mine.length + ' to check' : 'All clear'}</span>
        <span className={'chev' + (shut ? '' : ' open')}><Icon.chevron size={16} sw={2.5} /></span>
      </button>
      {!shut && <>
      {!mine.length && <p className="lc-sub">None of your starters are out, doubtful, questionable or on a bye.</p>}
      {mine.length > 0 && <div className="lc-list">{rows(mine, 'mine')}</div>}
      {theirs.length > 0 && <div className="lc-h good"><i />Good news: your opponents are missing</div>}
      {theirs.length > 0 && <div className="lc-list">{rows(theirs, 'opp')}</div>}
      {more && <button className="pill-btn lc-more" onClick={() => setAll(!all)}>{more}</button>}
      {checked.length > 0 && <button className="lc-undo" onClick={() => setShowDone(v => !v)}>{showDone ? 'Hide' : 'Show'} {checked.length} checked off</button>}
      {showDone && checked.length > 0 && <div className="lc-list">{rows(checked, 'mine', true)}</div>}
      </>}
    </section>
  );
}


function Games({ week, wk, names, leagues, sel, onSel, board, alerts, acks, setAck, injReady, injError, onMatchup, synced }) {
  return (
    <div className="stack">
      <LineupCheck alerts={alerts} acks={acks} setAck={setAck} ready={injReady} error={injError} />

      <LeagueFilter leagues={leagues} sel={sel} onChange={onSel} />

      <LeagueBoard week={week} wk={wk} names={names} board={board} onMatchup={onMatchup} synced={synced} />

      {!names.length && (
        <div className="card empty">
          <Icon.football size={28} />
          <div className="empty-t">No leagues yet</div>
          <div className="empty-d">Add a league in the Locker Room tab to see your matchups here.</div>
        </div>
      )}
    </div>
  );
}

function Leagues({ week, wk, leagues, remain, alertCounts, onMatchup, theme, onTheme, conn, synced, syncing, account, onSync, onEdit, onConnect, onSettings }) {
  return (
    <div className="stack">
      {!leagues.length && (
        <div className="card empty">
          <Icon.trophy size={28} />
          <div className="empty-t">Add your first league</div>
          <div className="empty-d">Name it, pick a color, then link it to Sleeper, ESPN or MyFantasyLeague, or fill it in by hand.</div>
          {account.canImport && <button className="pill-btn wide" onClick={account.onImport}><Icon.refresh size={15} sw={2.5} />Import the leagues saved on this device</button>}
        </div>
      )}
      {leagues.map(({ name: n, color }) => {
        const l = wk[n] || { mine: [], opp: [] };
        const c = conn[n] || { source: 'manual' };
        const sy = synced[n + ':' + week];
        const linked = isLinked(c);
        const failed = sy && !sy.ok && !(l.at > sy.at);
        const when = l.at ? new Date(l.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
        const status = failed ? sy.err
          : l.how === 'manual' ? 'Edited by hand · ' + when
          : l.how ? 'Updated from ' + SRC_NAME[l.how] + ' · ' + when
          : 'Using last week\'s lineup';
        const StatusIcon = failed ? Icon.alert : l.how ? Icon.check : Icon.clock;
        return (
          <section key={n} className="card league">
            <div className="league-head">
              <span className="lavatar" style={{ '--lc': color }}>{n.slice(0, 2)}</span>
              <div className="league-id">
                <div className="league-name">{n}</div>
                <div className="league-src">
                  {linked ? SRC_NAME[c.source] : c.source === 'ffpc' ? 'FFPC · by hand' : 'Not connected'}
                  {c.source === 'espn' && c.private ? <> · <Icon.lock size={11} sw={2.5} /> Private</> : null}
                </div>
              </div>
              <button className="score-btn" onClick={() => onMatchup(n)} aria-label={'Matchup breakdown for ' + n}>
                {l.score && l.score.mine != null && weekStarted(week)
                  ? <div className={'league-score' + (l.score.mine > l.score.opp ? ' up' : l.score.mine < l.score.opp ? ' down' : '')}>
                      <b>{fmtPts(l.score.mine)}</b><span>–</span><b>{l.score.opp != null ? fmtPts(l.score.opp) : '—'}</b>
                      <em>{liveNow(week) ? 'Live' : l.score.mine > l.score.opp ? 'Winning' : l.score.mine < l.score.opp ? 'Losing' : 'Tied'}</em>
                    </div>
                  : <div className="league-vs"><b>{l.mine.length}</b><span>vs</span><b>{l.opp.length}</b></div>}
                <span className="score-go" aria-hidden="true"><Icon.chevron size={16} sw={2.5} /></span>
              </button>
            </div>
            <div className={'league-status' + (failed ? ' err' : l.how ? ' ok' : '')}><StatusIcon size={14} sw={2.5} /><span>{status}</span></div>
            <LeftToPlay r={remain[n]} />
            {alertCounts[n] > 0 && <div className="lc-chip"><Icon.alert size={14} sw={2.5} />{alertCounts[n]} lineup {alertCounts[n] === 1 ? 'alert' : 'alerts'}. See The Huddle.</div>}
            <div className="league-actions">
              {linked && <button className="pill-btn primary" disabled={syncing} onClick={() => onSync(n)}><Icon.refresh size={15} sw={2.5} />Sync</button>}
              <button className={'pill-btn' + (linked ? '' : ' primary')} onClick={() => onEdit(n)}><Icon.pencil size={15} sw={2.5} />Edit</button>
              <button className="pill-btn" onClick={() => onConnect(n)}><Icon.link size={15} sw={2.5} />{linked ? 'Source' : 'Connect'}</button>
              <button className="pill-btn square" onClick={() => onSettings({ name: n })} aria-label={'Name and color for ' + n}><Icon.settings size={16} sw={2.5} /></button>
            </div>
          </section>
        );
      })}
      <button className="pill-btn wide add-league" onClick={() => onSettings({ name: '' })}><Icon.plus size={17} sw={2.5} />Add a league</button>
      <section className="card gametime">
        <div>
          <div className="gt-head">Game time</div>
          <div className="gt-sub">Pick how the app looks on this device.</div>
        </div>
        <div className="gt-opts" role="radiogroup" aria-label="Game time">
          <button className={'gt-opt day' + (theme === 'light' ? ' on' : '')} role="radio" aria-checked={theme === 'light'} onClick={() => onTheme('light')}>
            <span className="gt-ico"><Icon.sun size={22} sw={2.2} />{theme === 'light' && <i className="gt-check"><Icon.check size={13} sw={3.5} /></i>}</span>
            <b>1:00 game</b><span>Light</span>
          </button>
          <button className={'gt-opt night' + (theme !== 'light' ? ' on' : '')} role="radio" aria-checked={theme !== 'light'} onClick={() => onTheme('dark')}>
            <span className="gt-ico"><Icon.moon size={22} sw={2.2} />{theme !== 'light' && <i className="gt-check"><Icon.check size={13} sw={3.5} /></i>}</span>
            <b>Night game</b><span>Dark</span>
          </button>
        </div>
      </section>

      <section className="card account">
        <div className="account-row">
          <span className="lavatar" style={{ '--lc': '#2fe0b0' }}>{(account.email || '?').slice(0, 1).toUpperCase()}</span>
          <div className="league-id">
            <div className="league-name acct-email">{account.email}</div>
            <div className={'league-src acct-' + account.cloud.phase}>
              {account.cloud.phase === 'syncing' ? 'Saving to your account…'
                : account.cloud.phase === 'offline' ? 'Offline · changes will save when you\'re back online'
                : 'Signed in · saved to your account'}
            </div>
          </div>
        </div>
        <div className="league-actions">
          {account.cloud.phase === 'offline' && <button className="pill-btn" onClick={account.onRetry}><Icon.refresh size={15} sw={2.5} />Retry</button>}
          <button className="pill-btn" onClick={account.onSignOut}>Sign out</button>
        </div>
      </section>
      <p className="hint">Your leagues are saved to your account. Connected leagues refresh whenever you open the app.</p>
    </div>
  );
}

function EditSheet({ league, week, lineup, onEdit, onClose }) {
  const [side, setSide] = useState('mine');
  const [query, setQuery] = useState('');
  const list = lineup[side] || [];
  const q = query.trim().toLowerCase();
  const results = q.length < 2 ? [] : PLAYERS.filter(p => p.n.toLowerCase().includes(q)).slice(0, 6);

  return (
    <Sheet title={league} subtitle={'Week ' + week + ' lineup'} onClose={onClose} label={'Edit ' + league}>
      <Segmented value={side} onChange={setSide} tone={v => v === 'opp' ? 'coral' : ''}
        options={[['mine', 'My starters · ' + lineup.mine.length], ['opp', 'Opponent · ' + lineup.opp.length]]} />
      <label className="search">
        <Icon.search size={17} />
        <input id="add-player" value={query} onChange={e => setQuery(e.target.value)} placeholder="Add a player" autoComplete="off" autoCorrect="off" enterKeyHint="search" />
      </label>
      {results.length > 0 && (
        <div className="list">
          {results.map(p => (
            <button key={p.n + p.t} className="lrow" onClick={() => { onEdit(l => { l[side] = [...l[side], mkPlayer(p)]; }); setQuery(''); }}>
              <Avatar p={{ pos: p.p, team: p.t }} size={34} />
              <span className="lrow-main"><span className="lrow-name">{p.n}</span><span className="prow-meta"><PosChip pos={p.p} /><span>{p.t}</span></span></span>
              <span className="round-btn add"><Icon.plus size={16} sw={2.5} /></span>
            </button>
          ))}
        </div>
      )}
      <div className="list">
        {list.map(p => (
          <div key={p.id} className="lrow">
            <Avatar p={p} size={34} side={side} />
            <span className="lrow-main"><span className="lrow-name">{p.name}</span><span className="prow-meta"><PosChip pos={p.pos} /><span>{p.team}</span></span></span>
            <button className="round-btn remove" aria-label={'Remove ' + p.name} onClick={() => onEdit(l => { l[side] = l[side].filter(x => x.id !== p.id); })}><Icon.minus size={16} sw={2.5} /></button>
          </div>
        ))}
        {!list.length && <div className="lrow muted">No players yet. Search above to add them.</div>}
      </div>
    </Sheet>
  );
}

function ConnectSheet({ league, week, conn, sleeperUser, setSleeperUser, setConn, syncErr, takenIds, espnHelper, setEspnHelper, testEspn, testMfl, yahooNote, onClose }) {
  const [sleeperList, setSleeperList] = useState(null);
  const [sleeperMsg, setSleeperMsg] = useState('');
  const [espnMsg, setEspnMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const c = conn;

  const findSleeper = async () => {
    setSleeperMsg('Looking up leagues…');
    setSleeperList(null);
    try {
      const list = await sleeperLeagues(sleeperUser);
      setSleeperList(list);
      setSleeperMsg(list.length ? '' : 'No ' + SEASON + ' leagues on that account.');
    } catch (e) { setSleeperMsg(e.message); }
  };

  // List the account's leagues straight away so picking one is a single tap.
  useEffect(() => { if (c.source === 'sleeper') findSleeper(); }, [c.source]); // eslint-disable-line react-hooks/exhaustive-deps

  const runEspn = async () => {
    if (!c.leagueId || !c.teamId) { setEspnMsg('Enter both IDs.'); return; }
    setBusy(true);
    setEspnMsg('');
    try {
      const res = await testEspn(c);
      setEspnMsg('Connected — pulled ' + res.mine.length + ' + ' + res.opp.length + ' starters.');
    } catch (e) { setEspnMsg(e.message); }
    setBusy(false);
  };

  const runMfl = async () => {
    if (!c.leagueId || !c.teamId) { setEspnMsg('Enter both IDs.'); return; }
    setBusy(true);
    setEspnMsg('');
    try {
      const res = await testMfl(c);
      setEspnMsg('Connected — pulled ' + res.mine.length + ' + ' + res.opp.length + ' starters.');
    } catch (e) { setEspnMsg(e.message); }
    setBusy(false);
  };

  const [yh, setYh] = useState({ state: 'idle', teams: [], msg: '' });
  const yahooLoad = async () => {
    setYh({ state: 'busy', teams: [], msg: '' });
    try {
      const st = await yahooStatus();
      if (!st.connected) { setYh({ state: 'out', teams: [], msg: st.configured ? '' : 'Yahoo isn\'t set up on your Supabase project yet (see app/README.md).' }); return; }
      const teams = await yahooLeagues();
      setYh({ state: 'in', teams, msg: teams.length ? '' : 'No Yahoo fantasy football teams found for this season.' });
    } catch (e) { setYh({ state: e.message === 'not_connected' ? 'out' : 'err', teams: [], msg: e.message === 'not_connected' ? '' : e.message }); }
  };
  useEffect(() => { if (c.source === 'yahoo') yahooLoad(); }, [c.source, yahooNote]); // eslint-disable-line react-hooks/exhaustive-deps
  const yahooGo = async () => { setBusy(true); try { await startYahooSignIn(league); } catch (e) { setYh(y => ({ ...y, msg: e.message })); setBusy(false); } };
  const yahooOff = async () => { setBusy(true); try { await yahooDisconnect(); } catch (e) { /* ignore */ } setBusy(false); setConn({ leagueId: '', teamId: '' }); setYh({ state: 'out', teams: [], msg: '' }); };

  const pickSource = s => setConn({ source: s, leagueId: s === c.source ? c.leagueId : '', teamId: s === c.source ? c.teamId : '', apiKey: s === c.source ? c.apiKey : '' });
  const ok = /^Connected/.test(espnMsg);

  return (
    <Sheet title={league} subtitle="Where this league's lineups come from" onClose={onClose} label={'Connect ' + league}>
      <Segmented value={c.source} onChange={pickSource} options={[['sleeper', 'Sleeper'], ['espn', 'ESPN'], ['mfl', 'MFL'], ['yahoo', 'Yahoo'], ['ffpc', 'FFPC'], ['manual', 'By hand']]} />

      <div className="field">
          <label>Scoring (for projections)</label>
          <Segmented value={c.scoring || 'auto'} onChange={v => setConn({ scoring: v === 'auto' ? '' : v })} options={[['auto', 'Auto'], ['std', 'Standard'], ['half', 'Half PPR'], ['ppr', 'PPR']]} />
          <p className="sheet-note">Each league's projections use its own scoring. Auto reads it from Sleeper and ESPN; pick one here for other sources (it defaults to half PPR).</p>
      </div>

      {c.source === 'manual' && (
        <p className="sheet-note">You'll update this league each week by editing its players. Nothing is fetched automatically.</p>
      )}

      {c.source === 'ffpc' && (
        <>
          <p className="sheet-note">FFPC doesn't share lineups with outside apps, so this league is tracked by hand: tap <b>Edit</b> in the Locker Room tab to add your starters and your opponent's each week. Choosing FFPC labels the league and keeps it from being replaced by a built-in link.</p>
          <div className="field">
            <label htmlFor="ffpc-id">FFPC league number (optional)</label>
            <input id="ffpc-id" className="input" value={c.leagueId || ''} onChange={e => setConn({ leagueId: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="For your own reference" />
          </div>
        </>
      )}

      {c.source === 'yahoo' && (
        <>
          {yahooNote && <div className={'banner' + (/^Connected/.test(yahooNote) ? '' : ' err')}><span>{yahooNote}</span></div>}
          {yh.state === 'busy' && <div className="sheet-note">Checking Yahoo…</div>}
          {yh.state === 'out' && (
            <button className="pill-btn" onClick={yahooGo} disabled={busy}><Icon.link size={15} sw={2.5} />{busy ? 'Opening Yahoo…' : 'Connect Yahoo'}</button>
          )}
          {yh.msg && <div className="sheet-note">{yh.msg}</div>}
          {yh.state === 'in' && yh.teams.length > 0 && (
            <div className="list">
              <div className="list-h">Pick your {league} team</div>
              {yh.teams.map(t => {
                const on = c.teamId === t.teamKey;
                return (
                  <button key={t.teamKey} className={'lrow pick' + (on ? ' on' : '')}
                    onClick={() => { setConn({ leagueId: t.leagueKey, teamId: t.teamKey, name: t.teamName }); setEspnMsg('Saved. Tap Done to pull this week\'s lineups.'); }}>
                    <span className="lrow-main"><span className="lrow-name">{t.teamName}</span><span className="lrow-sub">League {t.leagueKey}</span></span>
                    <span className={'radio' + (on ? ' on' : '')}>{on && <Icon.check size={13} sw={3.5} />}</span>
                  </button>
                );
              })}
            </div>
          )}
          {espnMsg && <div className="sheet-note">{espnMsg}</div>}
          {yh.state === 'in' && <button className="pill-btn" onClick={yahooOff} disabled={busy}>Disconnect Yahoo</button>}
          {!c.teamId && syncErr && <div className="banner err"><Icon.alert size={16} sw={2.5} /><span>{syncErr}</span></div>}
          <p className="sheet-note">Yahoo asks you to sign in on yahoo.com and gives this app read-only access to your fantasy lineups; your Yahoo password never reaches the app. Set up once (see app/README.md).</p>
        </>
      )}

      {c.source === 'mfl' && (
        <>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="mfl-league">League ID</label>
              <input id="mfl-league" className="input" value={c.leagueId || ''} onChange={e => setConn({ leagueId: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="12345" />
            </div>
            <div className="field">
              <label htmlFor="mfl-team">Your franchise ID</label>
              <input id="mfl-team" className="input" value={c.teamId || ''} onChange={e => setConn({ teamId: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="0003" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="mfl-key">API key (private leagues)</label>
            <input id="mfl-key" className="input" value={c.apiKey || ''} onChange={e => setConn({ apiKey: e.target.value.trim() })} placeholder="Optional" autoCapitalize="off" autoCorrect="off" autoComplete="off" />
          </div>
          <button className="pill-btn primary wide" disabled={busy} onClick={runMfl}>{busy ? 'Connecting…' : 'Test connection'}</button>
          {espnMsg && <div className={'banner ' + (/^Connected/.test(espnMsg) ? 'ok' : 'err')}>{/^Connected/.test(espnMsg) ? <Icon.check size={16} sw={2.5} /> : <Icon.alert size={16} sw={2.5} />}<span>{espnMsg}</span></div>}
          <p className="sheet-note">On myfantasyleague.com the league ID is in your league's web address (<b>L=</b>) and the franchise ID is your team's number. The API key comes from MFL's Developers page and is only needed for private leagues. MFL doesn't allow direct access from other sites, so lineups are fetched through your account's MFL helper (set up once; see app/README.md). Syncs week {week}.</p>
        </>
      )}

      {c.source === 'sleeper' && (
        <>
          <div className="field">
            <label htmlFor="sleeper-user">Sleeper username</label>
            <div className="field-row">
              <input id="sleeper-user" className="input" value={sleeperUser} onChange={e => setSleeperUser(e.target.value)} placeholder="username" autoCapitalize="off" autoCorrect="off" autoComplete="off" />
              <button className="pill-btn" onClick={findSleeper}><Icon.search size={15} sw={2.5} />Find</button>
            </div>
          </div>
          {!c.leagueId && syncErr && <div className="banner err"><Icon.alert size={16} sw={2.5} /><span>{syncErr}</span></div>}
          {sleeperMsg && <div className="sheet-note">{sleeperMsg}</div>}
          {sleeperList && sleeperList.length > 0 && (
            <div className="list">
              <div className="list-h">Pick your {league} league</div>
              {sleeperList.map(s => {
                const taken = takenIds.includes(s.league_id);
                const on = c.leagueId === s.league_id;
                return (
                  <button key={s.league_id} className={'lrow pick' + (on ? ' on' : '')} disabled={taken}
                    onClick={() => { setConn({ leagueId: s.league_id, name: s.name }); setSleeperMsg('Saved. Tap Done to pull this week\'s lineups.'); }}>
                    <span className="lrow-main">
                      <span className="lrow-name">{s.name}</span>
                      <span className="lrow-sub">{taken ? 'Linked to another league' : (s.total_rosters || '') + ' teams'}</span>
                    </span>
                    <span className={'radio' + (on ? ' on' : '')}>{on && <Icon.check size={13} sw={3.5} />}</span>
                  </button>
                );
              })}
            </div>
          )}
          <p className="sheet-note">Sleeper is read-only and needs no password. Both lineups refresh when you open the app.</p>
        </>
      )}

      {c.source === 'espn' && (
        <>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="espn-league">League ID</label>
              <input id="espn-league" className="input" value={c.leagueId || ''} onChange={e => setConn({ leagueId: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="1234567" />
            </div>
            <div className="field">
              <label htmlFor="espn-team">Your team ID</label>
              <input id="espn-team" className="input" value={c.teamId || ''} onChange={e => setConn({ teamId: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="4" />
            </div>
          </div>
          <div className="list">
            <Switch on={c.private} onChange={v => setConn({ private: v })} label="Private league" hint="Read through your ESPN helper, which holds your ESPN login." />
          </div>
          {c.private && (
            <div className="field">
              <label htmlFor="espn-helper">ESPN helper link</label>
              <input id="espn-helper" className="input" value={espnHelper} onChange={e => setEspnHelper(e.target.value)} inputMode="url" placeholder="https://espn-helper.you.workers.dev" autoCapitalize="off" autoCorrect="off" autoComplete="off" />
            </div>
          )}
          <button className="pill-btn primary wide" disabled={busy} onClick={runEspn}>{busy ? 'Connecting…' : 'Test connection'}</button>
          {espnMsg && <div className={'banner ' + (ok ? 'ok' : 'err')}>{ok ? <Icon.check size={16} sw={2.5} /> : <Icon.alert size={16} sw={2.5} />}<span>{espnMsg}</span></div>}
          <p className="sheet-note">Both IDs are in your team page's web address on fantasy.espn.com, after "leagueId=" and "teamId=". {c.private
            ? 'The helper is a free Cloudflare Worker you set up once; the steps are in espn-helper/README.md in the app\'s GitHub repo.'
            : 'Without the helper, ESPN only shares leagues that are set to public.'} Syncs week {week}.</p>
        </>
      )}
    </Sheet>
  );
}

// The week's matchup for one league, like the other fantasy apps: both teams' scores, then the starters side by side with points.
function MatchupSheet({ league, week, lineup, board, onClose }) {
  const l = lineup || { mine: [], opp: [] };
  const proj = useProjections(week);
  const outlook = useMemo(() => leagueOutlook(week, l, board, undefined, proj.lookup), [week, l, board, proj.lookup]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Each starter's projected finish (points so far + what's left in his projection), by player.
  const finish = useMemo(() => {
    const m = new Map();
    [...outlook.mine, ...outlook.opp].forEach(x => m.set(x.p, { total: (typeof x.p.pts === 'number' ? x.p.pts : 0) + x.mean, left: x.f > 0, real: x.projected }));
    return m;
  }, [outlook]);
  const pts = list => list.some(p => typeof p.pts === 'number') ? list.reduce((n, p) => n + (p.pts || 0), 0) : null;
  const mine = l.score && l.score.mine != null ? l.score.mine : pts(l.mine);
  const opp = l.score && l.score.opp != null ? l.score.opp : pts(l.opp);
  // ESPN and MyFantasyLeague lineups are shown QB, RB, WR, TE, K, DEF, then IDP; other sources keep their own slot order.
  const byPosition = l.how === 'espn' || l.how === 'mfl' || l.how === 'yahoo';
  const rows = byPosition ? alignByPosition(l.mine, l.opp)
    : Array.from({ length: Math.max(l.mine.length, l.opp.length) }, (_, i) => [l.mine[i], l.opp[i]]);
  const hasPts = [...l.mine, ...l.opp].some(p => typeof p.pts === 'number');
  const live = liveNow(week);
  const verdict = mine == null || opp == null || !weekStarted(week) ? '' : live ? 'Live'
    : mine > opp ? 'Winning' : mine < opp ? 'Losing' : 'Tied';
  const lead = mine != null && opp != null ? (mine > opp ? 'mine' : opp > mine ? 'opp' : '') : '';
  const when = l.at ? new Date(l.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';

  return (
    <Sheet title={league} subtitle={'Week ' + week + ' matchup'} onClose={onClose} label={'Matchup for ' + league}>
      <div className="mu-score">
        <div className={'mu-team mine' + (lead === 'mine' ? ' lead' : '')}><span className="mu-who">You</span><b>{mine != null ? fmtPts(mine) : '—'}</b>{!outlook.done && !outlook.approx && <span className="mu-pj">proj {(outlook.me + outlook.mine.reduce((n, x) => n + x.mean, 0)).toFixed(1)}</span>}</div>
        <div className="mu-mid">{verdict || 'vs'}</div>
        <div className={'mu-team opp' + (lead === 'opp' ? ' lead' : '')}><span className="mu-who">Opponent</span><b>{opp != null ? fmtPts(opp) : '—'}</b>{!outlook.done && !outlook.approx && <span className="mu-pj">proj {(outlook.them + outlook.opp.reduce((n, x) => n + x.mean, 0)).toFixed(1)}</span>}</div>
      </div>
      {rows.length === 0
        ? <p className="sheet-note">No lineup for this week yet. Add starters with Edit, or link this league to Sleeper, ESPN or MyFantasyLeague.</p>
        : <div className="mu-grid">
            {rows.map(([a, b, flex], i) => (
              <div className={'mu-row' + (flex ? ' flx' : '')} key={i}>
                {flex && <div className="mu-flx">FLX</div>}
                <MatchCell p={a} side="mine" week={week} board={board} fin={finish.get(a)} />
                <MatchCell p={b} side="opp" week={week} board={board} fin={finish.get(b)} />
              </div>
            ))}
          </div>}
      {rows.length > 0 && !hasPts && <p className="sheet-note">Player points show up once this league is linked and the games start.</p>}
      {l.how && <p className="sheet-note">{l.how === 'manual' ? 'Lineups edited by hand' : 'Updated from ' + SRC_NAME[l.how]}{when ? ' · ' + when : ''}</p>}
    </Sheet>
  );
}


const plural = n => n + (n === 1 ? ' player' : ' players');

// "Left to play" for one league: your starters and your opponent's who still have a game to finish,
// plus how many of each are in the Monday night game.
function LeftToPlay({ r }) {
  if (!r || (!r.mine.total && !r.opp.total)) return null;
  const cell = (side, who) => {
    const n = side.left;
    return (
      <div className={'left-cell ' + who}>
        <span className="left-n">{side.total ? n : '—'}</span>
        <span className="left-l">{who === 'mine' ? 'You' : 'Them'} left{side.live > 0 ? ' · ' + side.live + ' live' : ''}</span>
      </div>
    );
  };
  const mon = r.monday.mine.length + r.monday.opp.length;
  return (
    <div className="left">
      <div className="left-row" aria-label="Left to play">
        {cell(r.mine, 'mine')}
        {cell(r.opp, 'opp')}
      </div>
      {r.mine.left + r.opp.left === 0 && <div className="left-done"><Icon.check size={13} sw={3} />Everyone has played</div>}
      {mon > 0 && (
        <div className="left-mon" title={'Monday night: ' + plural(r.monday.mine.length) + ' yours, ' + plural(r.monday.opp.length) + ' theirs'}>
          <Icon.clock size={13} sw={2.5} />Monday night: <b className="mint">{r.monday.mine.length}</b> yours · <b className="coral">{r.monday.opp.length}</b> theirs
        </div>
      )}
    </div>
  );
}

// Name, colour, order and deletion for one league, or the form for adding a new one.
function LeagueSheet({ league, leagues, onSave, onMove, onDelete, onConnect, onClose }) {
  const isNew = !league;
  const cur = leagues.find(l => l.name === league);
  const used = leagues.map(l => l.color);
  const [name, setName] = useState(isNew ? '' : league);
  const [color, setColor] = useState(cur ? cur.color : (LEAGUE_COLORS.find(c => !used.includes(c)) || LEAGUE_COLORS[0]));
  const [confirm, setConfirm] = useState(false);
  const [tried, setTried] = useState(false);
  const err = nameError(name, leagues, league);
  const idx = leagues.findIndex(l => l.name === league);
  const shown = name.trim() || 'New';

  // Changes to an existing league save when the sheet closes; a bad name keeps the old one.
  const close = () => {
    if (!isNew) onSave({ name: err ? league : name, color });
    onClose();
  };
  const add = connect => {
    setTried(true);
    if (err) return;
    onSave({ name, color });
    connect ? onConnect(name.trim()) : onClose();
  };

  return (
    <Sheet title={isNew ? 'New league' : league} subtitle={isNew ? 'Name it, pick a color, then link it' : 'Name, color and order'} onClose={close} label={isNew ? 'Add a league' : 'Settings for ' + league}>
      <div className="league-preview">
        <span className="lavatar" style={{ '--lc': color }}>{shown.slice(0, 2)}</span>
        <span className="ltag" style={{ '--lc': color }}>{shown}</span>
      </div>

      <div className="field">
        <label htmlFor="league-name">League name</label>
        <input id="league-name" className="input" value={name} maxLength={MAX_NAME + 8} onChange={e => setName(e.target.value)} placeholder="e.g. Office League" autoComplete="off" autoCorrect="off" />
      </div>
      {err && (tried || (!isNew && name !== league)) && <div className="banner err"><Icon.alert size={16} sw={2.5} /><span>{err}</span></div>}

      <div className="field">
        <label>Color</label>
        <div className="swatches">
          {LEAGUE_COLORS.map(c => (
            <button key={c} className={'swatch' + (c === color ? ' on' : '')} style={{ '--lc': c }} onClick={() => setColor(c)} aria-label={'Color ' + c} aria-pressed={c === color}>
              {c === color && <Icon.check size={15} sw={3} />}
            </button>
          ))}
          <label className={'swatch custom' + (!LEAGUE_COLORS.includes(color) ? ' on' : '')} style={{ '--lc': color }} aria-label="Custom color">
            <input type="color" value={color} onChange={e => setColor(e.target.value)} />
            <Icon.plus size={15} sw={3} />
          </label>
        </div>
      </div>

      {isNew ? (
        <>
          <button className="pill-btn primary wide" onClick={() => add(true)}><Icon.link size={16} sw={2.5} />Add and link to Sleeper or ESPN</button>
          <button className="pill-btn wide" onClick={() => add(false)}>Add and fill in by hand</button>
        </>
      ) : (
        <>
          <div className="league-actions">
            <button className="pill-btn" disabled={idx <= 0} onClick={() => onMove(-1)}><Icon.up size={15} sw={2.5} />Move up</button>
            <button className="pill-btn" disabled={idx >= leagues.length - 1} onClick={() => onMove(1)}><Icon.down size={15} sw={2.5} />Move down</button>
          </div>
          <button className="pill-btn wide" onClick={() => { onSave({ name: err ? league : name, color }); onConnect(err ? league : name.trim()); }}><Icon.link size={16} sw={2.5} />Link to Sleeper or ESPN</button>
          {confirm
            ? <div className="league-actions">
                <button className="pill-btn" onClick={() => setConfirm(false)}>Keep it</button>
                <button className="pill-btn danger" onClick={onDelete}><Icon.trash size={15} sw={2.5} />Delete for good</button>
              </div>
            : <button className="pill-btn wide danger-soft" onClick={() => setConfirm(true)}><Icon.trash size={16} sw={2.5} />Delete league</button>}
          <p className="sheet-note">{confirm ? 'This removes ' + league + ' and its lineups for every week from this phone.' : 'Renaming keeps this league\'s lineups and link. Changes save when you tap Done.'}</p>
        </>
      )}
    </Sheet>
  );
}
