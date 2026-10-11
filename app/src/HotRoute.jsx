import { useEffect, useMemo, useState } from 'react';
import { hotRoute } from './lib/hotroute.js';
import { loadProjections } from './lib/projections.js';
import { gameState } from './lib/remaining.js';
import { Avatar, Icon, LeagueFilter, PosChip, useLeagueColor } from './ui.jsx';
import { fmtPts } from './lib/games.js';

const pct = n => Math.round(n * 100);
const sgn = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);

function verdict(o) {
  if (o.done) return o.diff > 0 ? 'Final · Won' : o.diff < 0 ? 'Final · Lost' : 'Final · Tied';
  const w = o.wp;
  return w >= 0.85 ? 'Strong favorite' : w >= 0.6 ? 'Favored' : w > 0.4 ? 'Toss-up' : w > 0.15 ? 'Underdog' : 'Long shot';
}

const situation = diff => Math.abs(diff) < 0.5 ? 'tied' : (diff > 0 ? 'up ' : 'down ') + Math.round(Math.abs(diff));

// Where each league's matchup stands: score and win probability.
function Standing({ o }) {
  const colorOf = useLeagueColor();
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
  const side = tone === 'for' ? 'mine' : tone === 'against' ? 'opp' : undefined;
  const live = when(r, board, week) === 'Live';
  return (
    <div className={'hr-row ' + tone}>
      <Avatar p={r.player} size={42} side={side} />
      <div className="hr-main">
        <div className="hr-name">{r.player.name}</div>
        <div className="hr-meta"><PosChip pos={r.player.pos} /><span>{r.player.team}</span>
          {live ? <em className="live"><i />Live</em> : <em>{when(r, board, week)}</em>}</div>
        <div className="hr-lines">
          {r.lines.map(l => (
            <span key={l.league + l.side} className={'lg-chip ' + l.side} style={{ '--lc': colorOf(l.league) }}>
              <i />{l.league}<em>{l.side === 'mine' ? 'FOR' : 'AGAINST'}</em>
              <span className="hr-sit">{l.done ? 'final' : situation(l.diff)}</span>
              <b>{sgn(pct(l.swing))}</b>
            </span>
          ))}
        </div>
      </div>
      {tone !== 'wash' && (
        <div className="hr-net"><b>{sgn(pct(r.net))}</b><span>swing</span></div>
      )}
    </div>
  );
}

const TOP = 8;

function Section({ title, sub, tone, rows, board, week }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const list = all ? rows : rows.slice(0, TOP);
  return (
    <section className="hr-sec">
      <div className={'hr-sec-h ' + tone}><i />{title}<span>{sub}</span></div>
      <div className="card hr-list">{list.map(r => <Row key={r.key} r={r} tone={tone} board={board} week={week} />)}</div>
      {rows.length > TOP && <button className="pill-btn hr-more" onClick={() => setAll(!all)}>{all ? 'Show fewer' : 'Show all ' + rows.length}</button>}
    </section>
  );
}

// Sleeper's projections for the week; null while loading or if they can't be loaded (the odds then use position averages).
function useProjections(week) {
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

export default function HotRoute({ week, wk, leagues, shown, sel, onSel, board }) {
  const proj = useProjections(week);
  const hr = useMemo(() => hotRoute(week, wk, shown, board, undefined, proj.lookup), [week, wk, shown, board, proj.lookup]);   // eslint-disable-line react-hooks/exhaustive-deps
  const allDone = hr.leagues.length > 0 && hr.leagues.every(o => o.done);

  return (
    <div className="stack">
      <LeagueFilter leagues={leagues} sel={sel} onChange={onSel} />

      {!leagues.length && (
        <div className="card empty">
          <Icon.route size={28} />
          <div className="empty-t">Add a league to run your Hot Route</div>
          <div className="empty-d">Once your leagues have lineups, this shows who to root for and against.</div>
        </div>
      )}

      {hr.leagues.length > 0 && (
        <section className="hr-sec">
          <div className="hr-sec-h"><i />Where you stand<span>win probability right now</span></div>
          <div className="card hr-leagues">{hr.leagues.map(o => <Standing key={o.name} o={o} />)}</div>
        </section>
      )}

      <Section tone="for" title="Root for" sub="a big game here helps you most" rows={hr.rootFor} board={board} week={week} />
      <Section tone="against" title="Root against" sub="a big game here hurts you most" rows={hr.rootAgainst} board={board} week={week} />
      <Section tone="wash" title="Cancels out" sub="helps you in one league, hurts in another" rows={hr.wash} board={board} week={week} />

      {hr.leagues.length > 0 && !hr.rootFor.length && !hr.rootAgainst.length && !hr.wash.length && (
        <div className="card empty">
          <Icon.route size={28} />
          <div className="empty-t">{allDone ? 'Week ' + week + ' is in the books' : 'Nothing swings your week right now'}</div>
          <div className="empty-d">{allDone ? 'Every player in these leagues has played.' : 'No player left to play moves your win probability much.'}</div>
        </div>
      )}

      {hr.leagues.length > 0 && (
        <p className="hint hr-note">
          Swing is how many win-probability points a big game (one standard deviation above average) from a player is worth to you, added up across leagues, so a player against you in a league you're winning big barely counts there.{' '}
          {proj.loading ? 'Loading Sleeper projections…'
            : proj.lookup && hr.projectedLeft > 0 ? 'Odds use Sleeper\'s projections for ' + hr.projectedLeft + ' of the ' + hr.playersLeft + ' player spots still to play' + (hr.projectedLeft < hr.playersLeft ? '; the rest use an average game for their position.' : '.')
            : proj.lookup ? 'Sleeper\'s projections didn\'t match these players, so odds use an average game by position.'
            : 'Couldn\'t load Sleeper projections' + (proj.error ? ' (' + proj.error + ')' : '') + ', so odds use an average game by position.'}
        </p>
      )}
    </div>
  );
}
