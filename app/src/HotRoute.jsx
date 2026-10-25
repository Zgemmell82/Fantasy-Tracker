import { useEffect, useMemo, useState } from 'react';
import { BOOM_MIN_GAIN, BOOM_RATIO, hotRoute } from './lib/hotroute.js';
import { gamesLeft, pathsFor } from './lib/pathfacts.js';
import { loadProjections, pastProjections } from './lib/projections.js';
import { buildHistory } from './lib/history.js';
import { gameState } from './lib/remaining.js';
import { Avatar, Icon, LeagueFilter, PosChip, Segmented, Sheet, useLeagueColor } from './ui.jsx';
import Radio from './Radio.jsx';
import { RADIO_ENABLED } from './lib/features.js';
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

// One player: how much your win chance moves if he reaches his boom number, across your leagues, and why.
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
            const o = l.over == null ? null : Math.round(l.over * 100);
            // Green when it's good for you: a player of yours over his projection, or one you're facing under it.
            const good = o == null || o === 0 ? '' : ((o > 0) === (l.side === 'mine') ? 'up' : 'down');
            return (
              <div key={l.league + l.side} className={'hr-line' + (l.boom ? ' boom' : '')}>
                <span className="hr-lname" style={{ '--lc': colorOf(l.league) }}><i />{l.league}</span>
                <span className={'hr-role ' + l.side}>{l.side === 'mine' ? 'Yours' : 'Against'}</span>
                <b className={'hr-over ' + (good || 'none')}>{o == null ? '—' : sgn(o)}</b>
                <span className="hr-pts">{l.pts == null || !l.started ? '—' : fmtPts(l.pts)}<i> (proj: {l.proj == null ? '—' : fmtPts(Math.round(l.proj * 10) / 10)})</i></span>
                <span className="hr-sit">{l.done ? 'final' : situation(l.diff)}{tone === 'wash' && !l.done && pct(l.swing) !== 0 ? ' · ' + sgn(pct(l.swing)) + ' if he scores ' + fmtPts(l.boomPts) : ''}</span>
              </div>
            );
          })}
        </div>
      </div>
      {tone === 'wash' && (
        <div className="hr-net"><b>{sgn(pct(r.net))}</b><span>net across<br />your leagues</span></div>
      )}
      {tone !== 'wash' && tone !== 'boom' && (
        <div className="hr-net"><b>{sgn(pct(r.net))}</b><span>your win chance<br />if he scores {boomNeed(r)} pts</span></div>
      )}
    </div>
  );
}

const FIVE = 5;
// The points he needs to boom. If leagues score him differently, the higher number.
const boomNeed = r => fmtPts(Math.max(...r.lines.map(l => l.boomPts)));

// One player in a Root for / Root against column: who he's with in which leagues, and how much he moves your odds.
function Mini({ r, tone, board }) {
  const colorOf = useLeagueColor();
  const side = tone === 'for' ? 'mine' : 'opp';
  const live = when(r, board) === 'Live';
  const p = pct(r.net);
  return (
    <div className={'hr-mini ' + tone}>
      <div className="hr-mini-who"><Avatar p={r.player} size={24} side={side} /><span className="hr-name">{r.player.name}</span></div>
      <div className="hr-mini-body">
      <div className="hr-mini-main">
        <div className="hr-meta"><PosChip pos={r.player.pos} /><span>{r.player.team}</span>{live ? <em className="live"><i />Live</em> : <em>{when(r, board)}</em>}</div>
        <span className="hr-chips">{r.lines.map(l => (
          <span key={l.league + l.side} className={'hr-chip ' + l.side} style={{ '--lc': colorOf(l.league) }}><i />{l.league}<em>{l.side === 'mine' ? 'Yours' : 'Against'}</em></span>
        ))}</span>
      </div>
      <div className="hr-mini-right" title="Combined across all your leagues">
        <b className={'hr-net-n ' + (p > 0 ? 'up' : 'down')}>{sgn(p)}</b>
        <span className="hr-mini-cap">win chance if he scores {boomNeed(r)} pts</span>
      </div>
      </div>
    </div>
  );
}

