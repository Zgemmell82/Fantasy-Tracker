import { useEffect, useMemo, useState } from 'react';
import { BOOM_MIN_GAIN, BOOM_RATIO, hotRoute } from './lib/hotroute.js';
import { showWinPath, winPaths } from './lib/winpath.js';
import { loadProjections } from './lib/projections.js';
import { gameState } from './lib/remaining.js';
import { Avatar, Icon, LeagueFilter, PosChip, Segmented, Sheet, useLeagueColor } from './ui.jsx';
import Radio from './Radio.jsx';
import { RADIO_ENABLED } from './lib/features.js';
import { fmtPts } from './lib/games.js';
import { biggestSwings, loadSeries, record, saveSeries } from './lib/timeline.js';

const pct = n => Math.round(n * 100);
const sgn = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + '%';

function verdict(o) {
  if (o.done) return o.diff > 0 ? 'Final · Won' : o.diff < 0 ? 'Final · Lost' : 'Final · Tied';
  const w = o.wp;
  return w >= 0.85 ? 'Strong favorite' : w >= 0.6 ? 'Favored' : w > 0.4 ? 'Toss-up' : w > 0.15 ? 'Underdog' : 'Long shot';
}

const situation = diff => Math.abs(diff) < 0.5 ? 'matchup is tied' : diff > 0 ? "you're up " + Math.round(diff) : "you're down " + Math.round(-diff);

