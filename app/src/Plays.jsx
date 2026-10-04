import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchPlays, fetchScoreboard, matchPlays } from './lib/pbp.js';
import { fmtPts } from './lib/games.js';
import { Avatar, Icon, Segmented, TeamLogo, useLeagueColor } from './ui.jsx';

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

export function Feed({ game, info, helper, scored }) {
  const [filter, setFilter] = useState('players');
  const colorOf = useLeagueColor();
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
        return [header,
          <article key={p.id} className={'play' + (p.badge ? ' big' : '') + (feed.isNew(p.id) ? ' new' : '')}>
            <div className="play-when"><b>{qLabel(p.period)}</b><span>{p.clock}</span></div>
            <div className="play-main">
              {(p.badge || p.down) && (
                <div className="play-top">
                  {p.badge && <span className={'pbadge b-' + p.badge.toLowerCase()}>{p.badge}</span>}
                  {p.down && <span className="play-down">{p.down}</span>}
                </div>
              )}
              <div className="play-text">{p.text}</div>
              {p.hits.length > 0 && (
                <div className="hits">
                  {p.hits.map(h => (
                    <span key={h.uid} className={'hit ' + h.side + (scored && scored[h.uid] ? ' done' : '')}>
                      <Avatar p={h} size={22} side={h.side} />
                      <span className="hit-name">{short(h.name)}</span>
                      {h.est !== 0 && <b className={'hit-est' + (h.est < 0 ? ' neg' : '')}>{h.est > 0 ? '+' : ''}{fmtPts(h.est)}</b>}
                      <span className="hit-lg">{h.leagues.map(l => <i key={l} style={{ background: colorOf(l) }} title={l} />)}</span>
                    </span>
                  ))}
                </div>
              )}
              {p.scoring && feed.away && <div className="play-score">{feed.away} {p.awayScore} – {p.homeScore} {feed.home}</div>}
            </div>
          </article>];
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

const ORDER = { in: 0, pre: 1, post: 2 };

export function PlaysScreen({ games, board, boardError, helper, scored }) {
  const [open, setOpen] = useState(null);
  const list = games
    .map(g => ({ g, info: board[g.key] }))
    .sort((a, b) => (ORDER[a.info ? a.info.state : 'pre'] - ORDER[b.info ? b.info.state : 'pre']));

  if (!list.length) {
    return (
      <div className="card empty">
        <Icon.activity size={28} />
        <div className="empty-t">No games with your players</div>
        <div className="empty-d">Once your leagues have lineups for this week, their games show up here.</div>
      </div>
    );
  }

  return (
    <div className="stack">
      {boardError && <div className="banner err"><Icon.alert size={16} sw={2.5} /><span>{boardError} Scores and plays will show once ESPN is reachable.</span></div>}
      {list.map(({ g, info }) => {
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
