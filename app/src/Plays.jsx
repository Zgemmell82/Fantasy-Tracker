import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { boardFor, fetchPlays, fetchScoreboard, matchPlays, nextPollMs } from './lib/pbp.js';
import { fmtPts } from './lib/games.js';
import { buildRecap } from './lib/recap.js';
import { effectOf, relevantPlay } from './lib/relevance.js';
import { Avatar, Icon, LeagueFilter, Segmented, TeamLogo, useLeagueColor } from './ui.jsx';

// Each league's own scoring rules ({ leagueName: rules }), so point swings match the league's totals.
export const RulesContext = createContext({});

const visible = () => document.visibilityState === 'visible';

// Live scores, clocks and ESPN game ids for the week. It refreshes every 30s while a game is on or about to start,
// less often otherwise, and straight away when the app comes back to the foreground or the connection returns,
// so a game that kicked off while the app was closed or in the background shows up live.
export function useScoreboard(week, helper, active) {
  const [board, setBoard] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!active) return;
    let stop = false, timer = 0, busy = false, latest = {};
    const schedule = ms => { clearTimeout(timer); if (!stop && ms != null) timer = setTimeout(tick, ms); };
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const sb = await fetchScoreboard(week, helper);
        if (stop) return;
        latest = sb;
        setBoard(sb);
        setError('');
        schedule(nextPollMs(sb, week));
      } catch (e) {
        if (!stop) { setError(e.message); schedule(60000); }
      } finally { busy = false; }
    };
    const tick = () => { if (visible()) load(); else schedule(30000); };
    const wake = () => { if (visible()) load(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    setBoard({});
    load();
    return () => {
      stop = true; clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
    };
  }, [week, helper, active]);
  return { board, error };
}

// One game's plays, refreshed every 20s while the game is live and the feed is open.
function useFeed(eventId, live, helper) {
  const [state, setState] = useState({ plays: null, home: '', away: '', error: '', at: 0 });
  const firstIds = useRef(null);
  useEffect(() => {
    if (!eventId) return;
    let stop = false, timer = 0;
    const load = async () => {
      try {
        const res = await fetchPlays(eventId, helper);
        if (stop) return;
        if (!firstIds.current) firstIds.current = new Set(res.plays.map(p => p.id));
        setState({ ...res, error: '', at: Date.now() });
      } catch (e) {
        if (!stop) setState(s => ({ ...s, error: e.message }));
      }
      if (!stop && live) timer = setTimeout(tick, 20000);
    };
    const tick = () => { if (visible()) load(); else timer = setTimeout(tick, 20000); };
    load();
    return () => { stop = true; clearTimeout(timer); };
  }, [eventId, live, helper]);
  return { ...state, isNew: id => !!firstIds.current && !firstIds.current.has(id) };
}

export const trackedFor = g => [
  ...g.mine.map(p => ({ ...p, side: 'mine' })),
  ...g.theirs.map(p => ({ ...p, side: 'opp' }))
];

const short = name => {
  const parts = String(name).split(' ');
  return parts.length > 1 && !/D\/ST$/.test(name) ? parts[0][0] + '. ' + parts.slice(1).join(' ') : name;
};
const qLabel = n => n > 4 ? (n === 5 ? 'OT' : n - 4 + 'OT') : 'Q' + n;
const qTitle = n => n > 4 ? 'Overtime' : ['1st', '2nd', '3rd', '4th'][n - 1] + ' quarter';

