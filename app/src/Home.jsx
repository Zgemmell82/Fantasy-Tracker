import { useMemo, useState } from 'react';
import { leagueOutlook } from './lib/hotroute.js';
import { leagueGlance } from './lib/home.js';
import { alignByPosition } from './lib/lineup.js';
import { fmtPts } from './lib/games.js';
import { MatchCell } from './MatchCell.jsx';
import { useProjections } from './HotRoute.jsx';
import { Icon, useLeagueColor } from './ui.jsx';

const proj1 = n => (Math.round(n * 10) / 10).toFixed(1);

// Every league's matchup at a glance: one summary strip, then a collapsible section per league with your starters,
// their live scores and projected finishes, and your total against your opponent's.
export default function LeagueBoard({ week, wk, names, board, synced = {} }) {
  const colorOf = useLeagueColor();
  const proj = useProjections(week);
  const [openL, setOpenL] = useState([]);                      // leagues expanded (all start collapsed)
  const rows = useMemo(() => names.map(name => {
    const l = wk[name];
    const has = !!(l && (l.mine.length || l.opp.length));
    const o = leagueOutlook(week, l, board, undefined, proj.lookup);
    return { name, l, has, o, g: leagueGlance(o, has) };
  }), [names, wk, week, board, proj.lookup]);

  if (!names.length) return null;
  const toggle = n => setOpenL(s => s.includes(n) ? s.filter(x => x !== n) : [...s, n]);

  return (
    <>
      <section className="card hb-strip" aria-label="All leagues at a glance">
        <div className="hb-strip-h">All leagues<span>{proj.loading ? 'loading projections…' : 'tap a league to expand'}</span></div>
        {rows.map(({ name, l, g, o, has }) => {
          const open = openL.includes(name);
          return (
            <div className={'hb-item' + (open ? ' open' : '')} key={name}>
              <button className="hb-srow" onClick={() => toggle(name)} aria-expanded={open}>
                <span className="ltag" style={{ '--lc': colorOf(name) }}>{name}</span>
                <span className="hb-nums">
                  <b>{has && !o.approx ? fmtPts(o.me) + ' – ' + fmtPts(o.them) : '—'}</b>
                  <em>{g.myProj != null ? 'proj ' + proj1(g.myProj) + ' – ' + proj1(g.themProj) : ''}</em>
                </span>
                <span className={'hb-pill ' + g.tone}><i />{g.label}</span>
                <span className={'chev' + (open ? ' open' : '')} aria-hidden="true"><Icon.chevron size={16} sw={2.5} /></span>
              </button>
              {open && (
                <div className="hb-body">
                  <SyncNote s={synced[name + ':' + week]} at={l && l.at} />
                  {!has
                    ? <p className="hb-empty">No lineup for week {week} yet. Link this league or add starters from the Locker Room tab.</p>
                    : <Matchup l={l} o={o} week={week} board={board} />}
                </div>
              )}
            </div>
          );
        })}
      </section>
      {!proj.loading && !proj.lookup && rows.some(r => r.has) && (
        <p className="hint">Couldn't load Sleeper projections{proj.error ? ' (' + proj.error + ')' : ''}, so projected finishes use an average game by position.</p>
      )}
    </>
  );
}

// Says when this league's points were last pulled, and warns loudly if the latest pull failed (the numbers shown are then old).
function SyncNote({ s, at }) {
  const failed = s && s.ok === false;
  const when = at ? new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  if (!failed && !when) return null;
  return failed
    ? <div className="banner err hb-sync"><Icon.alert size={15} sw={2.5} /><span>Couldn't refresh this league{s.err ? ': ' + s.err : ''}.{when ? ' Showing points from ' + when + '.' : ''}</span></div>
    : <div className="hb-updated">Points updated {when}</div>;
}

// Both lineups side by side, lined up by position (same layout as the full matchup sheet), with live and projected points.
function Matchup({ l, o, week, board }) {
  const finish = useMemo(() => {
    const m = new Map();
    [...o.mine, ...o.opp].forEach(x => m.set(x.p, { total: (typeof x.p.pts === 'number' ? x.p.pts : 0) + x.mean, left: x.f > 0, real: x.projected }));
    return m;
  }, [o]);
  const byPosition = l.how === 'espn' || l.how === 'mfl' || l.how === 'yahoo';
  const rows = byPosition ? alignByPosition(l.mine, l.opp)
    : Array.from({ length: Math.max(l.mine.length, l.opp.length) }, (_, i) => [l.mine[i], l.opp[i]]);
  if (!rows.length) return <p className="hb-empty">No starters yet.</p>;
  return (
    <div className="mu-grid hb-grid">
      {rows.map(([a, b, flex], i) => (
        <div className={'mu-row' + (flex ? ' flx' : '')} key={i}>
          {flex && <div className="mu-flx">FLX</div>}
          <MatchCell p={a} side="mine" week={week} board={board} fin={finish.get(a)} />
          <MatchCell p={b} side="opp" week={week} board={board} fin={finish.get(b)} />
        </div>
      ))}
    </div>
  );
}
