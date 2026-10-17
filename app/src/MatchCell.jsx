import { Avatar, PosChip } from './ui.jsx';
import { boardFor } from './lib/pbp.js';
import { fmtPts } from './lib/games.js';
import { gameFor, gameState } from './lib/remaining.js';
import { normTeam } from './lib/teams.js';

// True while a player's team has the ball in the red zone (his team is the one in possession).
export const inRz = (board, g, p) => { const i = !g.bye && boardFor(board, g.key); return !!(i && i.state === 'in' && i.redZone && i.possession && i.possession === normTeam(p.team)); };

// One starter in the matchup: photo, name, position and team, and either their points or when they play.
export function MatchCell({ p, side, week, board, fin }) {
  if (!p) return <div className="mu-cell empty" />;
  const g = gameFor(week, p.team);
  const state = g ? gameState(g, board) : null;
  const time = g && state === 'pre' ? ((/^(\w{3})/.exec(g.d) || [])[1] || '') + ' ' + ((/(\d+:\d+) ([AP])M/.exec(g.d) || []).slice(1).join('').toLowerCase()) : '';
  const has = typeof p.pts === 'number';
  return (
    <div className={'mu-cell ' + side}>
      <Avatar p={p} size={30} side={side} />
      <div className="mu-main">
        <span className="mu-name">{p.name}</span>
        <span className="mu-meta"><PosChip pos={p.pos} /><span>{p.team}</span>
          {!g ? <em>Bye</em> : state === 'in' ? <em className="live"><i />Live</em> : state === 'pre' ? <em>{time}</em> : <em>Final</em>}
          {g && inRz(board, { key: g.a + '@' + g.h }, p) && <em className="flag rz">RZ</em>}
        </span>
      </div>
      <span className="mu-right">
        <b className={'mu-pts' + (has ? '' : ' none')}>{has ? fmtPts(p.pts) : '—'}</b>
        {fin && fin.left && <span className="mu-proj" title={fin.real ? "Sleeper's projection" : 'Position average'}>proj {fin.total.toFixed(1)}{fin.real ? '' : '~'}</span>}
      </span>
    </div>
  );
}