// One play with the tracked players it involved; game tags which game it came from in the all-games feed.
function PlayCard({ p, isNew, scored, score, game }) {
  const colorOf = useLeagueColor();
  return (
    <article className={'play' + (p.badge ? ' big' : '') + (p.relevant ? ' fantasy' : '') + (isNew ? ' new' : '')}>
      <div className="play-when"><b>{qLabel(p.period)}</b><span>{p.clock}</span></div>
      <div className="play-main">
        {(game || p.badge || p.down || p.relevant) && (
          <div className="play-top">
            {game && <span className="play-game"><TeamLogo team={game.away} size={16} />{game.away} @ {game.home}<TeamLogo team={game.home} size={16} /></span>}
            {p.relevant && <span className="fbadge">Fantasy</span>}
            {p.badge && <span className={'pbadge b-' + p.badge.toLowerCase()}>{p.badge}</span>}
            {p.down && <span className="play-down">{p.down}</span>}
          </div>
        )}
        <div className="play-text">{p.text}</div>
        {p.hits.length > 0 && (
          <div className="hits">
            {p.hits.map(h => { const fx = h.effect || effectOf(h.side, h.est, false); return (
              <div key={h.uid} className={'hit ' + h.side + ' fx-' + fx + (scored && scored[h.uid] ? ' done' : '')}>
                <div className="hit-top">
                  <Avatar p={h} size={22} side={h.side} />
                  <span className="hit-name">{short(h.name)}</span>
                  {h.injury && <b className="hit-est injury">Injury</b>}
                  {h.est !== 0 && <b className={'hit-est ' + fx + (h.est < 0 ? ' neg' : '')}>{h.est > 0 ? '+' : ''}{fmtPts(h.est)}</b>}
                  {fx !== 'none' && <em className={'hit-fx ' + fx}>{fx === 'help' ? '▲ Helps you' : '▼ Hurts you'}</em>}
                </div>
                <div className="hit-lgs">
                  {h.leagues.map(l => (
                    <span key={l} className={'lg-chip ' + h.side} style={{ '--lc': colorOf(l) }}>
                      <i />{l}<em>{h.side === 'mine' ? 'FOR you' : 'AGAINST you'}</em>{h.mixed && h.byLeague && h.byLeague[l] != null && <b className="lg-pts">{h.byLeague[l] > 0 ? '+' : ''}{fmtPts(h.byLeague[l])}</b>}
                    </span>
                  ))}
                </div>
              </div>
            ); })}
          </div>
        )}
        {p.scoring && score && <div className="play-score">{score.away} {p.awayScore} – {p.homeScore} {score.home}</div>}
      </div>
    </article>
  );
}