// Where each league's matchup stands: score and win probability.
const clock = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Win chance over the day: a line from first to latest point, with the biggest moves marked and explained.
function Timeline({ points }) {
  const W = 300, H = 70;
  const t0 = points[0].t, span = Math.max(1, points[points.length - 1].t - t0);
  const x = t => 4 + ((t - t0) / span) * (W - 8);
  const y = wp => 4 + (1 - wp) * (H - 8);
  const swings = biggestSwings(points);
  return (
    <div className="hr-tl">
      <svg viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label="Win chance over the day">
        <line x1="0" x2={W} y1={y(0.5)} y2={y(0.5)} className="tl-mid" />
        <polyline className="tl-line" fill="none" points={points.map(p => x(p.t).toFixed(1) + ',' + y(p.wp).toFixed(1)).join(' ')} />
        {swings.map(w => <circle key={w.t} cx={x(w.t)} cy={y(w.wp)} r="3.5" className={w.delta > 0 ? 'tl-up' : 'tl-down'} />)}
      </svg>
      <div className="tl-axis"><span>{clock(t0)}</span><span>{pct(points[points.length - 1].wp)}% now</span></div>
      {swings.length > 0 && (
        <ul className="tl-list">
          {swings.map(w => (
            <li key={w.t} className={w.delta > 0 ? 'up' : 'down'}>
              <b>{(w.delta > 0 ? '+' : '−') + Math.round(Math.abs(w.delta) * 100)}%</b>
              <span>{clock(w.t)}{w.note ? ' · ' + w.note.n + ' (' + (w.note.who === 'mine' ? 'yours' : 'theirs') + ') +' + w.note.d + ' pts' : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Standing({ o, points }) {
  const colorOf = useLeagueColor();
  const [open, setOpen] = useState(false);
  const lead = o.diff > 0 ? 'mine' : o.diff < 0 ? 'opp' : '';
  return (
    <div className="hr-league">
      <div className="hr-lhead">
        <span className="ltag" style={{ '--lc': colorOf(o.name) }}>{o.name}</span>
        <span className="hr-verdict">{verdict(o)}</span>
      </div>
      <div className="hr-score">
        <span className={'mint' + (lead === 'mine' ? ' lead' : '')}><em>You</em><b>{fmtPts(o.me)}</b></span>
        <span className="hr-wp">{o.done ? '' : pct(o.wp) + '%'}</span>
        <span className={'coral' + (lead === 'opp' ? ' lead' : '')}><b>{fmtPts(o.them)}</b><em>Them</em></span>
      </div>
      <div className="hr-bar" aria-hidden="true"><span style={{ width: pct(o.wp) + '%' }} /></div>
      <div className="hr-foot">
        {o.done ? 'Everyone has played' : o.leftMine + ' of yours left · ' + o.leftOpp + ' of theirs left'}
        {o.approx && <span className="hr-approx"> · No scores yet, link this league for real odds</span>}
      </div>
      {points && points.length > 1 && (
        <>
          <button className="hr-tl-btn" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? 'Hide' : 'Show'} win chance timeline</button>
          {open && <Timeline points={points} />}
        </>
      )}
    </div>
  );
}

function when(r, board, week) {
  const g = r.game;
  if (!g) return '';
  const s = gameState(g, board);
  if (s === 'in') return 'Live';
  const t = ((/^(\w{3})/.exec(g.d) || [])[1] || '') + ' ' + ((/(\d+:\d+) ([AP])M/.exec(g.d) || []).slice(1).join('').toLowerCase());
  return t.trim();
}

// One player: how much a big game from him is worth across your leagues, and why.
function Row({ r, tone, board, week }) {
  const colorOf = useLeagueColor();
  const booms = r.lines.filter(l => l.boom).map(l => l.over);
  const best = booms.length ? Math.max(...booms) : null;
  const side = tone === 'for' ? 'mine' : tone === 'against' ? 'opp' : undefined;
  const live = when(r, board, week) === 'Live';
  return (
    <div className={'hr-row ' + tone}>
      <Avatar p={r.player} size={42} side={side} />
      <div className="hr-main">
        <div className="hr-name">{r.player.name}</div>
        <div className="hr-meta"><PosChip pos={r.player.pos} /><span>{r.player.team}</span>
          {live ? <em className="live"><i />Live</em> : <em>{when(r, board, week)}</em>}
          {best != null && <span className="boom-badge" title={boomHelp}>BOOM<em>{sgn(Math.round(best * 100))} over projection</em></span>}</div>
        <div className="hr-lines">
          {r.lines.map(l => {
            const p = pct(l.swing);
            const o = l.over == null ? null : Math.round(l.over * 100);
            // Green when it's good for you: a player of yours over his projection, or one you're facing under it.
            const good = o == null || o === 0 ? '' : ((o > 0) === (l.side === 'mine') ? 'up' : 'down');
            return (
              <div key={l.league + l.side} className={'hr-line' + (l.boom ? ' boom' : '')}>
                <span className="hr-lname" style={{ '--lc': colorOf(l.league) }}><i />{l.league}</span>
                <span className={'hr-role ' + l.side}>{l.side === 'mine' ? 'Yours' : 'Against'}</span>
                <b className={'hr-over ' + (good || 'none')}>{o == null ? '—' : sgn(o)}</b>
                <span className="hr-pts">{l.pts == null || !l.started ? '—' : fmtPts(l.pts)}<i> (proj: {l.proj == null ? '—' : fmtPts(Math.round(l.proj * 10) / 10)})</i></span>
                <span className="hr-sit">{l.done ? 'final' : situation(l.diff) + (p === 0 ? '' : ' · ' + sgn(p) + ' win chance if he booms')}</span>
              </div>
            );
          })}
        </div>
      </div>
      {tone !== 'wash' && (
        <div className="hr-net"><b>{sgn(pct(r.net))}</b><span>your win chance<br />if he booms</span></div>
      )}
    </div>
  );
}

const TOP = 8;
const boomHelp = 'Boom: live score is at least ' + Math.round(BOOM_RATIO * 100) + '% of his original projection in that league\'s scoring, and at least ' + BOOM_MIN_GAIN + ' points over it.';
const bestOver = r => Math.max(...r.lines.map(l => l.over ?? -9));

function Section({ title, sub, tone, rows, board, week, sort }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const sorted = sort === 'over' ? [...rows].sort((a, b) => bestOver(b) - bestOver(a)) : rows;
  const list = all ? sorted : sorted.slice(0, TOP);
  return (
    <section className="hr-sec">
      <div className={'hr-sec-h ' + tone}><i />{title}<span>{sub}</span></div>
      <div className="card hr-list">{list.map(r => <Row key={r.key} r={r} tone={tone} board={board} week={week} />)}</div>
      {rows.length > TOP && <button className="pill-btn hr-more" onClick={() => setAll(!all)}>{all ? 'Show fewer' : 'Show all ' + rows.length}</button>}
    </section>
  );
}

// Sleeper's projections for the week; null while loading or if they can't be loaded (the odds then use position averages).
export function useProjections(week) {
  const [state, setState] = useState({ week: 0, lookup: null, error: '' });
  useEffect(() => {
    let stop = false;
    loadProjections(week)
      .then(lookup => { if (!stop) setState({ week, lookup, error: '' }); })
      .catch(e => { if (!stop) setState({ week, lookup: null, error: e.message }); });
    return () => { stop = true; };
  }, [week]);
  const current = state.week === week;
  return { lookup: current ? state.lookup : null, error: current ? state.error : '', loading: !current };
}

export default function HotRoute({ week, wk, leagues, shown, sel, onSel, board, helper }) {
  const proj = useProjections(week);
  const [help, setHelp] = useState(false);
  const hr = useMemo(() => hotRoute(week, wk, shown, board, undefined, proj.lookup), [week, wk, shown, board, proj.lookup]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [series, setSeries] = useState(() => loadSeries(week));
  useEffect(() => { setSeries(loadSeries(week)); }, [week]);
  useEffect(() => {
    setSeries(prev => {
      const next = record(prev, hr.leagues);
      if (next !== prev) saveSeries(week, next);
      return next;
    });
  }, [hr, week]);
  const allDone = hr.leagues.length > 0 && hr.leagues.every(o => o.done);
  const [view, setView] = useState('all');          // all | boom
  const [sort, setSort] = useState('swing');         // swing | over

  return (
    <div className="stack">
      <LeagueFilter leagues={leagues} sel={sel} onChange={onSel} />

      {RADIO_ENABLED && leagues.length > 0 && <Radio week={week} wk={wk} shown={shown} board={board} helper={helper} hr={hr} />}

      {!leagues.length && (
        <div className="card empty">
          <Icon.route size={28} />
          <div className="empty-t">Add a league to run your Two-Minute Drill</div>
          <div className="empty-d">Once your leagues have lineups, this shows who to root for and against.</div>
        </div>
      )}

      {hr.leagues.length > 0 && (
        <section className="hr-sec">
          <div className="hr-sec-h"><i />Where you stand<span>win probability right now</span></div>
          <div className="card hr-leagues">{hr.leagues.map(o => <Standing key={o.name} o={o} points={(series[o.name] || {}).points} />)}</div>
        </section>
      )}

      {hr.leagues.length > 0 && showWinPath(week, board) && <WinPath outlooks={hr.leagues} />}

      {(hr.rootFor.length > 0 || hr.rootAgainst.length > 0 || hr.wash.length > 0 || hr.boom.length > 0) && (
        <>
          <div className="hr-ctl">
            <Segmented value={view} onChange={setView} options={[['all', 'All players'], ['boom', 'BOOM' + (hr.boom.length ? ' · ' + hr.boom.length : '')]]} />
            <Segmented value={sort} onChange={setSort} options={[['swing', 'Sort: win swing'], ['over', 'Sort: % over proj']]} />
          </div>
          <div className="hr-legend"><span className="boom-badge">BOOM</span><span>{boomHelp} Worked out separately for each league.</span></div>
          <button className="hr-help" onClick={() => setHelp(true)}><Icon.alert size={15} sw={2.5} />How to read these numbers</button>
        </>
      )}
      <Section tone="boom" title="Booming" sub="well over projection in at least one league" rows={hr.boom} board={board} week={week} sort="over" />
      {view === 'all' && <>
        <Section tone="for" title="Root for" sub="a big game helps your win chance" rows={hr.rootFor} board={board} week={week} sort={sort} />
        <Section tone="against" title="Root against" sub="a big game hurts your win chance" rows={hr.rootAgainst} board={board} week={week} sort={sort} />
        <Section tone="wash" title="Cancels out" sub="helps you in one league, hurts in another" rows={hr.wash} board={board} week={week} sort={sort} />
      </>}
      {view === 'boom' && !hr.boom.length && hr.leagues.length > 0 && (
        <div className="card empty">
          <Icon.route size={28} />
          <div className="empty-t">Nobody is booming yet</div>
          <div className="empty-d">A player shows up here once he's at least 20% and {BOOM_MIN_GAIN} points over his projection in a league.</div>
        </div>
      )}

      {view === 'all' && hr.leagues.length > 0 && !hr.rootFor.length && !hr.rootAgainst.length && !hr.wash.length && !hr.boom.length && (
        <div className="card empty">
          <Icon.route size={28} />
          <div className="empty-t">{allDone ? 'Week ' + week + ' is in the books' : 'Nothing swings your week right now'}</div>
          <div className="empty-d">{allDone ? 'Every player in these leagues has played.' : 'No player left to play moves your win probability much.'}</div>
        </div>
      )}

      {hr.leagues.length > 0 && (
        <p className="hint hr-note">
          Percentages are how your chance to win a league changes if the player has a big game.{' '}
          {proj.loading ? 'Loading Sleeper projections…'
            : proj.lookup && hr.projectedLeft > 0 ? 'Odds use Sleeper\'s projections for ' + hr.projectedLeft + ' of the ' + hr.playersLeft + ' player spots still to play' + (hr.projectedLeft < hr.playersLeft ? '; the rest use an average game for their position.' : '.')
            : proj.lookup ? 'Sleeper\'s projections didn\'t match these players, so odds use an average game by position.'
            : 'Couldn\'t load Sleeper projections' + (proj.error ? ' (' + proj.error + ')' : '') + ', so odds use an average game by position.'}
        </p>
      )}

      {help && <HowTo onClose={() => setHelp(false)} />}
    </div>
  );
}

// What each league needs to finish in front: the gap, who can close it, and how likely it is.
const STATUS = { win: 'Win', bubble: 'On the bubble', miracle: 'Need a miracle' };
function WinPath({ outlooks }) {
  const colorOf = useLeagueColor();
  const [how, setHow] = useState(false);
  const paths = useMemo(() => winPaths(outlooks), [outlooks]);
  if (!paths.length) return null;
  const live = paths.filter(w => !w.locked), locked = paths.filter(w => w.locked);
  return (
    <section className="hr-sec">
      <div className="hr-sec-h"><i />What I need to win<span>late games and primetime</span></div>
      <div className="card wp">
        {live.map(w => (
          <div className="wp-row" key={w.name}>
            <div className="wp-head">
              <span className="ltag" style={{ '--lc': colorOf(w.name) }}>{w.name}</span>
              <span className={'wp-status ' + w.status}>{STATUS[w.status]} · {Math.round(w.wp * 100)}%</span>
            </div>
            <div className="wp-scores"><span className="mint"><em>You</em><b>{fmtPts(w.me)}</b></span><span className="wp-need">{w.need > 0 ? 'need ' + fmtPts(w.need) + ' more' : 'ahead of their finish'}</span><span className="coral"><b>{fmtPts(w.them)}</b><em>Them</em></span></div>
            <p className="wp-line">{w.line}</p>
            <div className="wp-foot">{w.mineLeft} of yours left (proj {fmtPts(w.mineRem)}) · {w.oppLeft} of theirs left (proj {fmtPts(w.oppRem)}){w.oppPlayers.length ? ': ' + w.oppPlayers.map(p => p.name.split(' ').slice(-1)[0]).join(', ') : ''}</div>
          </div>
        ))}
        {locked.map(w => (
          <div className="wp-row locked" key={w.name}>
            <div className="wp-head">
              <span className="ltag" style={{ '--lc': colorOf(w.name) }}>{w.name}</span>
              <span className={'wp-status ' + (w.lockedWin ? 'win' : 'miracle')}>{w.lockedWin ? 'Locked win' : 'Locked loss'}</span>
            </div>
            <div className="wp-foot">{fmtPts(w.me)} to {fmtPts(w.them)}. {w.line}</div>
          </div>
        ))}
        <button className="hr-tl-btn" onClick={() => setHow(v => !v)} aria-expanded={how}>{how ? 'Hide' : 'How is this worked out?'}</button>
        {how && (
          <p className="hint">Needed points = their score + what their unfinished players are projected to add − your score. Your best remaining players are added up (by what's left of their Sleeper projection, scaled by the clock) until they cover it. Win chance compares both sides' expected finishes against how much the remaining games can swing it. Win is 70% or better, a miracle is 15% or less, and a league is locked at 99% or once everyone has played.</p>
        )}
      </div>
    </section>
  );
}

function HowTo({ onClose }) {
  return (
    <Sheet title="Reading the Two-Minute Drill" subtitle="What the numbers mean" onClose={onClose}>
      <div className="howto">
        <div className="ht-block">
          <b>The percentage on each line</b>
          <p>If this player has a <i>big game</i> (roughly one standard deviation above his projection), how much your chance to win <i>that league</i> changes.</p>
          <div className="ht-ex"><span className="hr-val up">+26%</span><span>he's <b className="mint">yours</b>: a big game <b className="mint">raises</b> your win chance 26 points</span></div>
          <div className="ht-ex"><span className="hr-val down">−10%</span><span>he's <b className="coral">theirs</b>: a big game <b className="coral">lowers</b> your win chance 10 points</span></div>
          <div className="ht-ex"><span className="hr-val none">no effect</span><span>that matchup is basically decided, so his game won't change who wins</span></div>
        </div>
        <div className="ht-block">
          <b>The big number on the right</b>
          <p>Adds his lines up across your leagues. Positive and green means a big game from him helps you overall, so you root <b className="mint">for</b> him. Negative and red means it hurts you overall, so you root <b className="coral">against</b> him.</p>
        </div>
        <div className="ht-block">
          <b>Why it isn't just for and against</b>
          <p>Say he's yours in a league where you're down 11 (<span className="mint">+34%</span>) and your opponent's in a league you're winning by 80 (<span className="muted">no effect</span>). That adds up to <span className="mint">+34%</span>, so you root for him. A player only cancels out when what he's worth to you and against you balances.</p>
        </div>
      </div>
    </Sheet>
  );
}
