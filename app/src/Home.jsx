import { useMemo, useState } from 'react';
import { leagueOutlook } from './lib/hotroute.js';
import { leagueGlance } from './lib/home.js';
import { positionRank } from './lib/lineup.js';
import { fmtPts } from './lib/games.js';
import { MatchCell } from './MatchCell.jsx';
import { useProjections } from './HotRoute.jsx';
import { Icon, useLeagueColor } from './ui.jsx';

const proj1 = n => (Math.round(n * 10) / 10).toFixed(1);

// Starters in the order the Leagues matchup shows them for sources that report slots by position.
const ordered = (list, how) => (how === 'espn' || how === 'mfl' || how === 'yahoo')
  ? list.map((p, i) => [p, i]).sort((a, b) => positionRank(a[0].pos) - positionRank(b[0].pos) || a[1] - b[1]).map(x => x[0])
  : list;

// Every league's matchup at a glance: one summary strip, then a collapsible section per league with your starters,
// their live scores and projected finishes, and your total against your opponent's.
export default function LeagueBoard({ week, wk, names, board, onMatchup, synced = {} }) {
  const colorOf = useLeagueColor();
  const proj = useProjections(week);
  const [shut, setShut] = useState([]);                        // leagues folded away
  const rows = useMemo(() => names.map(name => {
    const l = wk[name];
    const has = !!(l && (l.mine.length || l.opp.length));
    const o = leagueOutlook(week, l, board, undefined, proj.lookup);
    return { name, l, has, o, g: leagueGlance(o, has) };
  }), [names, wk, week, board, proj.lookup]);

  if (!names.length) return null;
  const toggle = n => setShut(s => s.includes(n) ? s.filter(x => x !== n) : [...s, n]);
  const jump = n => { setShut(s => s.filter(x => x !== n)); document.getElementById('hb-' + encodeURIComponent(n))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <>
      <section className="card hb-strip" aria-label="All leagues at a glance">
        <div className="hb-strip-h">All leagues<span>{proj.loading ? 'loading projections…' : 'score · projected finish'}</span></div>
        {rows.map(({ name, g, o, has }) => (
          <button className="hb-srow" key={name} onClick={() => jump(name)}>
            <span className="ltag" style={{ '--lc': colorOf(name) }}>{name}</span>
            <span className="hb-nums">
              <b>{has && !o.approx ? fmtPts(o.me) + ' – ' + fmtPts(o.them) : '—'}</b>
              <em>{g.myProj != null ? 'proj ' + proj1(g.myProj) + ' – ' + proj1(g.themProj) : ''}</em>
            </span>
            <span className={'hb-pill ' + g.tone}><i />{g.label}</span>
          </button>
        ))}
      </section>

      {rows.map(({ name, l, has, o, g }) => {
        const open = !shut.includes(name);
        return (
          <section className="card hb" key={name} id={'hb-' + encodeURIComponent(name)}>
            <button className="hb-head" onClick={() => toggle(name)} aria-expanded={open}>
              <span className="ltag" style={{ '--lc': colorOf(name) }}>{name}</span>
              <span className={'hb-pill ' + g.tone}><i />{g.label}</span>
              <span className={'chev' + (open ? ' open' : '')} aria-hidden="true"><Icon.chevron size={16} sw={2.5} /></span>
            </button>
            {open && <SyncNote s={synced[name + ':' + week]} at={l && l.at} />}
            {open && (!has ? (
              <p className="hb-empty">No lineup for week {week} yet. Link this league or add starters from the Locker Room tab.</p>
            ) : (
              <>
                <div className="hb-totals">
                  <div className="hb-side mine"><span>You</span><b>{o.approx ? '—' : fmtPts(o.me)}</b><em>{g.myProj != null ? 'projected ' + proj1(g.myProj) : ''}</em></div>
                  <div className="hb-vs">vs</div>
                  <div className="hb-side opp"><span>Opponent</span><b>{o.approx ? '—' : fmtPts(o.them)}</b><em>{g.themProj != null ? 'projected ' + proj1(g.themProj) : ''}</em></div>
                </div>
                <Starters list={l.mine} how={l.how} o={o} week={week} board={board} />
                <button className="hb-more" onClick={() => onMatchup(name)}>Full matchup with {l.opp.length} opponent starters<Icon.chevron size={14} sw={2.5} /></button>
              </>
            ))}
          </section>
        );
      })}
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

function Starters({ list, how, o, week, board }) {
  const finish = useMemo(() => {
    const m = new Map();
    o.mine.forEach(x => m.set(x.p, { total: (typeof x.p.pts === 'number' ? x.p.pts : 0) + x.mean, left: x.f > 0, real: x.projected }));
    return m;
  }, [o]);
  if (!list.length) return <p className="hb-empty">No starters yet.</p>;
  return <div className="hb-list">{ordered(list, how).map((p, i) => <MatchCell key={p.uid || p.name + i} p={p} side="mine" week={week} board={board} fin={finish.get(p)} />)}</div>;
}