// mode: 'plays' (the play-by-play) or 'recap' (points per quarter, per league). Both load the game's plays.
export function Feed({ game, info, helper, scored, leagues = [], mode = 'plays' }) {
  const [filter, setFilter] = useState('players');
  const live = info && info.state === 'in';
  const feed = useFeed(info && info.state !== 'pre' ? info.id : null, live, helper);
  const tracked = useMemo(() => trackedFor(game), [game]);
  const rules = useContext(RulesContext);
  const matched = useMemo(() => feed.plays ? matchPlays(feed.plays, tracked, rules) : null, [feed.plays, tracked, rules]);   // oldest first
  // Live games read newest first; once a game is over the play-by-play runs in the order things happened.
  const final = !!info && info.state === 'post';
  const plays = useMemo(() => matched ? (final ? matched : [...matched].reverse()) : null, [matched, final]);

  if (!info) return <div className="feed"><div className="feed-empty">Looking up this game on ESPN…</div></div>;
  if (info.state === 'pre') return <div className="feed"><div className="feed-empty"><Icon.clock size={18} />{mode === 'recap' ? 'The recap fills in once the game starts' : 'Play-by-play starts at kickoff'} · {game.time}</div></div>;

  const shown = !plays ? [] : plays.filter(p => filter === 'all' || (filter === 'players' ? p.hits.length : p.scoring));
  let lastQ = null;

  const scoreOf = feed.away ? { away: feed.away, home: feed.home } : null;

  if (mode === 'recap') {
    return (
      <div className="feed">
        {feed.error && <div className="banner err"><Icon.alert size={16} sw={2.5} /><span>{feed.error}</span></div>}
        {!matched && !feed.error && <div className="feed-empty">Loading the game…</div>}
        {matched && <Recap matched={matched} leagues={leagues} score={scoreOf} scored={scored} />}
      </div>
    );
  }

  return (
    <div className="feed">
      <div className="feed-bar">
        <Segmented value={filter} onChange={setFilter} options={[['all', 'All'], ['players', 'Players'], ['scoring', 'Scoring']]} />
        <div className="feed-meta">
          {live ? <><i className="dot-live" />Live · updates every 20s</> : final ? 'Final · in order, first play to last' : 'Final'}
          {feed.at ? ' · ' + new Date(feed.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
        </div>
      </div>
      {feed.error && <div className="banner err"><Icon.alert size={16} sw={2.5} /><span>{feed.error}</span></div>}
      {!plays && !feed.error && <div className="feed-empty">Loading plays…</div>}
      {plays && !shown.length && (
        <div className="feed-empty">
          {filter === 'players' ? 'None of your tracked players have shown up in a play yet.' : filter === 'scoring' ? 'No scoring plays yet.' : 'ESPN hasn\'t published any plays for this game yet (ESPN game ' + info.id + ').'}
        </div>
      )}
      {shown.map(p => {
        const header = p.period !== lastQ ? <div className="q-sep" key={'q' + p.period + p.id}>{qTitle(p.period)}</div> : null;
        lastQ = p.period;
        return [header, <PlayCard key={p.id} p={p} isNew={feed.isNew(p.id)} scored={scored} score={scoreOf} />];
      })}
      {plays && <div className="feed-foot">Point swings are estimates using each league's own scoring where known; your leagues' real totals come from Sleeper and ESPN.</div>}
    </div>
  );
}

const sgn = n => (n > 0 ? '+' : '') + fmtPts(n);

// A finished game, league by league: points you got and gave up in each quarter. Tap a quarter for the plays
// behind it, in the order they happened.
function Recap({ matched, leagues, score, scored }) {
  const colorOf = useLeagueColor();
  const [open, setOpen] = useState(null);
  const rows = useMemo(() => buildRecap(matched, leagues), [matched, leagues]);

  if (!rows.length) return <div className="feed-empty">None of your players, or your opponents', had a play in this game.</div>;
  return (
    <>
      {rows.map(r => (
        <section className="rc-league" key={r.league}>
          <div className="rc-head">
            <span className="ltag" style={{ '--lc': colorOf(r.league) }}>{r.league}</span>
            <span className="rc-total">You <b className="mint">{sgn(r.forPts)}</b><i>·</i>Against <b className="coral">{sgn(r.againstPts)}</b></span>
          </div>
          <div className="rc-cols" aria-hidden="true"><span /><span>You</span><span>Against</span><span /></div>
          {r.quarters.map(q => {
            const key = r.league + '|' + q.period;
            const isOpen = open === key;
            return (
              <div className="rc-q" key={key}>
                <button className={'rc-row' + (isOpen ? ' open' : '')} disabled={!q.plays.length} aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : key)}>
                  <b>{qLabel(q.period)}</b>
                  <span className={'mint' + (q.forPts ? '' : ' zero')}>{q.forPts ? sgn(q.forPts) : '0'}</span>
                  <span className={'coral' + (q.againstPts ? '' : ' zero')}>{q.againstPts ? sgn(q.againstPts) : '0'}</span>
                  <span className="rc-n">{q.plays.length ? q.plays.length + (q.plays.length === 1 ? ' play' : ' plays') : '—'}<Icon.chevron size={15} sw={2.5} /></span>
                </button>
                {isOpen && (
                  <div className="rc-plays">
                    {q.plays.map(p => <PlayCard key={p.id} p={p} scored={scored} score={score} />)}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
      <div className="feed-foot">Points are estimated from the play-by-play using each league's own scoring where known, so they can still differ slightly from the official totals.</div>
    </>
  );
}

export function GameScore({ game, info }) {
  const [away, home] = game.key.split('@');
  const score = info && info.state !== 'pre';
  const lead = score ? (info.awayScore > info.homeScore ? 'away' : info.homeScore > info.awayScore ? 'home' : '') : '';
  return (
    <div className="gscore">
      <span className={'gs-team' + (lead === 'away' ? ' lead' : '')}><TeamLogo team={away} size={26} /><b>{away}</b>{score && <em>{info.awayScore}</em>}</span>
      <span className="gs-at">@</span>
      <span className={'gs-team' + (lead === 'home' ? ' lead' : '')}><TeamLogo team={home} size={26} /><b>{home}</b>{score && <em>{info.homeScore}</em>}</span>
    </div>
  );
}

export function GameStatus({ game, info }) {
  if (info && info.state === 'in') return <span className="spill-wrap"><span className="spill live"><i />{info.detail || 'Live'}</span>{info.redZone && info.possession && <span className="spill rz" title="In the red zone">RZ · {info.possession}</span>}</span>;
  if (info && info.state === 'post') return <span className="spill final">{info.detail || 'Final'}</span>;
  return <span className="spill">{info ? info.detail : game.status}</span>;
}

const clockSecs = c => { const m = /^(\d+):(\d+)/.exec(c || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };

// Several games' plays at once, refreshed every 20s while any of them is live. Plays are ordered newest first: ones that arrived while
// the screen was open first, then by quarter and clock (the best ordering across games the data allows).
export function useGameFeeds(list, helper, active) {
  const key = list.map(x => x.info.id).join(',');
  const anyLive = list.some(x => x.info.state === 'in');
  const [state, setState] = useState({ byId: {}, at: 0, error: '', loaded: false });
  const seen = useRef(new Map());   // play id -> when this screen first saw it (0 = there from the start)
  const first = useRef(true);
  useEffect(() => {
    if (!active || !key) return;
    let stop = false, timer = 0;
    const ids = key.split(',');
    const load = async () => {
      const res = await Promise.allSettled(ids.map(id => fetchPlays(id, helper)));
      if (stop) return;
      const now = Date.now();
      const byId = {};
      res.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        byId[ids[i]] = r.value;
        r.value.plays.forEach(p => { if (!seen.current.has(ids[i] + ':' + p.id)) seen.current.set(ids[i] + ':' + p.id, first.current ? 0 : now); });
      });
      first.current = false;
      const failed = res.filter(r => r.status === 'rejected');
      setState(prev => ({
        byId: Object.keys(byId).length ? { ...prev.byId, ...byId } : prev.byId, at: now, loaded: true,
        error: failed.length === res.length ? failed[0].reason.message : ''
      }));
      if (anyLive) timer = setTimeout(tick, 20000);
    };
    const tick = () => { if (visible()) load(); else timer = setTimeout(tick, 20000); };
    load();
    return () => { stop = true; clearTimeout(timer); };
  }, [key, anyLive, helper, active]);
  return { ...state, seenAt: (gid, pid) => seen.current.get(gid + ':' + pid) || 0 };
}

const SHOW_STEP = 40;

function AllLive({ games, board, helper, scored }) {
  const [scope, setScope] = useState('live');          // live | week
  const [impact, setImpact] = useState('all');          // all (every play, yours highlighted) | mine (only plays that touch your teams) | scoring
  const [limit, setLimit] = useState(SHOW_STEP);
  // Every NFL game on the scoreboard, not just the ones with your players; games without any get no tracked players.
  const everyGame = useMemo(() => Object.entries(board || {}).map(([key, info]) => {
    const [a, h] = key.split('@');
    return { g: games.find(x => x.key === key || x.key === h + '@' + a) || { key, mine: [], theirs: [] }, info };
  }), [games, board]);
  const started = everyGame.filter(x => x.info.state !== 'pre');
  const liveList = started.filter(x => x.info.state === 'in');
  const list = scope === 'live' ? liveList : started;
  const feeds = useGameFeeds(list, helper, list.length > 0);
  const startedAt = useRef(Date.now());
  const rules = useContext(RulesContext);

  // All: every play in every game, with the ones that matter to your teams marked. For/Against: only those that matter
  // (they gain or lose points for a player you have or face, or hurt one). Scoring: those that are scoring plays.
  const items = useMemo(() => {
    const out = [];
    list.forEach(({ g, info }) => {
      const f = feeds.byId[info.id];
      if (!f) return;
      matchPlays(f.plays, trackedFor(g), rules).forEach(m => {
        const rel = relevantPlay(m);
        if (impact !== 'all' && !rel) return;
        if (impact === 'scoring' && !m.scoring) return;
        const p = rel ? { ...rel, relevant: true } : { ...m, hits: [] };
        out.push({ p, game: { away: f.away || info.away, home: f.home || info.home }, gid: info.id, seen: feeds.seenAt(info.id, p.id) });
      });
    });
    return out.sort((a, b) => (b.seen - a.seen) || (b.p.period - a.p.period) || (clockSecs(a.p.clock) - clockSecs(b.p.clock)) || (b.p.seq - a.p.seq));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeds.byId, impact, scope, board, rules]);

  return (
    <div className="stack">
      <div className="feed all-live">
        <div className="feed-bar">
          <Segmented value={scope} onChange={v => { setScope(v); setLimit(SHOW_STEP); }}
            options={[['live', 'Live now' + (liveList.length ? ' · ' + liveList.length : '')], ['week', 'All games this week']]} />
          <Segmented value={impact} onChange={v => { setImpact(v); setLimit(SHOW_STEP); }}
            options={[['all', 'All'], ['mine', 'For/Against'], ['scoring', 'Scoring']]} />
          <div className="feed-meta">
            {liveList.length > 0 && <i className="dot-live" />}
            {list.length} {scope === 'live' ? 'live' : 'started'} {list.length === 1 ? 'game' : 'games'}{liveList.length ? ' · updates every 20s' : ''}
            {feeds.at ? ' · ' + new Date(feeds.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
          </div>
        </div>
        {feeds.error && <div className="banner err"><Icon.alert size={16} sw={2.5} /><span>{feeds.error}</span></div>}
        {!list.length && (
          <div className="feed-empty">
            {scope === 'live' && started.length
              ? <span>No games are live right now. <button className="text-btn" onClick={() => setScope('week')}>Show all games this week</button></span>
              : 'Nothing to show yet. Plays appear once games kick off.'}
          </div>
        )}
        {list.length > 0 && !feeds.loaded && !feeds.error && <div className="feed-empty">Loading plays…</div>}
        {feeds.loaded && list.length > 0 && !items.length && !feeds.error && (
          <div className="feed-empty">No plays match these filters yet.</div>
        )}
        {items.slice(0, limit).map(({ p, game, gid, seen }) => (
          <PlayCard key={gid + ':' + p.id} p={p} game={game} scored={scored} isNew={seen > startedAt.current} score={game} />
        ))}
        {items.length > limit && <button className="pill-btn wide" onClick={() => setLimit(l => l + SHOW_STEP)}>Show {Math.min(SHOW_STEP, items.length - limit)} more</button>}
        {feeds.loaded && list.length > 0 && <div className="feed-foot">{impact === 'all' ? 'Every play in these games. Plays that matter to your teams are highlighted.' : 'Only plays that gain or lose fantasy points for a player you have or are facing, or injure one of them.'} Green helps you, red hurts you. Point swings are estimates using each league's own scoring where known; your leagues' real totals come from their sites.</div>}
      </div>
    </div>
  );
}

// An open game: Players, Play-by-Play or Recap, one at a time. Each game keeps its own choice, and only the chosen
// section is drawn (and only Play-by-Play and Recap fetch the plays).
function GameBody({ game, info, helper, scored, leagues }) {
  const [tab, setTab] = useState('players');
  return (
    <div className="gbody">
      <Segmented value={tab} onChange={setTab} options={[['players', 'Players'], ['plays', 'Play-by-Play'], ['recap', 'Recap']]} />
      {tab === 'players' ? <GamePlayers game={game} /> : <Feed game={game} info={info} helper={helper} scored={scored} leagues={leagues} mode={tab} />}
    </div>
  );
}

// The players in one game who are on your teams or the teams you face: marked For or Against, with their leagues.
function GamePlayers({ game }) {
  const colorOf = useLeagueColor();
  const rows = [...game.mine.map(p => ({ p, side: 'mine' })), ...game.theirs.map(p => ({ p, side: 'opp' }))];
  if (!rows.length) return null;
  return (
    <div className="gp">
      {rows.map(({ p, side }) => (
        <div className={'gp-row ' + side} key={side + p.uid}>
          <Avatar p={p} size={30} side={side} />
          <div className="gp-main">
            <span className="gp-name">{p.name}</span>
            <span className="gp-lgs">{p.leagues.map(l => <span key={l} className="lg-chip" style={{ '--lc': colorOf(l) }}><i />{l}</span>)}</span>
          </div>
          <span className={'gp-tag ' + side}>{side === 'mine' ? 'For' : 'Against'}</span>
        </div>
      ))}
    </div>
  );
}

const ORDER = { in: 0, pre: 1, post: 2 };

export function PlaysScreen({ games, board, boardError, helper, scored, leagues, sel, onSel }) {
  const [open, setOpen] = useState([]);                 // game keys that are expanded
  const [view, setView] = useState('games');
  const toggle = k => setOpen(o => o.includes(k) ? o.filter(x => x !== k) : [...o, k]);
  const list = games
    .map(g => ({ g, info: boardFor(board, g.key) }))
    .sort((a, b) => (ORDER[a.info ? a.info.state : 'pre'] - ORDER[b.info ? b.info.state : 'pre']));

  const nLive = list.filter(x => x.info && x.info.state === 'in').length;

  return (
    <div className="stack">
      <Segmented value={view} onChange={setView} options={[['games', 'By game'], ['all', 'All plays' + (nLive ? ' · ' + nLive + ' live' : '')]]} />
      {view === 'games' && list.length > 1 && (
        <button className="text-btn pg-all" onClick={() => setOpen(open.length ? [] : list.map(x => x.g.key))}>{open.length ? 'Collapse all games' : 'Expand all games'}</button>
      )}
      <LeagueFilter leagues={leagues} sel={sel} onChange={onSel} />
      {!list.length && (
        <div className="card empty">
          <Icon.activity size={28} />
          <div className="empty-t">{sel.length ? 'No games for these leagues' : 'No games with your players'}</div>
          <div className="empty-d">{sel.length ? 'Pick more leagues above, or choose All leagues.' : 'Once your leagues have lineups for this week, their games show up here.'}</div>
        </div>
      )}
      {boardError && <div className="banner err"><Icon.alert size={16} sw={2.5} /><span>{boardError} Scores and plays will show once ESPN is reachable.</span></div>}
      {view === 'all' && <AllLive games={games} board={board} helper={helper} scored={scored} leagues={leagues} />}
      {view === 'games' && list.map(({ g, info }) => {
        const isOpen = open.includes(g.key);
        return (
          <section key={g.key} className={'card pgame' + (isOpen ? ' open' : '')}>
            <button className="pgame-head" onClick={() => toggle(g.key)} aria-expanded={isOpen}>
              <div className="pgame-row">
                <GameScore game={g} info={info} />
                <GameStatus game={g} info={info} />
              </div>
              <div className="pgame-sub">
                {info && info.state === 'in' && info.down
                  ? <span className="pgame-down">{info.possession && <b>{info.possession}</b>} {info.down}{info.redZone ? ' · Red zone' : ''}</span>
                  : <span className="pgame-down">{g.time}</span>}
                <span className="pgame-count">
                  {g.mine.length > 0 && <span className="cnt mine"><i />{g.mine.length}</span>}
                  {g.theirs.length > 0 && <span className="cnt opp"><i />{g.theirs.length}</span>}
                  <span className="chev" aria-hidden="true"><Icon.chevron size={18} sw={2.5} /></span>
                </span>
              </div>
            </button>
            {isOpen && <GameBody game={g} info={info} helper={helper} scored={scored} leagues={leagues} />}
          </section>
        );
      })}
    </div>
  );
}
