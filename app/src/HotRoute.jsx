import { useEffect, useMemo, useState } from 'react';
import { hotRoute } from './lib/hotroute.js';
import { loadProjections } from './lib/projections.js';
import { gameState } from './lib/remaining.js';
import { Avatar, Icon, LeagueFilter, PosChip, Sheet, useLeagueColor } from './ui.jsx';
import { fmtPts } from './lib/games.js';

const pct = n => Math.round(n * 100);
const sgn = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + '%';

function verdict(o) {
  if (o.done) return o.diff > 0 ? 'Final · Won' : o.diff < 0 ? 'Final · Lost' : 'Final · Tied';
  const w = o.wp;
  return w >= 0.85 ? 'Strong favorite' : w >= 0.6 ? 'Favored' : w > 0.4 ? 'Toss-up' : w > 0.15 ? 'Underdog' : 'Long shot';
}

const situation = diff => Math.abs(diff) < 0.5 ? 'matchup is tied' : diff > 0 ? "you're up " + Math.round(diff) : "you're down " + Math.round(-diff);

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
          {r.lines.map(l => {
            const p = pct(l.swing);
            return (
              <div key={l.league + l.side} className="hr-line">
                <span className="hr-lname" style={{ '--lc': colorOf(l.league) }}><i />{l.league}</span>
                <span className={'hr-role ' + l.side}>{l.side === 'mine' ? 'Yours' : 'Theirs'}</span>
                <span className="hr-sit">{l.done ? 'final' : situation(l.diff)}</span>
                <b className={'hr-val ' + (p > 0 ? 'up' : p < 0 ? 'down' : 'none')}>{p === 0 ? 'no effect' : sgn(p)}</b>
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
  const [help, setHelp] = useState(false);
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

      {(hr.rootFor.length > 0 || hr.rootAgainst.length > 0 || hr.wash.length > 0) && (
        <button className="hr-help" onClick={() => setHelp(true)}><Icon.alert size={15} sw={2.5} />How to read these numbers</button>
      )}
      <Section tone="for" title="Root for" sub="a big game helps your win chance" rows={hr.rootFor} board={board} week={week} />
      <Section tone="against" title="Root against" sub="a big game hurts your win chance" rows={hr.rootAgainst} board={board} week={week} />
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

function HowTo({ onClose }) {
  return (
    <Sheet title="Reading Hot Route" subtitle="What the numbers mean" onClose={onClose}>
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
