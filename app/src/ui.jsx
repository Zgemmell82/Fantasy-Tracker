import { createContext, useContext, useEffect, useState } from 'react';
import { LEAGUE_COLORS } from './lib/account.js';

// ── Icons (Lucide-style strokes) ─────────────────────────
const I = ({ d, size = 20, sw = 2, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d ? <path d={d} /> : children}
  </svg>
);
export const Icon = {
  refresh: p => <I {...p}><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></I>,
  football: p => <I {...p}><path d="M20.5 3.5c-5-1-11 0-14.5 3.5S2.5 16.5 3.5 20.5c4 1 11 0 14.5-3.5s3.5-9.5 2.5-13.5Z" /><path d="m9 15 6-6" /><path d="m10.5 10.5 1 1" /><path d="m12.5 8.5 1 1" /><path d="m8.5 12.5 1 1" /><path d="M4 14l6 6" /><path d="M14 4l6 6" /></I>,
  trophy: p => <I {...p}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></I>,
  check: p => <I {...p} d="M20 6 9 17l-5-5" />,
  alert: p => <I {...p}><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></I>,
  clock: p => <I {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></I>,
  search: p => <I {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></I>,
  plus: p => <I {...p} d="M12 5v14M5 12h14" />,
  minus: p => <I {...p} d="M5 12h14" />,
  pencil: p => <I {...p}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></I>,
  link: p => <I {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></I>,
  activity: p => <I {...p} d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  chevron: p => <I {...p} d="m6 9 6 6 6-6" />,
  lock: p => <I {...p}><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></I>,
  settings: p => <I {...p}><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></I>,
  trash: p => <I {...p}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></I>,
  up: p => <I {...p} d="m18 15-6-6-6 6" />,
  down: p => <I {...p} d="m6 9 6 6 6-6" />
};

// ── Teams, positions, leagues ────────────────────────────
const ESPN_ABBR = { LA: 'lar', WAS: 'wsh' };
export const teamLogo = t => 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/' + (ESPN_ABBR[t] || String(t).toLowerCase()) + '.png&h=96&w=96';

export function TeamLogo({ team, size = 28 }) {
  const [bad, setBad] = useState(false);
  if (!team || bad) return <span className="tlogo tlogo-txt" style={{ width: size, height: size }}>{team || '?'}</span>;
  return <img className="tlogo" src={teamLogo(team)} width={size} height={size} alt="" loading="lazy" onError={() => setBad(true)} />;
}

export const POS_COLOR = { QB: '#ff5c8a', RB: '#20d6bf', WR: '#5aa9ff', TE: '#ffb259', K: '#c38bff', DEF: '#c4946a' };
export const posColor = p => POS_COLOR[p] || '#8b95a9';

export function PosChip({ pos }) {
  return <span className="pos" style={{ '--pc': posColor(pos) }}>{pos === 'DEF' ? 'DEF' : pos || '—'}</span>;
}

export { LEAGUE_COLORS };
export const leagueColor = (name, all) => LEAGUE_COLORS[Math.max(0, all.indexOf(name)) % LEAGUE_COLORS.length];

// League filter chips. sel lists the chosen leagues; empty means all leagues. Tap leagues to add or drop them.
export function LeagueFilter({ leagues, sel, onChange }) {
  const colorOf = useLeagueColor();
  if (leagues.length < 2) return null;
  const toggle = l => {
    const next = sel.includes(l) ? sel.filter(x => x !== l) : [...sel, l];
    onChange(next.length === leagues.length ? [] : next);
  };
  return (
    <div className="lg-filter" role="group" aria-label="Filter by league">
      <button className={'lg-pick all' + (!sel.length ? ' on' : '')} style={{ '--lc': '#eef1f7' }} onClick={() => onChange([])} aria-pressed={!sel.length}>All leagues</button>
      {leagues.map(l => {
        const on = !sel.length || sel.includes(l);
        return (
          <button key={l} className={'lg-pick' + (on ? ' on' : '') + (sel.length && on ? ' picked' : '')} style={{ '--lc': colorOf(l) }} onClick={() => toggle(l)} aria-pressed={sel.includes(l)}>
            <i />{l}
          </button>
        );
      })}
    </div>
  );
}

// Each league's chosen colour, provided by App so tags and dots anywhere can look it up by name.
export const LeagueColors = createContext(name => LEAGUE_COLORS[0]);
export const useLeagueColor = () => useContext(LeagueColors);

// Player photo from Sleeper or ESPN when we know the id, else the team logo.
// side 'mine' rings the photo green, 'opp' red; otherwise it takes the position colour.
export function Avatar({ p, size = 40, side }) {
  const src = p.sid ? 'https://sleepercdn.com/content/nfl/players/thumb/' + p.sid + '.jpg'
    : p.eid ? 'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/' + p.eid + '.png&w=96&h=70'
    : null;
  const [bad, setBad] = useState(false);
  return (
    <span className={'avatar' + (side ? ' ring-' + side : '')} style={{ width: size, height: size, '--pc': posColor(p.pos) }}>
      {src && !bad
        ? <img src={src} alt="" loading="lazy" onError={() => setBad(true)} />
        : <TeamLogo team={p.team} size={Math.round(size * 0.62)} />}
    </span>
  );
}

// ── Controls ─────────────────────────────────────────────
export function Segmented({ value, options, onChange, tone }) {
  const i = Math.max(0, options.findIndex(o => o[0] === value));
  return (
    <div className="segmented" role="tablist" style={{ '--n': options.length, '--i': i }}>
      <span className={'seg-thumb' + (tone && tone(value) ? ' ' + tone(value) : '')} aria-hidden="true" />
      {options.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={k === value} className={k === value ? 'on' : ''} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label, hint }) {
  return (
    <button className="switch-row" role="switch" aria-checked={!!on} onClick={() => onChange(!on)}>
      <span className="switch-text">
        <span className="switch-label">{label}</span>
        {hint && <span className="switch-hint">{hint}</span>}
      </span>
      <span className={'switch' + (on ? ' on' : '')} aria-hidden="true"><span /></span>
    </button>
  );
}

// Bottom sheet that slides up over the app; tapping outside or Done closes it.
export function Sheet({ title, subtitle, onClose, children, label }) {
  const [closing, setClosing] = useState(false);
  const close = () => { setClosing(true); setTimeout(onClose, 220); };
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={'sheet-wrap' + (closing ? ' closing' : '')} role="dialog" aria-modal="true" aria-label={label || title}>
      <div className="backdrop" onClick={close} />
      <div className="sheet">
        <div className="grabber" aria-hidden="true" />
        <div className="sheet-head">
          <div>
            <h2 className="sheet-title">{title}</h2>
            {subtitle && <div className="sheet-sub">{subtitle}</div>}
          </div>
          <button className="text-btn" onClick={close}>Done</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
