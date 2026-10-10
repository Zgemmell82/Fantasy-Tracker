import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchPlays, fetchScoreboard, matchPlays } from './lib/pbp.js';
import { fmtPts } from './lib/games.js';
import { Avatar, Icon, LeagueFilter, Segmented, TeamLogo, useLeagueColor } from './ui.jsx';

const visible = () => document.visibilityState === 'visible';

// Live scores, clocks and ESPN game ids for the week; refreshes every 30s while a game is on.
export function useScoreboard(week, helper, active) {
  const [board, setBoard] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!active) return;
    let stop = false, timer = 0;
    const load = async () => {
      try {
        const sb = await fetchScoreboard(week, helper);
        if (stop) return;
        setBoard(sb);
        setError('');
        if (Object.values(sb).some(g => g.state === 'in')) timer = setTimeout(tick, 30000);
      } catch (e) {
        if (!stop) { setError(e.message); timer = setTimeout(tick, 60000); }
      }
    };
    const tick = () => { if (visible()) load(); else timer = setTimeout(tick, 30000); };
    setBoard({});
    load();
    return () => { stop = true; clearTimeout(timer); };
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
    <article className={'play' + (p.badge ? ' big' : '') + (isNew ? ' new' : '')}>
      <div className="play-when"><b>{qLabel(p.period)}</b><span>{p.clock}</span></div>
      <div className="play-main">
        {(game || p.badge || p.down) && (
          <div className="play-top">
            {game && <span className="play-game"><TeamLogo team={game.away} size={16} />{game.away} @ {game.home}<TeamLogo team={game.home} size={16} /></span>}
            {p.badge && <span className={'pbadge b-' + p.badge.toLowerCase()}>{p.badge}</span>}
            {p.down && <span className="play-down">{p.down}</span>}
          </div>
        )}
        <div className="play-text">{p.text}</div>
        {p.hits.length > 0 && (
          <div className="hits">
            {p.hits.map(h => (
              <div key={h.uid} className={'hit ' + h.side + (scored && scored[h.uid] ? ' done' : '')}>
                <div className="hit-top">
                  <Avatar p={h} size={22} side={h.side} />
                  <span className="hit-name">{short(h.name)}</span>
                  {h.est !== 0 && <b className={'hit-est' + (h.est < 0 ? ' neg' : '')}>{h.est > 0 ? '+' : ''}{fmtPts(h.est)}</b>}
                </div>
                <div className="hit-lgs">
                  {h.leagues.map(l => (
                    <span key={l} className={'lg-chip ' + h.side} style={{ '--lc': colorOf(l) }}>
                      <i />{l}<em>{h.side === 'mine' ? 'FOR you' : 'AGAINST you'}</em>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {p.scoring && score && <div className="play-score">{score.away} {p.awayScore} – {p.homeScore} {score.home}</div>}
      </div>
    </article>
  );
}

export function Feed({ game, info, helper, scored }) {
  const [filter, setFilter] = useState('players');
  const live = info && info.state === 'in';
  const feed = useFeed(info && info.state !== 'pre' ? info.id : null, live, helper);
  const tracked = useMemo(() => trackedFor(game), [game]);
  const plays = useMemo(() => feed.plays ? matchPlays(feed.plays, tracked).reverse() : null, [feed.plays, tracked]);

  if (!info) return <div className="feed"><div className="feed-empty">Looking up this game on ESPN…</div></div>;
  if (info.state === 'pre') return <div className="feed"><div className="feed-empty"><Icon.clock size={18} />Play-by-play starts at kickoff · {game.time}</div></div>;

  const shown = !plays ? [] : plays.filter(p => filter === 'all' || (filter === 'players' ? p.hits.length : p.scoring));
  let lastQ = null;

  return (
    <div className="feed">
      <div className="feed-bar">
        <Segmented value={filter} onChange={setFilter} options={[['all', 'All'], ['players', 'Players'], ['scoring', 'Scoring']]} />
        <div className="feed-meta">
          {live ? <><i className="dot-live" />Live · updates every 20s</> : 'Final'}
          {feed.at ? ' · ' + new Date(feed.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
        </div>
      </div>
      {feed.error && <div className="banner err"><Icon.alert size={16} sw={2.5} /><span>{feed.error}</span></div>}
      {!plays && !feed.error && <div className="feed-empty">Loading plays…</div>}
      {plays && !shown.length && (
        <div className="feed-empty">
          {filter === 'players' ? 'None of your tracked players have shown up in a play yet.' : filter === 'scoring' ? 'No scoring plays yet.' : 'No plays yet.'}
        </div>
      )}
      {shown.map(p => {
        const header = p.period !== lastQ ? <div className="q-sep" key={'q' + p.period + p.id}>{qTitle(p.period)}</div> : null;
        lastQ = p.period;
        return [header, <PlayCard key={p.id} p={p} isNew={feed.isNew(p.id)} scored={scored} score={feed.away ? { away: feed.away, home: feed.home } : null} />];
      })}
      {plays && <div className="feed-foot">Point swings are half-PPR estimates; your leagues' real totals come from Sleeper and ESPN.</div>}
    </div>
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
  if (info && info.state === 'in') return <span className="spill live"><i />{info.detail || 'Live'}</span>;
  if (info && info.state === 'post') return <span className="spill final">{info.detail || 'Final'}</span>;
  return <span className="spill">{info ? info.detail : game.status}</span>;
}

const clockSecs = c => { const m = /^(\d+):(\d+)/.exec(c || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };

// Several games' plays at once, refreshed every 20s while any of them is live. Plays are ordered newest first: ones that arrived while
// the screen was open first, then by quarter and clock (the best ordering across games the data allows).
function useGameFeeds(list, helper, active) {
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
  const [impact, setImpact] = useState('all');          // all | mine | opp | scoring
  const [limit, setLimit] = useState(SHOW_STEP);
  const started = games.map(g => ({ g, info: board[g.key] })).filter(x => x.info && x.info.state !== 'pre');
  const liveList = started.filter(x => x.info.state === 'in');
  const list = scope === 'live' ? liveList : started;
  const feeds = useGameFeeds(list, helper, list.length > 0);
  const startedAt = useRef(Date.now());

  // Every play that involves any tracked player, narrowed by the chosen leagues and side.
  const items = useMemo(() => {
    const out = [];
    list.forEach(({ g, info }) => {
      const f = feeds.byId[info.id];
      if (!f) return;
      matchPlays(f.plays, trackedFor(g)).forEach(p => {
        const hits = p.hits.filter(h => (impact !== 'mine' || h.side === 'mine') && (impact !== 'opp' || h.side === 'opp'));
        if (!hits.length || (impact === 'scoring' && !p.scoring)) return;
        out.push({ p: { ...p, hits }, game: { away: f.away || info.away, home: f.home || info.home }, gid: info.id, seen: feeds.seenAt(info.id, p.id) });
      });
    });
    return out.sort((a, b) => (b.seen - a.seen) || (b.p.period - a.p.period) || (clockSecs(a.p.clock) - clockSecs(b.p.clock)) || (b.p.seq - a.p.seq));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeds.byId, impact, scope, board]);

  return (
    <div className="stack">
      <div className="feed all-live">
        <div className="feed-bar">
          <Segmented value={scope} onChange={v => { setScope(v); setLimit(SHOW_STEP); }}
            options={[['live', 'Live now' + (liveList.length ? ' · ' + liveList.length : '')], ['week', 'All games this week']]} />
          <Segmented value={impact} onChange={v => { setImpact(v); setLimit(SHOW_STEP); }} tone={v => v === 'opp' ? 'coral' : ''}
            options={[['all', 'All'], ['mine', 'For me'], ['opp', 'Against'], ['scoring', 'Scoring']]} />
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
              : 'Nothing to show yet. Plays appear once games with your players, or your opponents\', kick off.'}
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
        {feeds.loaded && list.length > 0 && <div className="feed-foot">Every play that touches a player in any of your leagues. Point swings are half-PPR estimates; your leagues' real totals come from their sites.</div>}
      </div>
    </div>
  );
}

const ORDER = { in: 0, pre: 1, post: 2 };

export function PlaysScreen({ games, board, boardError, helper, scored, leagues, sel, onSel }) {
  const [open, setOpen] = useState(null);
  const [view, setView] = useState('games');
  const list = games
    .map(g => ({ g, info: board[g.key] }))
    .sort((a, b) => (ORDER[a.info ? a.info.state : 'pre'] - ORDER[b.info ? b.info.state : 'pre']));

  const nLive = list.filter(x => x.info && x.info.state === 'in').length;

  return (
    <div className="stack">
      <Segmented value={view} onChange={setView} options={[['games', 'By game'], ['all', 'All plays' + (nLive ? ' · ' + nLive + ' live' : '')]]} />
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
        const isOpen = open === g.key;
        return (
          <section key={g.key} className={'card pgame' + (isOpen ? ' open' : '')}>
            <button className="pgame-head" onClick={() => setOpen(isOpen ? null : g.key)} aria-expanded={isOpen}>
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
            {isOpen && <Feed game={g} info={info} helper={helper} scored={scored} />}
          </section>
        );
      })}
    </div>
  );
}