// Root for and Root against, five each, side by side. Players whose games are over drop out and the next player
// who still has a game to play takes the spot. Booming players are on the BOOM tab, not here.
function Cheer({ hr, board, week }) {
  const [all, setAll] = useState(false);
  const boom = new Set(hr.boom.map(r => r.key));
  // A player who is yours in one league and against you in another is already netted into one number; he's listed on
  // whichever side that number falls.
  const allFor = hr.forPool.filter(r => !boom.has(r.key)), allAgainst = hr.againstPool.filter(r => !boom.has(r.key));
  const fors = all ? allFor : allFor.slice(0, FIVE), against = all ? allAgainst : allAgainst.slice(0, FIVE);
  const more = Math.max(allFor.length, allAgainst.length) > FIVE;
  if (!fors.length && !against.length) return null;
  return (
    <>
    <div className="hr-cols">
      <section className="hr-col">
        <div className="hr-sec-h for"><i />Root for<span>helps you</span></div>
        <div className="card hr-list">{fors.length ? fors.map(r => <Mini key={r.key} r={r} tone="for" board={board} />) : <p className="hr-none">No one left to cheer for.</p>}</div>
      </section>
      <section className="hr-col">
        <div className="hr-sec-h against"><i />Root against<span>hurts you</span></div>
        <div className="card hr-list">{against.length ? against.map(r => <Mini key={r.key} r={r} tone="against" board={board} />) : <p className="hr-none">No one left to cheer against.</p>}</div>
      </section>
    </div>
    {more && <button className="pill-btn wide hr-expand" onClick={() => setAll(v => !v)} aria-expanded={all}>{all ? 'Show top ' + FIVE : 'Show all ' + (allFor.length + allAgainst.length) + ' players'}</button>}
    </>
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

// Each earlier week's Sleeper projections (saved copies, else downloaded once), to judge who boomed in those weeks.
function usePastProjections(week, data) {
  const [lookups, setLookups] = useState({});
  const weeks = Object.keys(data || {}).map(Number).filter(w => w < week).sort((a, b) => a - b).join(',');
  useEffect(() => {
    let stop = false;
    weeks.split(',').filter(Boolean).forEach(w => {
      pastProjections(Number(w)).then(l => { if (!stop && l) setLookups(prev => (prev[w] === l ? prev : { ...prev, [w]: l })); });
    });
    return () => { stop = true; };
  }, [weeks]);
  return lookups;
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

export default function HotRoute({ week, wk, leagues, shown, sel, onSel, board, helper, data }) {
  const proj = useProjections(week);
  const past = usePastProjections(week, data);
  const history = useMemo(() => buildHistory(data, week, leagues, past), [data, week, leagues.join('|'), past]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [help, setHelp] = useState(false);
  const hr = useMemo(() => hotRoute(week, wk, shown, board, undefined, proj.lookup, history), [week, wk, shown, board, proj.lookup, history]);   // eslint-disable-line react-hooks/exhaustive-deps
  const allDone = hr.leagues.length > 0 && hr.leagues.every(o => o.done);
  const [view, setView] = useState('all');          // all | boom
  const gl = gamesLeft(week, board);
  const boomKeys = new Set(hr.boom.map(r => r.key));           // booming players live on the BOOM tab only

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

      {gl.open && hr.leagues.length > 0 && <PathToVictory outlooks={hr.leagues} />}

      {hr.leagues.length > 0 && (
        <section className="hr-sec">
          <div className="hr-sec-h"><i />Where you stand<span>win probability right now</span></div>
          <div className="card hr-leagues">{hr.leagues.map(o => <Standing key={o.name} o={o} />)}</div>
        </section>
      )}

      {(hr.forPool.length > 0 || hr.againstPool.length > 0 || hr.wash.length > 0 || hr.boom.length > 0) && (
        <>
          <div className="hr-ctl">
            <Segmented value={view} onChange={setView} options={[['all', 'All players'], ['boom', 'BOOM' + (hr.boom.length ? ' · ' + hr.boom.length : '')]]} />
          </div>
          {view === 'boom' && <div className="hr-legend"><span className="boom-badge">BOOM</span><span>{boomHelp} Worked out separately for each league.</span></div>}
          <button className="hr-help" onClick={() => setHelp(true)}><Icon.alert size={15} sw={2.5} />How to read these numbers</button>
        </>
      )}
      {view === 'boom' && <Section tone="boom" title="Booming" sub="well over projection in at least one league" rows={hr.boom} board={board} week={week} sort="over" />}
      {view === 'all' && <>
        <Cheer hr={hr} board={board} week={week} />
        <Section tone="wash" title="Two-way players" sub="help you in one league, hurt you in another" rows={hr.wash.filter(r => !boomKeys.has(r.key))} board={board} week={week} sort="swing" />
      </>}
      {view === 'boom' && !hr.boom.length && hr.leagues.length > 0 && (
        <div className="card empty">
          <Icon.route size={28} />
          <div className="empty-t">Nobody is booming yet</div>
          <div className="empty-d">A player shows up here once he's at least 20% and {BOOM_MIN_GAIN} points over his projection in a league.</div>
        </div>
      )}

      {view === 'all' && hr.leagues.length > 0 && !hr.forPool.length && !hr.againstPool.length && !hr.wash.length && (
        <div className="card empty">
          <Icon.route size={28} />
          <div className="empty-t">{allDone ? 'Week ' + week + ' is in the books' : 'Nothing swings your week right now'}</div>
          <div className="empty-d">{allDone ? 'Every player in these leagues has played.' : 'No player left to play moves your win probability much.'}</div>
        </div>
      )}

      {hr.leagues.length > 0 && (
        <p className="hint hr-note">
          Percentages are how your chance to win a league changes if the player scores his boom number (shown under the percentage).{' '}
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

// The direct path to victory in each league: the score now, who is left on each side, and the margin that decides it.
// Facts only: no projections.
const PSTATE = { won: 'Locked win', lost: 'Locked loss', final: 'Final', open: 'Still open' };
const kickoff = g => g ? (((/^(\w{3})/.exec(g.d) || [])[1] || '') + ' ' + ((/(\d+:\d+) ([AP])M/.exec(g.d) || []).slice(1).join('').toLowerCase())).trim() : '';

function Left({ title, tone, list }) {
  return (
    <div className={'pv-left ' + tone}>
      <span className="pv-left-h">{title}</span>
      {list.length === 0 && <span className="pv-none">No one left</span>}
      {list.map(p => (
        <span className="pv-p" key={p.name}>
          <b>{p.name}</b>
          <em>{p.live ? <i className="pv-live"><i />Live</i> : kickoff(p.game)}{p.pts != null ? ' · ' + fmtPts(p.pts) + ' so far' : ''}</em>
        </span>
      ))}
    </div>
  );
}

function PathToVictory({ outlooks }) {
  const colorOf = useLeagueColor();
  const paths = useMemo(() => pathsFor(outlooks), [outlooks]);
  if (!paths.length) return null;
  return (
    <section className="hr-sec">
      <div className="hr-sec-h"><i />Path to victory<span>from the score and who has left to play</span></div>
      <div className="card pv">
        {paths.map(w => (
          <div className={'pv-row ' + w.state} key={w.name}>
            <div className="wp-head">
              <span className="ltag" style={{ '--lc': colorOf(w.name) }}>{w.name}</span>
              <span className={'pv-badge ' + w.state}>{PSTATE[w.state]}</span>
            </div>
            <div className="wp-scores"><span className="mint"><em>You</em><b>{fmtPts(w.me)}</b></span><span className="wp-need">{w.gap > 0 ? 'trailing by ' + fmtPts(w.gap) : w.gap < 0 ? 'leading by ' + fmtPts(-w.gap) : 'tied'}</span><span className="coral"><b>{fmtPts(w.them)}</b><em>Them</em></span></div>
            <p className="pv-line">{w.headline}</p>
            {w.state !== 'final' && (
              <div className="pv-lists"><Left title="Yours left" tone="mine" list={w.mine} /><Left title="Theirs left" tone="opp" list={w.opp} /></div>
            )}
          </div>
        ))}
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
          <p>If this player scores his <i>boom number</i> (120% of his projection, at least 5 points over it; the higher number if your leagues score him differently), how much your chance to win <i>that league</i> changes.</p>
          <div className="ht-ex"><span className="hr-val up">+26%</span><span>he's <b className="mint">yours</b>: him booming <b className="mint">raises</b> your win chance 26 points</span></div>
          <div className="ht-ex"><span className="hr-val down">−10%</span><span>he's <b className="coral">theirs</b>: him booming <b className="coral">lowers</b> your win chance 10 points</span></div>
          <div className="ht-ex"><span className="hr-val none">no effect</span><span>that matchup is basically decided, so his game won't change who wins</span></div>
        </div>
        <div className="ht-block">
          <b>The big number on the right</b>
          <p>Adds his lines up across your leagues. Positive and green means him booming helps you overall, so you root <b className="mint">for</b> him. Negative and red means it hurts you overall, so you root <b className="coral">against</b> him.</p>
        </div>
        <div className="ht-block">
          <b>Why it isn't just for and against</b>
          <p>Say he's yours in a league where you're down 11 (<span className="mint">+34%</span>) and your opponent's in a league you're winning by 80 (<span className="muted">no effect</span>). That adds up to <span className="mint">+34%</span>, so you root for him. A player only cancels out when what he's worth to you and against you balances.</p>
        </div>
      </div>
    </Sheet>
  );
}
